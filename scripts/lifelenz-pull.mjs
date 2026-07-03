#!/usr/bin/env node
// scripts/lifelenz-pull.mjs — LifeLenz daily schedule sync
// Runs in GitHub Actions (or locally). Uses Playwright to login and capture
// the session token, then calls the LifeLenz API directly for all stores.
//
// Required env vars:
//   LIFELENZ_USERNAME         — login email
//   LIFELENZ_PASSWORD         — login password
//   VITE_SUPABASE_URL         — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS for server upserts)
//
// Optional:
//   LIFELENZ_DAYS_BACK  — days of history to pull (default: 30)
//   LIFELENZ_DAYS_FWD   — days of future data to pull (default: 14)
//   LIFELENZ_DEBUG      — set to '1' to log raw API responses

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const BASE         = 'https://us01-connect.lifelenz.com';
const BUSINESS_ID  = '01979dbf-a166-759b-8702-aba9915c578e';
const DAYS_BACK    = parseInt(process.env.LIFELENZ_DAYS_BACK  || '30', 10);
const DAYS_FWD     = parseInt(process.env.LIFELENZ_DAYS_FWD   || '14', 10);
const DEBUG        = process.env.LIFELENZ_DEBUG === '1';

// ── Supabase client (service role — skips RLS) ────────────────────────────
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── Date helpers ──────────────────────────────────────────────────────────
const toISO  = d => d.toISOString().slice(0, 10);
const addDay = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

function dateRange(start, end) {
  const dates = [];
  let cur = new Date(start);
  while (cur <= end) { dates.push(new Date(cur)); cur = addDay(cur, 1); }
  return dates;
}

// Split a date range into chunks of at most maxDays days (API limit)
function chunkDateRange(start, end, maxDays = 21) {
  const chunks = [];
  let cur = new Date(start);
  while (cur <= end) {
    const chunkEnd = addDay(cur, maxDays - 1);
    chunks.push({ start: new Date(cur), end: chunkEnd > end ? new Date(end) : new Date(chunkEnd) });
    cur = addDay(chunkEnd, 1);
  }
  return chunks;
}

// ── Step 1: Playwright login → capture auth token ─────────────────────────
async function getAuthToken() {
  console.log('[auth] launching headless browser…');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page    = await context.newPage();

  let authToken = null;

  // Capture X-Auth-Token from any outgoing request header after login
  page.on('request', req => {
    const h = req.headers();
    if (h['x-auth-token'] && !authToken) {
      authToken = h['x-auth-token'];
      if (DEBUG) console.log('[auth] captured token from request header');
    }
  });
  // Also check response headers (some implementations return it there)
  page.on('response', async resp => {
    try {
      const h = resp.headers();
      if (h['x-auth-token'] && !authToken) {
        authToken = h['x-auth-token'];
        if (DEBUG) console.log('[auth] captured token from response header');
      }
    } catch { /* ignore */ }
  });

  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Fill login form — selectors cover common LifeLenz/Humanforce patterns
    const userSel = 'input[name="username"], input[name="email"], input[type="email"], #username, #email';
    const passSel = 'input[name="password"], input[type="password"], #password';
    const subSel  = 'button[type="submit"], input[type="submit"], .btn-primary, .login-btn, [data-test="login-btn"]';

    await page.waitForSelector(userSel, { timeout: 15000 });
    await page.fill(userSel, process.env.LIFELENZ_USERNAME);
    await page.fill(passSel, process.env.LIFELENZ_PASSWORD);
    await page.click(subSel);

    // Wait for redirect away from login page
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 20000 });
    console.log('[auth] logged in, current URL:', page.url());

    // Trigger an API call so we can capture the token from the request headers
    // Navigate to any data page that fires an API request
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // If still not captured via events, try localStorage / sessionStorage
    if (!authToken) {
      authToken = await page.evaluate(() => {
        const stores = [localStorage, sessionStorage];
        const keys   = ['x-auth-token', 'authToken', 'auth_token', 'token', 'X-Auth-Token',
                         'accessToken', 'access_token'];
        for (const s of stores) {
          for (const k of keys) {
            const v = s.getItem(k);
            if (v && v.length > 20 && !v.startsWith('{') && !v.startsWith('[')) return v;
          }
        }
        // Try scanning all localStorage values for a token-shaped string
        for (const s of stores) {
          for (let i = 0; i < s.length; i++) {
            const k = s.key(i);
            const v = s.getItem(k);
            if (v && /^[A-Za-z0-9\-._~+/]+=*$/.test(v) && v.length > 40 && v.length < 500) {
              return v;
            }
          }
        }
        return null;
      });
      if (authToken) console.log('[auth] captured token from storage');
    }

  } finally {
    await browser.close();
  }

  if (!authToken) {
    throw new Error('[auth] Could not capture auth token. Check LIFELENZ_USERNAME/PASSWORD and login form selectors.');
  }

  console.log('[auth] token captured (length:', authToken.length, ')');
  return authToken;
}

