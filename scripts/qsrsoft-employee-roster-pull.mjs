#!/usr/bin/env node
// scripts/qsrsoft-employee-roster-pull.mjs
// QSRSoft Employee Roster → per-store active role-bucket counts, monthly.
// Feeds the Performance-Review "# Shift Certified Managers" metric (Cert Swing +
// Dept Mgrs) → roster_role_counts. Headcount itself comes from Roster Statistics.
//
// PRIVACY: the Employee Roster catalog carries heavy PII (SSN, DOB, address, phone).
// This pull requests a TRIMMED selectCols — only job-code + status fields — so SSN/
// DOB/address never leave QSRSoft, and it persists ONLY aggregate integer counts per
// store/month (roster_role_counts). No individual-employee data is stored anywhere.
//
// Endpoint (confirmed 2026-07-28, one call returns all stores):
//   GET https://api.reports.myqsrsoft.com/reporting/v2/people/employee-roster
//       ?catalogType=employeeRoster&nsd=d&nsn=<csv>&orgId=<org>&enterpriseName=McDonalds
//       &startDate=YYYY-MM-01&endDate=YYYY-MM-DD&weekStart=3
//       &locationType=home&employmentStatus=active&selectCols=<trimmed>
//   → { result: [ {storeNum, geid, fullEmployeeName, storeStartDate, storeEndDate,
//                  employmentStatus, locationType, terminationEntryDate, terminationReason,
//                  jobTitleCode, jobCodeType, jobTitleCodeDescription, jobTitleCodeStartDate} ] }
// Parsed with parseEmployeeRosterApi() + rosterCounts() from src/engine/people-reports.js
// (the SAME engine the manual xlsx-upload path uses — one source of truth).
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth ladder (mirrors qsrsoft-dar-pull.mjs / qsrsoft-roster-stats-pull.mjs):
//   QSRSOFT_TOKEN → QSRSOFT_COGNITO_TOKEN  (direct)  →  QSRSOFT_USERNAME/PASSWORD (Playwright)
// Optional: ROSTER_PERIOD=YYYY-MM · ROSTER_STORES=3708,… · QSRSOFT_DEBUG=1

import { createClient } from '@supabase/supabase-js';
import { parseEmployeeRosterApi, rosterCounts } from '../src/engine/people-reports.js';

const API_BASE   = 'https://api.reports.myqsrsoft.com';
const ORG_ID     = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const ENTERPRISE = 'McDonalds';
const REPORT_URL = 'https://v3.myqsrsoft.com/reports/mcd/people/employeeRoster';
const DEBUG      = process.env.QSRSOFT_DEBUG === '1';

// Trimmed column set — job-code + status only. Deliberately EXCLUDES ssn, dateOfBirth,
// address, phone, email so PII is never fetched onto the CI runner.
const SELECT_COLS = [
  'homeLocation', 'geid', 'storeStartDate', 'storeEndDate', 'employmentStatus',
  'locationType', 'fullEmployeeName', 'terminationEntryDate', 'terminationReason',
  'jobTitleCode', 'jobCodeType', 'jobTitleCodeDescription', 'jobTitleCodeStartDate',
].join(',');

const STORE_NSNS = (process.env.ROSTER_STORES
  ? process.env.ROSTER_STORES.split(',').map(s => s.trim())
  : [
    3708, 5183, 5985, 6178, 6838, 6972,
    10034, 10422, 10915, 11657, 13113, 18213,
    20475, 24471, 29760, 31357, 32525, 33109,
    33222, 33704, 34222, 35064, 35242, 37566,
    38609, 43380, 43701,
  ]).map(String);

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const pad2 = n => String(n).padStart(2, '0');
function currentPeriod() {
  if (process.env.ROSTER_PERIOD) return process.env.ROSTER_PERIOD;
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
function periodRange(period) {
  const [y, m] = period.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0));
  const today = new Date();
  const end = (today.getUTCFullYear() === y && today.getUTCMonth() + 1 === m && today < monthEnd) ? today : monthEnd;
  return {
    first: `${period}-01`,
    last: `${end.getUTCFullYear()}-${pad2(end.getUTCMonth() + 1)}-${pad2(end.getUTCDate())}`,
  };
}

