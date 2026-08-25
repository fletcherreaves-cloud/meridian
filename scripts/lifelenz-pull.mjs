#!/usr/bin/env node
// scripts/lifelenz-pull.mjs — LifeLenz daily schedule sync
// Runs in GitHub Actions (or locally). Uses Playwright to login and capture
// the session token, then calls the LifeLenz API directly for all stores.
//
// Required env vars:
//   VITE_SUPABASE_URL         — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS for server upserts)
//
// Auth — provide ONE of:
//   LIFELENZ_TOKEN    — pre-captured X-Auth-Token (fastest; skip browser entirely)
//   LIFELENZ_USERNAME + LIFELENZ_PASSWORD — login credentials (for Playwright fallback)
//
// Optional:
//   LIFELENZ_DAYS_BACK   — max days of history to look back when filling gaps (default: 30)
//   LIFELENZ_SAFETY_DAYS — always re-pull this many days back for corrections (default: 3)
//   LIFELENZ_DAYS_FWD    — days of future schedule data to pull (default: 14)
//   LIFELENZ_DEBUG       — set to '1' to log raw API responses
//   LIFELENZ_SKIP_JOBS   — set to '1' to skip the per-station (lifelenz_job_hours) pull
//   LIFELENZ_SKIP_SHIFT_ASSIGNMENTS — set to '1' to skip the per-employee shift pull
//                          (lifelenz_shift_assignments — Crew Schedule Lookup, dispatch #123)

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';
// Zero-drift: the SAME per-station rollup the client uses (src/engine). The pull
// pre-aggregates ShiftsForSchedulePeriod → per-role hours/cost so the client just
// reads the rollup (raw shifts are never stored).
// shiftsForEmployeeSchedule (dispatch #123, Crew Schedule Lookup) — same source, per-SHIFT
// instead of rolled up. See the pullShiftAssignments() section below.
import { rollupShiftsByRole, shiftsForEmployeeSchedule } from '../src/engine/lifelenz-shift-jobs.js';
// dispatch #123 originally routed the resolved name through identity-vault.js's tokenizeRows()
// before this table existed a name column at all. Dispatch #125 (owner directive, 2026-08-25:
// "there is no reason to hide names for scheduling and punch times > everyone can see this data
// as-is") reverses that: the resolved name is now stored directly (see upsertShiftAssignmentRows
// below). No import of identity-vault.js remains in this file.

const BASE         = 'https://us01-connect.lifelenz.com';
const BUSINESS_ID  = '01979dbf-a166-759b-8702-aba9915c578e';
const SKIP_JOBS    = process.env.LIFELENZ_SKIP_JOBS === '1'; // escape hatch for the per-job pull
const SKIP_SHIFT_ASSIGNMENTS = process.env.LIFELENZ_SKIP_SHIFT_ASSIGNMENTS === '1'; // escape hatch, dispatch #123
const DAYS_BACK    = parseInt(process.env.LIFELENZ_DAYS_BACK    || '30', 10);
const SAFETY_DAYS  = parseInt(process.env.LIFELENZ_SAFETY_DAYS  || '3',  10);
const DAYS_FWD     = parseInt(process.env.LIFELENZ_DAYS_FWD     || '14', 10);
const START_DATE   = process.env.LIFELENZ_START_DATE || null; // override gap detection — pulls from this date forward
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