// ── Step 2: Discover active store schedules ───────────────────────────────
async function getStoreSchedules(token) {
  const url = `${BASE}/workforce/business/${BUSINESS_ID}/schedules`;
  const resp = await fetch(url, {
    headers: { 'X-Auth-Token': token, 'Accept': 'application/json' },
  });

  if (!resp.ok) {
    throw new Error(`[schedules] HTTP ${resp.status} from ${url}`);
  }

  const data = await resp.json();
  if (DEBUG) console.log('[schedules] raw:', JSON.stringify(data).slice(0, 500));

  // LifeLenz returns an array of schedule objects.
  // Filter to store schedules only (exclude group/dept schedules that HTTP 422 on reports).
  // Store schedules have their store number in the name.
  const all = Array.isArray(data) ? data : (data.schedules || data.data || []);
  const stores = all.filter(s => {
    const name = String(s.name || s.scheduleName || '');
    // Keep if name contains a 7-digit store number (e.g. 0003708) or 4-digit (3708)
    return /\b\d{4,7}\b/.test(name);
  });

  console.log(`[schedules] found ${all.length} total, ${stores.length} store schedules`);
  return stores;
}

// ── Step 3: Download Labor Analysis report for one store + date range ──────
// Returns parsed rows array, or [] on error.
async function fetchReportChunk(token, scheduleId, startDate, endDate) {
  // Try common LifeLenz report endpoints (different API versions)
  const endpoints = [
    `${BASE}/workforce/business/${BUSINESS_ID}/schedules/${scheduleId}/reports/labour-analysis-summary?startDate=${toISO(startDate)}&endDate=${toISO(endDate)}&format=csv`,
    `${BASE}/workforce/business/${BUSINESS_ID}/schedules/${scheduleId}/reports/labor-analysis-summary?startDate=${toISO(startDate)}&endDate=${toISO(endDate)}&format=csv`,
    `${BASE}/workforce/v1/business/${BUSINESS_ID}/schedules/${scheduleId}/reports?type=LABOUR_ANALYSIS_SUMMARY&startDate=${toISO(startDate)}&endDate=${toISO(endDate)}&format=csv`,
    `${BASE}/api/v1/schedule/${scheduleId}/report/labor-analysis?start=${toISO(startDate)}&end=${toISO(endDate)}&format=csv`,
  ];

  let csvText = null;
  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        headers: { 'X-Auth-Token': token, 'Accept': 'text/csv, application/json' },
      });
      if (resp.status === 422 || resp.status === 404) break; // schedule doesn't support this
      if (!resp.ok) continue;

      const ct = resp.headers.get('content-type') || '';
      if (ct.includes('json')) {
        // Async/staging response — poll until ready
        const job = await resp.json();
        if (DEBUG) console.log('[report] async job response:', JSON.stringify(job).slice(0, 300));
        csvText = await pollForReport(token, job, scheduleId, startDate, endDate);
        if (csvText) break;
      } else {
        csvText = await resp.text();
        if (csvText && csvText.length > 50) break;
      }
    } catch (e) {
      if (DEBUG) console.warn('[report] endpoint error:', url, e.message);
    }
  }

  return csvText ? parseCSV(csvText) : [];
}