function buildUrl(period) {
  const { first, last } = periodRange(period);
  const params = new URLSearchParams({
    catalogType: 'employeeRoster', nsd: 'd', nsn: STORE_NSNS.join(','),
    orgId: ORG_ID, enterpriseName: ENTERPRISE, startDate: first, endDate: last,
    weekStart: '3', locationType: 'home', employmentStatus: 'active', selectCols: SELECT_COLS,
  });
  return `${API_BASE}/reporting/v2/people/employee-roster?${params}`;
}

// employee-roster wraps rows in a FLAT { result: [...] } (not result.resp).
function extractRows(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.result)) return body.result;
  if (Array.isArray(body?.result?.resp)) return body.result.resp;
  if (Array.isArray(body?.resp)) return body.resp;
  return [];
}

// rosterCounts output → roster_role_counts columns (identical to saveRosterRoleCounts).
function toRows(byLoc, period) {
  return Object.entries(byLoc).map(([loc, c]) => ({
    loc: String(loc), period_month: period,
    crew: c.crew ?? null, shift_mgr: c.shiftMgr ?? null, gm: c.gm ?? null,
    maintenance: c.maintenance ?? null, admin: c.admin ?? null, other: c.other ?? null, total: c.total ?? null,
    updated_at: new Date().toISOString(),
  }));
}

async function upsert(rows) {
  if (!rows.length) return 0;
  const CHUNK = 500; let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from('roster_role_counts').upsert(slice, { onConflict: 'loc,period_month' });
    if (error) throw error;
    saved += slice.length;
  }
  return saved;
}