// ── Step 1a: Try direct REST login (no browser needed) ───────────────────
async function getAuthTokenDirect() {
  // Login page is a Next.js SPA that delegates to idm.lifelenz.com (OAuth2/OIDC).
  // Try OIDC discovery first, then known token endpoint patterns.
  const IDM_BASE = 'https://idm.lifelenz.com';
  const u = process.env.LIFELENZ_USERNAME;
  const p = process.env.LIFELENZ_PASSWORD;

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

  // Step 1: OIDC discovery — find the token endpoint
  let tokenEndpoint = `${IDM_BASE}/connect/token`; // standard OIDC default
  try {
    const discovery = await fetch(`${IDM_BASE}/.well-known/openid-configuration`, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    });
    console.log('[auth-direct] OIDC discovery →', discovery.status);
    if (discovery.ok) {
      const cfg = await discovery.json();
      console.log('[auth-direct] OIDC config:', JSON.stringify(cfg).slice(0, 400));
      if (cfg.token_endpoint) tokenEndpoint = cfg.token_endpoint;
    }
  } catch (e) {
    console.log('[auth-direct] discovery error:', e.message);
  }

  // Step 2: Try OAuth2 Resource Owner Password Credentials flow
  // Also try the login page config to extract the actual client_id
  let clientId = 'lifelenz-workforce';  // common default; will be overridden if found in page config
  try {
    const loginPage = await fetch('https://admin.lifelenz.com/us01/auth/login', {
      headers: { 'User-Agent': UA },
    });
    const html = await loginPage.text();
    // Extract client_id from the embedded Next.js config JSON
    const cidMatch = html.match(/"clientId"\s*:\s*"([^"]+)"/)
                  || html.match(/"client_id"\s*:\s*"([^"]+)"/);
    if (cidMatch) { clientId = cidMatch[1]; console.log('[auth-direct] clientId from page:', clientId); }
    // Log the idm servers config block
    const idmMatch = html.match(/"idm"\s*:\s*(\{[^}]+\})/);
    if (idmMatch) console.log('[auth-direct] idm config:', idmMatch[1]);
  } catch (e) {
    console.log('[auth-direct] page config extraction error:', e.message);
  }

  console.log('[auth-direct] token endpoint:', tokenEndpoint, '| clientId:', clientId);

  // Try ROPC with several scope/client_id combos
  const attempts = [
    { grant_type: 'password', username: u, password: p, client_id: clientId, scope: 'openid profile email' },
    { grant_type: 'password', username: u, password: p, client_id: 'workforce-web', scope: 'openid profile' },
    { grant_type: 'password', username: u, password: p, client_id: 'lifelenz-admin', scope: 'openid profile' },
    { grant_type: 'password', username: u, password: p, client_id: 'web', scope: 'openid profile' },
    // Also try the connect API directly with JSON
    null,
  ];

  for (const attempt of attempts) {
    if (!attempt) {
      // JSON POST fallback to IDM auth endpoint
      for (const path of ['/api/auth/login', '/auth/login', '/api/v1/login', '/api/users/sign_in']) {
        try {
          const r = await fetch(`${IDM_BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Accept': 'application/json' },
            body: JSON.stringify({ username: u, password: p, email: u }),
          });
          console.log('[auth-direct] IDM JSON', path, '→', r.status);
          if (r.ok) {
            const data = await r.json().catch(() => null);
            if (DEBUG) console.log('[auth-direct] IDM JSON body:', JSON.stringify(data)?.slice(0, 300));
            const tok = data?.access_token || data?.token || data?.authToken || data?.id_token;
            if (tok) { console.log('[auth-direct] got token from IDM JSON'); return tok; }
          }
        } catch (e) { console.log('[auth-direct] IDM JSON error:', e.message); }
      }
      continue;
    }

    try {
      const body = new URLSearchParams(attempt);
      const r = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, 'Accept': 'application/json' },
        body: body.toString(),
      });
      console.log('[auth-direct] ROPC', tokenEndpoint, 'client_id=' + attempt.client_id, '→', r.status);
      if (r.ok) {
        const data = await r.json().catch(() => null);
        if (DEBUG) console.log('[auth-direct] ROPC body:', JSON.stringify(data)?.slice(0, 300));
        // OIDC returns access_token; LifeLenz API needs X-Auth-Token — try both
        const tok = data?.access_token || data?.id_token;
        if (tok) {
          // Try using the access_token as X-Auth-Token against the workforce API
          const apiResp = await fetch(`${BASE}/workforce/business/${BUSINESS_ID}/schedules`, {
            headers: { 'X-Auth-Token': tok, 'Authorization': `Bearer ${tok}`, 'Accept': 'application/json' },
          });
          console.log('[auth-direct] workforce API with OIDC token →', apiResp.status);
          if (apiResp.ok) return tok;
          const apiToken = apiResp.headers.get('x-auth-token');
          if (apiToken) { console.log('[auth-direct] workforce API returned new token'); return apiToken; }
        }
      } else if (DEBUG) {
        const errBody = await r.text().catch(() => '');
        console.log('[auth-direct] ROPC error body:', errBody.slice(0, 200));
      }
    } catch (e) {
      console.log('[auth-direct] ROPC error:', e.message);
    }
  }

  return null;
}

// ── Step 1b: Playwright browser login (fallback) ──────────────────────────
async function getAuthToken() {
  console.log('[auth] launching headless browser…');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await context.newPage();

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

  const screenshotDir = 'screenshots';
  const { mkdirSync } = await import('fs');
  try { mkdirSync(screenshotDir, { recursive: true }); } catch {}

  // Capture auth code from redirect back to admin.lifelenz.com
  let authCode = null;
  let codeVerifier = null;
  page.on('request', req => {
    const url = req.url();
    if (url.includes('admin.lifelenz.com') && url.includes('code=')) {
      const code = new URL(url).searchParams.get('code');
      if (code) { authCode = code; console.log('[auth] captured auth code from redirect'); }
    }
  });

  try {
    // Go directly to IDM (backend identity server — not Cloudflare protected like admin.lifelenz.com)
    const CLIENT_ID   = '63acf6b91f6c301188a20e18';
    const REDIRECT_URI = 'https://admin.lifelenz.com/us01/auth/callback';
    const IDM_AUTH_URL = 'https://idm.lifelenz.com/connect/authorize?' + new URLSearchParams({
      client_id:     CLIENT_ID,
      redirect_uri:  REDIRECT_URI,
      response_type: 'code',
      scope:         'openid profile email offline_access',
      state:         'meridian-sync',
    });
    console.log('[auth] navigating to IDM authorize:', IDM_AUTH_URL);
    await page.goto(IDM_AUTH_URL, { waitUntil: 'networkidle', timeout: 45000 });
    console.log('[auth] page title:', await page.title(), '| url:', page.url());
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '(empty)');
    console.log('[auth] body preview:', bodyText);
    await page.screenshot({ path: `${screenshotDir}/01-login-page.png`, fullPage: true });

    // Fill login form — broad selector list covering LifeLenz / Humanforce variants
    const userSel = [
      'input[name="username"]', 'input[name="email"]', 'input[type="email"]',
      '#username', '#email', 'input[name="loginName"]', 'input[name="login"]',
      'input[name="user"]', 'input[name="UserName"]', 'input[name="EmailAddress"]',
      'input[autocomplete="username"]', 'input[autocomplete="email"]',
      'input[placeholder*="email" i]', 'input[placeholder*="username" i]',
      'input[placeholder*="user name" i]',
    ].join(', ');
    const passSel = 'input[name="password"], input[type="password"], #password, input[autocomplete="current-password"]';
    const subSel  = 'button[type="submit"], input[type="submit"], .btn-primary, .login-btn, [data-test="login-btn"], button:has-text("Login"), button:has-text("Sign in"), button:has-text("Log in")';

    // Wait up to 20s — some SSO pages are slow
    try {
      await page.waitForSelector(userSel, { timeout: 20000 });
    } catch (e) {
      // Log all visible inputs to help diagnose selector mismatches
      const inputs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('input')).map(el => ({
          type: el.type, name: el.name, id: el.id, placeholder: el.placeholder,
          autocomplete: el.getAttribute('autocomplete'), visible: el.offsetParent !== null,
        }))
      );
      const pageHTML = await page.content().catch(() => '(could not get HTML)');
      console.error('[auth] username selector not found. Visible inputs:', JSON.stringify(inputs, null, 2));
      console.error('[auth] page HTML (first 2000 chars):', pageHTML.slice(0, 2000));
      await page.screenshot({ path: `${screenshotDir}/login-selector-fail.png`, fullPage: true });
      throw e;
    }

    await page.fill(userSel, process.env.LIFELENZ_USERNAME);
    await page.fill(passSel, process.env.LIFELENZ_PASSWORD);
    await page.screenshot({ path: `${screenshotDir}/02-filled.png` });
    await page.click(subSel);

    // Wait for redirect back to admin.lifelenz.com (OAuth callback) or away from login
    await page.waitForFunction(
      () => window.location.href.includes('admin.lifelenz.com') ||
            !window.location.href.includes('idm.lifelenz.com'),
      { timeout: 20000 }
    );
    console.log('[auth] redirected, current URL:', page.url());

    // Exchange auth code for tokens if captured
    if (authCode && !authToken) {
      console.log('[auth] exchanging auth code for tokens…');
      const tokenResp = await fetch('https://idm.lifelenz.com/connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:   'authorization_code',
          code:         authCode,
          client_id:    '63acf6b91f6c301188a20e18',
          redirect_uri: 'https://admin.lifelenz.com/us01/auth/callback',
        }).toString(),
      });
      console.log('[auth] token exchange →', tokenResp.status);
      if (tokenResp.ok) {
        const tokens = await tokenResp.json().catch(() => null);
        if (DEBUG) console.log('[auth] tokens:', JSON.stringify(tokens)?.slice(0, 200));
        if (tokens?.access_token) authToken = tokens.access_token;
      }
    }
    await page.screenshot({ path: `${screenshotDir}/03-post-login.png` });

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

// ── Common headers for all us01-connect.lifelenz.com API calls ───────────
// Captured from DevTools: these headers are required alongside X-Auth-Token.
function apiHeaders(token, scheduleId = null) {
  const h = {
    'X-Auth-Token':      token,
    'X-Business-Id':     BUSINESS_ID,
    'X-Lifelenz-Device': 'webadmin',
    'X-Version':         '1.75.21',
    'Accept':            'application/json',
    'Content-Type':      'application/json',
  };
  if (scheduleId) h['X-Schedule-Id'] = scheduleId;
  return h;
}

// Detect a session-expired / invalid-token response by status OR body signature.
// LifeLenz returns 422 with {"error":{"code":"INVALID_SESSION_ERROR", ...}} when a
// token expires (not 401/403), so status alone is not enough.
function isSessionExpired(status, body) {
  if (status === 401 || status === 403 || status === 422) return true;
  const b = (body || '').toLowerCase();
  return b.includes('invalid_session_error')
      || b.includes('session expired')
      || b.includes('please sign in again')
      || b.includes('sign in again');
}

// Re-authenticate from scratch (direct REST → Playwright browser) when the
// pre-captured token has expired. Returns a fresh token or null.
async function reauth() {
  console.warn('[auth] session expired — re-authenticating via login flow…');
  let t = await getAuthTokenDirect();
  if (!t) {
    console.log('[auth] direct REST login failed, falling back to Playwright browser…');
    t = await getAuthToken();
  }
  return t;
}

// ── Step 2: Discover store schedules via REST /api/admin/businesses/{id}/schedules ──
// This endpoint returns all schedules in JSON:API format:
//   { data: [{ id, type: "schedules", attributes: { schedule_name, code, schedule_status, ... } }] }
// We filter for active schedules whose name contains a 4-7 digit store number.
async function getStoreSchedules(token) {
  const headers = { ...apiHeaders(token), 'Accept': 'application/json' };
  const base = `${BASE}/api/admin/businesses/${BUSINESS_ID}/schedules`;

  let all = [];
  let nextUrl = base; // start with no query params — API rejects page[] params

  while (nextUrl) {
    const resp = await fetch(nextUrl, { headers });
    console.log(`[schedules] REST →`, resp.status, nextUrl === base ? '' : '(next page)');
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`[schedules] REST schedules ${resp.status}: ${body.slice(0, 200)}`);
    }

    const data = await resp.json();
    const records = data?.data || [];
    all = all.concat(records);
    if (DEBUG) console.log(`[schedules] batch: ${records.length} records, total so far: ${all.length}`);

    // Follow JSON:API links.next if present
    nextUrl = data?.links?.next || null;
  }

  console.log(`[schedules] ${all.length} total schedules from REST`);

  // Store schedules have a store number (4-7 digits) in schedule_name.
  // Group/org schedules (e.g. "MCDOK/Emerald Arches") won't match.
  const stores = all
    .filter(s => s.attributes?.schedule_status === 'active')
    .filter(s => /\b\d{4,7}\b/.test(s.attributes?.schedule_name || s.attributes?.code || ''))
    .map(s => ({
      id:   s.id,
      name: s.attributes.schedule_name || s.attributes.code || s.id,
    }));

  console.log(`[schedules] ${stores.length} store schedules after filter`);
  stores.forEach(s => console.log(`  [schedules]   ${s.name} → ${s.id}`));
  return stores;
}

// ── Step 3: Download Labor Analysis report for one store + date range ──────
// Returns parsed rows array, or [] on error.
async function fetchReportChunk(token, scheduleId, startDate, endDate) {
  // Confirmed working URL from DevTools (Status 200, Content-Type: text/csv):
  // /api/admin/report/businesses/{id}/schedules/{scheduleId}/labor_analysis_actuals_report
  // Parameters: start_date, end_date, type=csv
  const confirmedUrl = `${BASE}/api/admin/report/businesses/${BUSINESS_ID}/schedules/${scheduleId}/labor_analysis_actuals_report?start_date=${toISO(startDate)}&end_date=${toISO(endDate)}&type=csv`;

  // #263: a network exception and a non-2xx status used to both collapse into
  // csvText=null → [] here, indistinguishable from a genuinely empty report. That is
  // exactly the "reports success while writing nothing" gap -- throw instead, so the
  // caller's per-chunk tracker can tell "this chunk actually failed" from "this store
  // legitimately had zero shifts in this window" (still a real [], just not an error).
  const resp = await fetch(confirmedUrl, {
    headers: {
      ...apiHeaders(token, scheduleId),
      'X-Page-Module': 'reports-pdf',
      'Accept': 'text/csv, */*',
    },
  });
  console.log('[report] confirmed endpoint →', resp.status, scheduleId);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  let csvText;
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('json')) {
    const job = await resp.json();
    if (DEBUG) console.log('[report] async job response:', JSON.stringify(job).slice(0, 300));
    csvText = await pollForReport(token, job, scheduleId, startDate, endDate);
  } else {
    csvText = await resp.text();
  }

  return csvText && csvText.length > 50 ? parseCSV(csvText) : [];
}

// Poll for async report completion
async function pollForReport(token, job, scheduleId, startDate, endDate, maxAttempts = 10) {
  const reportId = job.reportId || job.id || job.jobId;
  if (!reportId) return null;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pollUrl = `${BASE}/api/admin/report/businesses/${BUSINESS_ID}/schedules/${scheduleId}/reports/${reportId}`;
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
// Query DB for the most recent date already stored — used for smart pull range
async function getLatestDate() {
  const { data, error } = await supabase
    .from('lifelenz_schedule')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .single();
  // #399: `error || !data` collapsed a genuinely-empty table (PGRST116) and a FAILED
  // read (network/RLS/timeout/522) into the same "no existing data" null -- and null
  // here selects the largest backfill window below. Only PGRST116 means empty; any
  // other error must abort, not escalate to the biggest pull.
  if (error && error.code !== 'PGRST116') throw new Error(`[lifelenz-pull] getLatestDate() read failed -- ${error.code}: ${error.message}`);
  if (!data) return null;
  return new Date(data.date + 'T00:00:00');
}

async function upsertRows(rows) {
  if (!rows.length) return 0;
  const { error } = await supabase
    .from('lifelenz_schedule')
    .upsert(rows, { onConflict: 'loc,date' });
  if (error) { console.warn('[supabase] upsert error:', error.message); return 0; }
  return rows.length;
}

// ── Per-job (business-role / station) hours+cost — ShiftsForSchedulePeriod ──
// Separate GraphQL endpoint from the CSV report. Fully best-effort: any failure
// logs and returns [] so it can NEVER break the (already-committed) CSV pull.
const GQL_URL = `${BASE}/manager/graphql`;

// LifeLenz business week starts WEDNESDAY (WEEK_START_DOW=3) — must match
// src/engine/schedule-summary.js so week_start keys line up with the panel.
function weekStartWed(d) {
  const x = new Date(d); x.setHours(12, 0, 0, 0);
  const diff = (x.getDay() - 3 + 7) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}
function weeksInRange(start, end) {
  const out = []; let cur = weekStartWed(start); const last = weekStartWed(end);
  while (cur <= last) { out.push(new Date(cur)); cur = addDay(cur, 7); }
  return out;
}
// Schedule name → 7-char zero-padded store number (matches lifelenz_schedule.loc).
function locFromName(name) {
  const m = String(name || '').match(/\b(\d{4,7})\b/);
  return m ? m[1].padStart(7, '0') : null;
}

// Verified against the real ShiftsForSchedulePeriod DevTools capture (2026-07-24).
// Variable TYPES matter: startDateTime/endDateTime are ISO8601DateTime! and shiftType
// is [ShiftTypeEnum!] — a String!/[String!] mismatch makes the server reject the query.
// includePayRates is NOT a shifts() argument; it only gates the earnings field via an
// @include directive, so we request earnings plain (the owner token is authorized for it).
// shiftStartTime/shiftEndTime added under dispatch #123 (Crew Schedule Lookup) — these were NOT
// requested before (the per-station rollup this query originally existed for has no use for a
// time), but they are real fields on this same Shift node: confirmed via the owner's live
// 2026-07-24 DevTools capture of this exact query (memory/project-lifelenz-schedule-jobs.md line
// 33 — `{ id, shiftStartTime, shiftEndTime, shiftType, assignedEmploymentId, ... }`), not a guess.
const SHIFTS_QUERY = `query ShiftsForSchedulePeriod($businessId: ID!, $scheduleId: ID!, $startDateTime: ISO8601DateTime!, $endDateTime: ISO8601DateTime!, $shiftType: [ShiftTypeEnum!], $after: String) {
  shifts(businessId: $businessId, scheduleId: $scheduleId, startDateTime: $startDateTime, endDateTime: $endDateTime, shiftType: $shiftType, after: $after) {
    edges { node { id shiftType assignedEmploymentId scheduleId isAbsent shiftStartTime shiftEndTime pivotMetrics { businessRoleId jobTitleId earnings seconds payType } } }
    pageInfo { endCursor hasNextPage }
  }
}`;

// Fetch ALL shift edges for one schedule + week (paginated).
async function fetchShiftsForSchedule(token, scheduleId, weekStart) {
  // ISO8601DateTime! — send canonical UTC with milliseconds + Z (the scalar rejects a
  // bare 'YYYY-MM-DDTHH:MM:SS'). Midnight-UTC Wednesday boundaries are contiguous week
  // to week (no gap, no double-count) and align with the panel's Wednesday week key.
  const startISO = `${toISO(weekStart)}T00:00:00.000Z`;
  const endISO   = `${toISO(addDay(weekStart, 7))}T00:00:00.000Z`;
  const edges = [];
  let after = null, guard = 0;
  do {
    const body = {
      operationName: 'ShiftsForSchedulePeriod',
      variables: {
        businessId: BUSINESS_ID, scheduleId,
        startDateTime: startISO, endDateTime: endISO,
        shiftType: ['offer', 'offer_to_all', 'roster', 'time_off', 'open'],
        after,
      },
      query: SHIFTS_QUERY,
    };
    const resp = await fetch(`${GQL_URL}?ShiftsForSchedulePeriod`, {
      method: 'POST',
      headers: { ...apiHeaders(token, scheduleId), 'X-Version': '1.75.50', 'X-User-Journey': 'Display Schedule Week' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(`GraphQL ${resp.status}: ${t.slice(0, 200)}`);
    }
    const json = await resp.json();
    if (json.errors && json.errors.length) {
      throw new Error('GraphQL errors: ' + JSON.stringify(json.errors).slice(0, 300));
    }
    const conn = json?.data?.shifts;
    const batch = conn?.edges || [];
    edges.push(...batch);
    const pi = conn?.pageInfo;
    after = pi && pi.hasNextPage ? pi.endCursor : null;
  } while (after && ++guard < 50);
  return edges;
}

// ── GetSchedulableEmploymentsForPeriod — roster (employmentId → name), dispatch #123 ──────────
// Confirmed real endpoint + response shape from the owner's live 2026-07-24 DevTools capture
// (memory/project-lifelenz-schedule-jobs.md, endpoint #8): `employmentsInScheduleTimeRange.edges
// [].node` (Employment) carries `computedName`/`firstName`/`lastName` keyed by `id`, which IS
// the same id `shifts.assignedEmploymentId` points at ("employmentId → name → label
// ShiftsForSchedulePeriod shifts by person" — the doc's own words). This is the answer to
// dispatch #123's "is a name field reachable from assignedEmploymentId" investigation: YES, via
// this query — not an assumption, a real captured response, cited above. See this dispatch's PR
// body for why that capture stands in for a fresh introspection run (no LIFELENZ_TOKEN was
// available in the sandbox that wrote this).
//
// PII-MINIMIZATION, deliberately: the real Employment type also carries dateOfBirth (a MINOR
// flag), schoolId, email, and full pay-rate history (employmentRate/employmentRates) — none of
// that is requested here. Only `id computedName firstName lastName` — the minimum needed to
// resolve a name, mirroring dispatch #124's own "never request a PII field you don't need"
// discipline for a completely different endpoint, same principle.
const EMPLOYMENTS_QUERY = `query GetSchedulableEmploymentsForPeriod($businessId: ID!, $scheduleId: ID!, $startDateTime: ISO8601DateTime!, $endDateTime: ISO8601DateTime!, $after: String) {
  employmentsInScheduleTimeRange(businessId: $businessId, scheduleId: $scheduleId, startDateTime: $startDateTime, endDateTime: $endDateTime, includePayRates: false, includeEmploymentAvailability: false, includeEmploymentContracts: false, includeSharedSchedule: true, after: $after) {
    edges { node { id computedName firstName lastName } }
    pageInfo { endCursor hasNextPage }
  }
}`;

// Fetch the roster ONCE per schedule for the whole pull window [start,end] (an employee's name
// doesn't change week to week, so unlike fetchShiftsForSchedule this is not called per-week).
async function fetchEmploymentsForSchedule(token, scheduleId, start, end) {
  const startISO = `${toISO(start)}T00:00:00.000Z`;
  const endISO   = `${toISO(end)}T00:00:00.000Z`;
  const edges = [];
  let after = null, guard = 0;
  do {
    const body = {
      operationName: 'GetSchedulableEmploymentsForPeriod',
      variables: { businessId: BUSINESS_ID, scheduleId, startDateTime: startISO, endDateTime: endISO, after },
      query: EMPLOYMENTS_QUERY,
    };
    const resp = await fetch(`${GQL_URL}?GetSchedulableEmploymentsForPeriod`, {
      method: 'POST',
      headers: { ...apiHeaders(token, scheduleId), 'X-Version': '1.75.50', 'X-User-Journey': 'Display Schedule Week' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(`GraphQL ${resp.status}: ${t.slice(0, 200)}`);
    }
    const json = await resp.json();
    if (json.errors && json.errors.length) {
      throw new Error('GraphQL errors: ' + JSON.stringify(json.errors).slice(0, 300));
    }
    const conn = json?.data?.employmentsInScheduleTimeRange;
    const batch = conn?.edges || [];
    edges.push(...batch);
    const pi = conn?.pageInfo;
    after = pi && pi.hasNextPage ? pi.endCursor : null;
  } while (after && ++guard < 50);
  return edges;
}

// Roll one store-week's shifts into per-role rows for lifelenz_job_hours.
function jobRowsFor(loc, weekStart, scheduleId, edges) {
  const byRole = rollupShiftsByRole({ edges }, { scheduleId });
  const wk = toISO(weekStart);
  const now = new Date().toISOString();
  return byRole
    .filter(r => r.hours > 0 || r.cost > 0)
    .map(r => ({
      loc, week_start: wk, business_role_id: r.businessRoleId,
      role_name: r.name, category: r.category, code: r.code,
      hours: r.hours, cost: r.cost, reg_hours: r.regHours, ot_hours: r.otHours,
      n_shifts: r.nShifts, updated_at: now,
    }));
}

async function upsertJobRows(rows) {
  if (!rows.length) return 0;
  const { error } = await supabase
    .from('lifelenz_job_hours')
    .upsert(rows, { onConflict: 'loc,week_start,business_role_id' });
  if (error) { console.warn('[job-hours] upsert error:', error.message); return 0; }
  return rows.length;
}

// Pull per-job hours for every store schedule across the weeks spanning [start,end].
async function pullJobHours(token, schedules, start, end) {
  const weeks = weeksInRange(start, end);
  console.log(`[job-hours] pulling ${weeks.length} week(s) × ${schedules.length} store(s)…`);
  let total = 0, saved = 0, gqlFailed = false;
  for (const schedule of schedules) {
    const scheduleId = schedule.id || schedule.scheduleId;
    const loc = locFromName(schedule.name || schedule.scheduleName || scheduleId);
    if (!loc) { console.log(`  [job-hours] ${schedule.name}: no store number in name, skipping`); continue; }
    let storeRows = [];
    for (const wk of weeks) {
      try {
        const edges = await fetchShiftsForSchedule(token, scheduleId, wk);
        storeRows.push(...jobRowsFor(loc, wk, scheduleId, edges));
      } catch (e) {
        // Log the FIRST failure loudly (likely a query-shape mismatch to fix once),
        // then stay quiet to avoid 27×N noise. Never fatal.
        if (!gqlFailed) { console.warn(`[job-hours] fetch failed (${schedule.name} wk ${toISO(wk)}): ${e.message}`); gqlFailed = true; }
      }
    }
    if (storeRows.length) {
      const n = await upsertJobRows(storeRows);
      total += storeRows.length; saved += n;
      console.log(`  [job-hours] ${loc}: ${n} role-rows across ${weeks.length} wk`);
    }
  }
  console.log(`[job-hours] ✓ ${saved}/${total} role-rows saved${gqlFailed ? ' (some fetches failed — see first warning)' : ''}`);
  return saved;
}

// ── Per-employee shift assignments — Crew Schedule Lookup (dispatch #123) ─────────────────────
// One row per COMMITTED SHIFT per employee (not the weekly per-station rollup above). Powers
// the Crew Schedule panel's "search an employee, see their upcoming schedule." Fully best-effort
// (same posture as pullJobHours): any failure logs and moves on, never costs the already-
// committed CSV/per-job pulls that ran before it. Escape hatch: LIFELENZ_SKIP_SHIFT_ASSIGNMENTS=1.
async function upsertShiftAssignmentRows(loc, rows) {
  if (!rows.length) return 0;
  // dispatch #125 (owner directive, 2026-08-25): store the resolved name directly. No
  // tokenization step -- see the file header for the reversal from dispatch #123's original
  // emp_token-only design. assigned_employment_id stays the stable join key regardless (it was
  // never a privacy mechanism, just LifeLenz's own opaque identifier).
  const now = new Date().toISOString();
  const upsert = rows.map(r => ({
    loc, shift_id: r.shiftId, date: r.date,
    shift_start: r.startISO, shift_end: r.endISO,
    assigned_employment_id: r.employmentId,
    // The resolved name, trimmed, or null when no roster match was found (roster fetch failed,
    // or the employee genuinely has no roster entry this window) -- the panel falls back to
    // assigned_employment_id as a display key ("Employee #12345") in that case, same graceful-
    // degradation behavior dispatch #123 established, just without a token in between.
    employee_name: r.name ? r.name.trim() : null,
    business_role_id: r.businessRoleId, role_name: r.roleName,
    category: r.category, code: r.code, job_title: r.jobTitle,
    is_absent: r.isAbsent, schedule_id: r.scheduleId,
    updated_at: now,
  }));
  const CHUNK = 500;
  let saved = 0;
  for (let i = 0; i < upsert.length; i += CHUNK) {
    const { error } = await supabase.from('lifelenz_shift_assignments')
      .upsert(upsert.slice(i, i + CHUNK), { onConflict: 'loc,shift_id' });
    if (error) { console.warn('[shift-assignments] save error:', error.message); }
    else saved += Math.min(CHUNK, upsert.length - i);
  }
  return saved;
}

async function pullShiftAssignments(token, schedules, start, end) {
  const weeks = weeksInRange(start, end);
  console.log(`[shift-assignments] pulling ${weeks.length} week(s) × ${schedules.length} store(s)…`);
  let total = 0, saved = 0, gqlFailed = false, rosterFailed = false;
  for (const schedule of schedules) {
    const scheduleId = schedule.id || schedule.scheduleId;
    const loc = locFromName(schedule.name || schedule.scheduleName || scheduleId);
    if (!loc) continue;

    // Roster fetched ONCE per store for the whole pull window (see fetchEmploymentsForSchedule).
    // Best-effort: a roster failure degrades every shift at this store to ID-only rows
    // (employee_name:null, assigned_employment_id kept) rather than blocking the shift rows.
    let rosterMap = new Map();
    try {
      const edges = await fetchEmploymentsForSchedule(token, scheduleId, start, end);
      const nodes = edges.map(e => e.node).filter(n => n && n.id);
      rosterMap = new Map(nodes.map(n => [n.id, n]));
      if (edges.length && !rosterMap.size) {
        // Real signal the query-shape has drifted since the 2026-07-24 capture this dispatch's
        // evidence relies on -- surfaced loudly, not silently swallowed.
        console.warn(`[shift-assignments] roster returned ${edges.length} node(s) with no usable id for ${schedule.name} -- check EMPLOYMENTS_QUERY field names against a fresh capture`);
      }
    } catch (e) {
      if (!rosterFailed) { console.warn(`[shift-assignments] roster fetch failed (${schedule.name}): ${e.message} -- degrading to ID-only rows`); rosterFailed = true; }
    }

    let storeRows = [];
    for (const wk of weeks) {
      try {
        const edges = await fetchShiftsForSchedule(token, scheduleId, wk);
        storeRows.push(...shiftsForEmployeeSchedule({ edges }, { scheduleId, roster: rosterMap }));
      } catch (e) {
        if (!gqlFailed) { console.warn(`[shift-assignments] fetch failed (${schedule.name} wk ${toISO(wk)}): ${e.message}`); gqlFailed = true; }
      }
    }
    if (storeRows.length) {
      const n = await upsertShiftAssignmentRows(loc, storeRows);
      total += storeRows.length; saved += n;
      const named = storeRows.filter(r => r.name).length;
      console.log(`  [shift-assignments] ${loc}: ${n} shift-rows saved (${named}/${storeRows.length} with a resolved name)`);
    }
  }
  console.log(`[shift-assignments] ✓ ${saved}/${total} shift-rows saved${gqlFailed ? ' (some shift fetches failed — see first warning)' : ''}${rosterFailed ? ' (some roster fetches failed — see first warning)' : ''}`);
  return saved;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  // Date range: START_DATE override bypasses gap detection (used for historical backfills).
  // Normal daily runs use smart gap detection to only pull what's missing + safety window.
  const today = new Date();
  let start, end;

  if (START_DATE) {
    start = new Date(START_DATE + 'T00:00:00');
    end   = addDay(today, DAYS_FWD);
    console.log(`[lifelenz-pull] start_date override: ${START_DATE} → ${toISO(end)} (${Math.round((end-start)/86400000)} days)`);
  } else {
    const latestDate = await getLatestDate();
    // Dispatch #32 (Workstream C): freshness SLA — this is the exact source (LifeLenz) that
    // went silently dark for 6 days (2026-08-06→08-11, CLAUDE.md's own cited incident) before
    // anyone noticed, because the only prior watch was GitHub Actions run-failure monitoring
    // (sync-failure-watch.yml), which can't see "the run succeeded but the token silently
    // stopped refreshing real data." warnAfterHours=30 covers one missed daily run + the
    // ~10:00 UTC cron's own scheduling slack; errorAfterHours=54 covers two.
    const fresh = checkFreshness(latestDate, { warnAfterHours: 30, errorAfterHours: 54, label: 'lifelenz-pull' });
    if (fresh.message) (fresh.status === 'error' ? console.error : console.warn)(fresh.message);
    let daysBack;
    if (!latestDate) {
      daysBack = DAYS_BACK;
      console.log(`[lifelenz-pull] no existing data — pulling ${daysBack} days of history`);
    } else {
      const daysSince = Math.floor((today - latestDate) / 86400000);
      daysBack = Math.min(Math.max(SAFETY_DAYS, daysSince + SAFETY_DAYS), DAYS_BACK);
      console.log(`[lifelenz-pull] latest in DB: ${toISO(latestDate)} (${daysSince}d ago) — pulling ${daysBack} days back`);
    }
    start = addDay(today, -daysBack);
    end   = addDay(today, DAYS_FWD);
  }

  console.log(`[lifelenz-pull] date range: ${toISO(start)} → ${toISO(end)}`);

  // 1. Auth — use pre-captured token if available, otherwise try REST then Playwright
  let token = process.env.LIFELENZ_TOKEN || null;
  if (token) {
    console.log('[auth] using LIFELENZ_TOKEN from env (skipping browser login)');
    // Sanity-check the token against the SAME endpoint we actually use for
    // discovery (the old /workforce/... path 404s and gave false confidence).
    const check = await fetch(`${BASE}/api/admin/businesses/${BUSINESS_ID}/schedules`, {
      headers: { ...apiHeaders(token), 'Accept': 'application/json' },
    });
    console.log('[auth] token validation →', check.status);
    if (!check.ok) {
      const body = await check.text().catch(() => '');
      if (isSessionExpired(check.status, body)) {
        console.warn(`[auth] LIFELENZ_TOKEN rejected (${check.status}, expired?), falling back to login flow`);
        token = null;
      } else {
        console.log('[auth] token validation non-200 but not a session error — proceeding with token');
      }
    }
  }
  if (!token) {
    token = await getAuthTokenDirect();
  }
  if (!token) {
    console.log('[auth] direct REST login failed, falling back to Playwright browser…');
    token = await getAuthToken();
  }

  // 2. Discover schedules — if the token turns out to be expired here (422
  // INVALID_SESSION_ERROR slips past validation), re-auth once and retry so the
  // daily sync self-heals when LIFELENZ_TOKEN rotates.
  let schedules;
  try {
    schedules = await getStoreSchedules(token);
  } catch (e) {
    const msg = e && e.message || '';
    if (isSessionExpired(0, msg)) {
      const fresh = await reauth();
      if (fresh) {
        token = fresh;
        try {
          schedules = await getStoreSchedules(token);
        } catch (e2) {
          console.error('[schedules] error after re-auth:', e2.message);
          process.exit(1);
        }
      }
    }
    if (!schedules) {
      console.error('[schedules] error:', msg);
      console.error('If this is a 401/422, the token may be expired and re-auth failed (check LIFELENZ_USERNAME/PASSWORD secrets).');
      console.error('If this is a 404, the schedule discovery URL may differ — check LifeLenz DevTools for the right endpoint.');
      process.exit(1);
    }
  }

  if (!schedules.length) {
    console.error('[schedules] no store schedules found. Check the schedule filter logic or API endpoint.');
    process.exit(1);
  }

  // 3. Fetch reports for each store in date chunks
  let totalRows = 0, totalSaved = 0;
  const chunks  = chunkDateRange(start, end, 21); // 21-day batches (well under 28-day async limit)
  // #263: one unit per (schedule, chunk) -- fetchReportChunk now throws on a real
  // fetch/HTTP failure instead of silently returning [], so this can tell that apart
  // from a schedule that legitimately has zero shifts in a window.
  const tracker = makeOutcomeTracker('lifelenz-pull');
  const requestedUnits = [];
  // Dispatch #32: per-store coverage, unconditional (not just on failure like tracker.fail
  // above) -- generalizes qsrsoft-pmix-pull.mjs:427-434's own "N/27 stores had at least one
  // row" pattern so a partial run (e.g. one store's schedule genuinely returning nothing) is
  // visible even when nothing THREW and the run still exits 0.
  const coveredSchedules = new Set();
  const allScheduleIds = schedules.map(s => s.id || s.scheduleId);

  for (const schedule of schedules) {
    const scheduleId = schedule.id || schedule.scheduleId;
    const name       = schedule.name || schedule.scheduleName || scheduleId;
    let storeRows = [];

    for (const chunk of chunks) {
      const unit = `${name} ${toISO(chunk.start)}–${toISO(chunk.end)}`;
      requestedUnits.push(unit);
      try {
        const rows = await fetchReportChunk(token, scheduleId, chunk.start, chunk.end);
        storeRows.push(...rows);
        if (rows.length && DEBUG) console.log(`  ${unit}: ${rows.length} rows`);
      } catch (e) {
        console.warn(`  ${unit}: ${e.message}`);
        tracker.fail(unit, e.message);
      }
    }

    if (!storeRows.length) {
      console.log(`  ${name}: no data (may be a non-store schedule, skipping)`);
      continue;
    }

    const saved = await upsertRows(storeRows);
    totalRows  += storeRows.length;
    totalSaved += saved;
    if (saved > 0) coveredSchedules.add(scheduleId);
    console.log(`  ${name} (#${scheduleId}): ${saved} rows saved`);
  }

  console.log(`[lifelenz-pull] ✓ done — ${totalSaved}/${totalRows} rows saved to Supabase`);
  logPartitionCoverage(coveredSchedules, allScheduleIds, { label: 'lifelenz-pull', kind: 'schedule' });
  const code = tracker.finalize({
    requestedUnits, totalSaved,
    formatRerun: () => `LIFELENZ_START_DATE=${toISO(start)} (no per-chunk rerun flag exists yet — reruns the full range)`,
  });
  if (code) process.exit(code);

  // 4. Per-job (station) hours+cost — additive, best-effort, never fatal. Runs
  // AFTER the CSV upsert so a failure here can't cost us the schedule data.
  if (SKIP_JOBS) {
    console.log('[job-hours] skipped (LIFELENZ_SKIP_JOBS=1)');
  } else {
    try {
      await pullJobHours(token, schedules, start, end);
    } catch (e) {
      console.warn('[job-hours] pull failed (non-fatal):', e.message);
    }
  }

  // 5. Per-employee shift assignments (Crew Schedule Lookup, dispatch #123) -- additive,
  //    best-effort, never fatal. Runs LAST, after the CSV pull and pullJobHours both already
  //    committed, for the same reason each of those is wrapped independently: a failure here
  //    can never cost the ones that ran before it.
  if (SKIP_SHIFT_ASSIGNMENTS) {
    console.log('[shift-assignments] skipped (LIFELENZ_SKIP_SHIFT_ASSIGNMENTS=1)');
  } else {
    try {
      await pullShiftAssignments(token, schedules, start, end);
    } catch (e) {
      console.warn('[shift-assignments] pull failed (non-fatal):', e.message);
    }
  }
}

main().catch(err => {
  console.error('[lifelenz-pull] fatal error:', err);
  process.exit(1);
});