// Poll for async report completion
async function pollForReport(token, job, scheduleId, startDate, endDate, maxAttempts = 10) {
  const reportId = job.reportId || job.id || job.jobId;
  if (!reportId) return null;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pollUrl = `${BASE}/workforce/business/${BUSINESS_ID}/schedules/${scheduleId}/reports/${reportId}`;
    const resp = await fetch(pollUrl, { headers: { 'X-Auth-Token': token } });
    if (!resp.ok) continue;
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('csv') || ct.includes('text')) {
      return await resp.text();
    }
    const data = await resp.json();
    if (data.status === 'COMPLETE' || data.status === 'READY') {
      const downloadUrl = data.downloadUrl || data.url;
      if (downloadUrl) {
        const dlResp = await fetch(downloadUrl, { headers: { 'X-Auth-Token': token } });
        return await dlResp.text();
      }
    }
  }
  return null;
}

// ── Step 4: Parse CSV into Supabase-ready row objects ─────────────────────
function parseCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) return [];

  // Row 0: metadata (Store number)
  const r0 = parseCsvLine(lines[0]);
  let loc = '';
  for (let i = 0; i < r0.length; i++) {
    if (r0[i].toLowerCase() === 'store' && i + 1 < r0.length) {
      loc = String(r0[i + 1]).trim(); break;
    }
  }
  if (!loc) loc = r0.find(v => /^\d{4,7}$/.test(v.trim())) || '';
  if (!loc) return [];
  loc = loc.padStart(7, '0');

  // Row 1: headers
  const headers = parseCsvLine(lines[1]).map(h => h.trim());

  // Column finder
  const fc = (...names) => {
    for (const n of names) {
      const i = headers.findIndex(h => h.toLowerCase().includes(n.toLowerCase()));
      if (i >= 0) return i;
    }
    return -1;
  };

  const C = {
    date:        0,
    fcstSales:   fc('Fcst.$', 'Fcst. $', 'Forecast Sales', 'Fcst Sales'),
    adjFcstSales:fc('Adj. Fcst.$', 'Adj.Fcst.$', 'Adj Fcst'),
    sales:       fc('Sales'),
    salesDiff:   fc('Sales +/-'),
    fcstTCs:     fc('Fcst. TCs', 'Fcst.TCs', 'Fcst TCs'),
    tcs:         fc('TCs'),
    tcsDiff:     fc('TCs +/-'),
    laborPct:    fc('Labor %'),
    projVLH:     fc('Proj. VLH', 'Proj.VLH', 'Proj VLH'),
    schVLH:      fc('Sch. VLH', 'Sch.VLH', 'Sch VLH'),
    needVLH:     fc('Need. VLH', 'Need.VLH', 'Need VLH'),
    vlhDiff:     fc('VLH +/-'),
    fixGuideHrs: fc('Fix.Guide.Hrs', 'Fix. Guide Hrs', 'Fix Guide'),
    schFixHrs:   fc('Sch.Fix.Hrs', 'Sch. Fix. Hrs', 'Sch Fix'),
    projFloor:   fc('Proj.Floor', 'Proj. Floor'),
    schFloor:    fc('Sch.Floor', 'Sch. Floor'),
    needFloor:   fc('Need.Floor', 'Need. Floor'),
    idealTotHrs: fc('Ideal Tot.Hrs', 'Ideal Tot. Hrs'),
    salMgrHrs:   fc('Sal.Mgr.Hrs', 'Sal. Mgr. Hrs'),
    crewHrs:     fc('Crew Hrs', 'Crew Hours'),
    totHrsDiff:  fc('Total Hrs +/-'),
    tpmh:        fc('TPMH'),
  };

  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    const r = parseCsvLine(lines[i]);
    if (!r[0]) continue;

    const dt = parseDate(r[0]);
    if (!dt) continue;

    const toDateStr = d => {
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const dy = String(d.getDate()).padStart(2, '0');
      return `${yr}-${mo}-${dy}`;
    };

    const f = idx => (idx >= 0 ? parseFloat(r[idx]) || null : null);

    rows.push({
      loc,
      date:           toDateStr(dt),
      fcst_sales:     f(C.fcstSales),
      adj_fcst_sales: f(C.adjFcstSales),
      sales:          f(C.sales),
      sales_diff:     f(C.salesDiff),
      fcst_tcs:       f(C.fcstTCs),
      tcs:            f(C.tcs),
      tcs_diff:       f(C.tcsDiff),
      labor_pct:      f(C.laborPct),
      proj_vlh:       f(C.projVLH),
      sch_vlh:        f(C.schVLH),
      need_vlh:       f(C.needVLH),
      vlh_diff:       f(C.vlhDiff),
      fix_guide_hrs:  f(C.fixGuideHrs),
      sch_fix_hrs:    f(C.schFixHrs),
      proj_floor:     f(C.projFloor),
      sch_floor:      f(C.schFloor),
      need_floor:     f(C.needFloor),
      ideal_tot_hrs:  f(C.idealTotHrs),
      sal_mgr_hrs:    f(C.salMgrHrs),
      crew_hrs:       f(C.crewHrs),
      tot_hrs_diff:   f(C.totHrsDiff),
      tpmh:           f(C.tpmh),
      updated_at:     new Date().toISOString(),
    });
  }

  return rows;
}