async function fetchDirect(token, period) {
  const url = buildUrl(period);
  if (DEBUG) console.log(`[employee-roster] GET ${url.slice(0, 130)}…`);
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': token, 'Accept': 'application/json',
      'Origin': 'https://v3.myqsrsoft.com', 'Referer': `${REPORT_URL}`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 200)}`);
  return extractRows(await resp.json());
}

async function fetchViaPlaywright(period) {
  const u = process.env.QSRSOFT_USERNAME, pw = process.env.QSRSOFT_PASSWORD;
  if (!u || !pw) { console.error('[auth] no QSRSOFT_USERNAME/PASSWORD for Playwright fallback'); return null; }
  const { chromium } = await import('playwright');
  const { mkdirSync } = await import('node:fs');
  try { mkdirSync('screenshots', { recursive: true }); } catch {}
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36' });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  const snap = name => page.screenshot({ path: `screenshots/${name}`, fullPage: true }).catch(() => {});
  const wait = ms => new Promise(r => setTimeout(r, ms));

  let token = null;
  page.on('request', req => {
    if (!req.url().includes('api.reports.myqsrsoft.com')) return;
    const t = req.headers()['x-auth-token'];
    if (t && t.length > 20 && !token) { token = t; if (DEBUG) console.log('[auth] token captured from', req.url().replace(/\?.*/, '')); }
  });

  try {
    console.log('[auth] navigating to v3.myqsrsoft.com…');
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    await snap('emproster-01-landing.png');

    const userSel = [
      'input[name="username"]', 'input[name="email"]', 'input[type="email"]',
      '#username', '#email', 'input[autocomplete="username"]',
      'input[placeholder*="email" i]', 'input[placeholder*="username" i]',
    ].join(', ');
    const passSel = 'input[type="password"], input[name="password"]';
    const foundUser = await page.waitForSelector(userSel, { timeout: 20000 }).then(() => true).catch(() => false);
    if (foundUser) {
      const userLoc = page.locator(userSel).first();
      const passLoc = page.locator(passSel).first();
      await userLoc.click({ clickCount: 3 }); await userLoc.pressSequentially(u, { delay: 12 });
      await passLoc.click({ clickCount: 3 }).catch(() => {}); await passLoc.pressSequentially(pw, { delay: 12 }).catch(() => {});
      const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
      const clicked = await signIn.click({ timeout: 8000 }).then(() => true).catch(() => false);
      if (!clicked) await passLoc.press('Enter').catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await wait(2500);
    } else {
      console.log('[auth] no login form (already authenticated?) — continuing');
    }
    await snap('emproster-02-post-login.png');
    console.log('[auth] post-login url:', page.url());

    await page.goto(REPORT_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await wait(3000);
    await snap('emproster-03-report.png');
    console.log('[auth] report url:', page.url(), '| token captured:', !!token);

    if (!token) {
      await page.evaluate(async url => { try { await fetch(url, { credentials: 'include' }); } catch {} }, buildUrl(period));
      await wait(2000);
    }
    if (!token) { console.error('[auth] ✗ could not capture a reporting token'); await snap('emproster-error.png'); return null; }
    console.log(`[auth] ✓ token captured (${token.length} chars) — fetching employee roster…`);

    const result = await page.evaluate(async ({ url, tok }) => {
      try {
        const r = await fetch(url, {
          headers: { 'X-Auth-Token': tok, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/' },
          signal: AbortSignal.timeout(45000),
        });
        if (!r.ok) return { error: `HTTP ${r.status}` };
        return { body: await r.json() };
      } catch (e) { return { error: e.message }; }
    }, { url: buildUrl(period), tok: token });

    await snap('emproster-final.png');
    if (result.error) { console.error('[employee-roster] in-browser fetch error:', result.error); return null; }
    return extractRows(result.body);
  } catch (e) {
    console.error('[auth] Playwright error:', e.message);
    await snap('emproster-error.png');
    return null;
  } finally {
    await browser.close();
  }
}

async function main() {
  const period = currentPeriod();
  console.log(`[employee-roster] period ${period} × ${STORE_NSNS.length} stores`);

  let rawRows = null;
  const directTokens = [
    ['QSRSOFT_TOKEN', (process.env.QSRSOFT_TOKEN || '').trim()],
    ['QSRSOFT_COGNITO_TOKEN', (process.env.QSRSOFT_COGNITO_TOKEN || '').trim()],
  ].filter(([, t]) => t);
  for (const [name, tok] of directTokens) {
    try {
      console.log(`[auth] trying direct fetch with ${name}…`);
      rawRows = await fetchDirect(tok, period);
      console.log(`[auth] ✓ ${name} accepted`);
      break;
    } catch (e) {
      if (e.message.startsWith('AUTH_FAILED')) { console.log(`[auth] ${name} rejected (${e.message}) — next method`); continue; }
      throw e;
    }
  }
  if (rawRows == null) {
    console.log('[auth] direct token(s) unavailable/rejected — falling back to Playwright');
    rawRows = await fetchViaPlaywright(period);
  }
  if (rawRows == null) { console.error('[employee-roster] ✗ no auth method succeeded'); process.exit(1); }

  const records = parseEmployeeRosterApi(rawRows);          // discards all PII; keeps job-code/status
  const byLoc = rosterCounts(records);                      // active-only bucket counts per loc
  const rows = toRows(byLoc, period);
  const found = Object.keys(byLoc).length;
  console.log(`[employee-roster] ${records.length} active employees → ${found} stores`);
  if (found < STORE_NSNS.length) console.warn(`[employee-roster] ⚠ only ${found}/${STORE_NSNS.length} stores in response`);
  const saved = await upsert(rows);
  console.log(`[employee-roster] ✓ ${saved} store rows upserted to roster_role_counts for ${period}`);
  if (!saved) process.exit(1);
}

main().catch(err => { console.error('[employee-roster] FATAL:', err); process.exit(1); });