function parseCsvLine(line) {
  const cells = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; }
    else if (c === ',' && !inQuotes) { cells.push(cur); cur = ''; }
    else { cur += c; }
  }
  cells.push(cur);
  return cells.map(c => c.trim().replace(/^"|"$/g, ''));
}

function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // M/D/YYYY or MM/DD/YYYY
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return new Date(+m1[3], +m1[1] - 1, +m1[2], 12);
  // M/D/YY
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m2) { const yr = +m2[3] < 50 ? 2000 + +m2[3] : 1900 + +m2[3]; return new Date(yr, +m2[1] - 1, +m2[2], 12); }
  // YYYY-MM-DD
  const m3 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m3) return new Date(+m3[1], +m3[2] - 1, +m3[3], 12);
  // Excel serial number
  const n = parseFloat(s);
  if (!isNaN(n) && n > 40000 && n < 60000) {
    return new Date(Date.UTC(1900, 0, n - 1));
  }
  return null;
}

// ── Step 5: Upsert rows to Supabase ──────────────────────────────────────
async function upsertRows(rows) {
  if (!rows.length) return 0;
  const { error } = await supabase
    .from('lifelenz_schedule')
    .upsert(rows, { onConflict: 'loc,date' });
  if (error) { console.warn('[supabase] upsert error:', error.message); return 0; }
  return rows.length;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const start = new Date(); start.setDate(start.getDate() - DAYS_BACK);
  const end   = new Date(); end.setDate(end.getDate() + DAYS_FWD);
  console.log(`[lifelenz-pull] date range: ${toISO(start)} → ${toISO(end)}`);

  // 1. Auth
  const token = await getAuthToken();

  // 2. Discover schedules
  let schedules;
  try {
    schedules = await getStoreSchedules(token);
  } catch (e) {
    console.error('[schedules] error:', e.message);
    console.error('If this is a 401, the token may not be correct.');
    console.error('If this is a 404, the schedule discovery URL may differ — check LifeLenz DevTools for the right endpoint.');
    process.exit(1);
  }

  if (!schedules.length) {
    console.error('[schedules] no store schedules found. Check the schedule filter logic or API endpoint.');
    process.exit(1);
  }

  // 3. Fetch reports for each store in date chunks
  let totalRows = 0, totalSaved = 0;
  const chunks  = chunkDateRange(start, end, 21); // 21-day batches (well under 28-day async limit)

  for (const schedule of schedules) {
    const scheduleId = schedule.id || schedule.scheduleId;
    const name       = schedule.name || schedule.scheduleName || scheduleId;
    let storeRows = [];

    for (const chunk of chunks) {
      const rows = await fetchReportChunk(token, scheduleId, chunk.start, chunk.end);
      storeRows.push(...rows);
      if (rows.length && DEBUG) console.log(`  ${name} ${toISO(chunk.start)}–${toISO(chunk.end)}: ${rows.length} rows`);
    }

    if (!storeRows.length) {
      console.log(`  ${name}: no data (may be a non-store schedule, skipping)`);
      continue;
    }

    const saved = await upsertRows(storeRows);
    totalRows  += storeRows.length;
    totalSaved += saved;
    console.log(`  ${name} (#${scheduleId}): ${saved} rows saved`);
  }

  console.log(`[lifelenz-pull] ✓ done — ${totalSaved}/${totalRows} rows saved to Supabase`);
}

main().catch(err => {
  console.error('[lifelenz-pull] fatal error:', err);
  process.exit(1);
});
