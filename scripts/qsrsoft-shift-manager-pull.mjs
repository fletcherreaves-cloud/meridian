#!/usr/bin/env node
// scripts/qsrsoft-shift-manager-pull.mjs
// QSRSoft Shift Manager Summary → per-manager monthly attributed performance.
// Feeds DM/shift-manager reviews (their OWN shifts, not the store total) →
// shift_manager_monthly. geid joins the Employee Roster.
//
// Endpoint (confirmed 2026-07-28):
//   GET https://api.reports.myqsrsoft.com/reports/mcd/shift/shiftManagerSummary
//       ?nsn=<csv>&orgId=<org>&enterpriseName=McDonalds&timeSegment=daypart
//       &segmentBy=daypart&timeInterval=daypart&startDate=&endDate=&dsd=s
//       &compType=trading&weekStart=3&timeSlices=<12 daypart JSON>
//   → { resp: [ {nsn, timeSlice, geid, managerName, numShifts, actualHours,
//        allNetSales, transactions, avgCheck, transPerPunchedHour, OEPE, R2P, CTP,
//        dtTTL, KVSTimePerTran, punchedLaborPct, …} ], totals }  (top-level resp)
// We keep the "Manager Total" rows (parseShiftManagerSummary) and AGGREGATE per
// (loc, geid) across the window — robust whether the API returns one monthly row per
// manager or one per day: sums shifts/hours/sales/transactions, transaction-weights
// the speed metrics + avg check, hour-weights labor%. Speed metrics are already sec.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth — tried in order:
//   getFreshToken()    — mints a Cognito ID token per run (scripts/lib/qsrsoft-auth.mjs)
//                        instead of reading a static QSRSOFT_TOKEN/QSRSOFT_COGNITO_TOKEN
//                        secret: that's a ~1h-TTL Cognito token, stale ~23/24 hours by
//                        construction no matter how often it's rotated, so the direct path
//                        was falling straight through to Playwright on nearly every run
//                        (mirrors qsrsoft-dar-pull.mjs). QSRSOFT_TOKEN/QSRSOFT_COGNITO_TOKEN
//                        are no longer read here.
//   QSRSOFT_USERNAME + QSRSOFT_PASSWORD — Playwright fallback (unchanged — still the
//                        required env for BOTH paths since getFreshToken() also mints
//                        from these same two secrets)
// Optional: SHIFTMGR_PERIOD=YYYY-MM · ROSTER_STORES=3708,… · QSRSOFT_DEBUG=1
//
// SHIFTMGR_START=YYYY-MM-DD [+ SHIFTMGR_END=YYYY-MM-DD, defaults to SHIFTMGR_START] — explicit
// range override, for investigative pulls narrower than a calendar month (a single day: set only
// SHIFTMGR_START). The endpoint already accepts an arbitrary startDate/endDate — this was always
// a one-request change, not a per-day loop like qsrsoft-ops-pull.mjs's START_DATE/END_DATE.
// IMPORTANT: an explicit range writes to shift_manager_range (loc, geid, period_start, period_end),
// NOT shift_manager_monthly (loc, period_month, geid) — the monthly table's key is the calendar
// month, and a single day or partial-month range upserted against that key would silently
// overwrite the cron job's whole-month aggregate with just the requested days. See
// supabase/schema-shift-manager-range.sql for the companion table. SHIFTMGR_PERIOD is ignored
// when SHIFTMGR_START is set.

import { createClient } from '@supabase/supabase-js';
import { parseShiftManagerSummary } from '../src/engine/people-reports.js';
import { getFreshToken } from './lib/qsrsoft-auth.mjs';

const API_BASE   = 'https://api.reports.myqsrsoft.com';
const ORG_ID     = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const ENTERPRISE = 'McDonalds';
const REPORT_URL = 'https://v3.myqsrsoft.com/reports/mcd/shift/shiftManagerSummary';
const DEBUG      = process.env.QSRSOFT_DEBUG === '1';

// The report's 12 daypart windows (normal + overnight +24h forms), from the capture.
const TIME_SLICES = JSON.stringify([
  { name: '4am-11am',  startTime: '04:00', endTime: '11:00' }, { name: '4am-11am',  startTime: '28:00', endTime: '35:00' },
  { name: '11am-2pm',  startTime: '11:00', endTime: '14:00' }, { name: '11am-2pm',  startTime: '35:00', endTime: '38:00' },
  { name: '2pm-4pm',   startTime: '14:00', endTime: '16:00' }, { name: '2pm-4pm',   startTime: '38:00', endTime: '40:00' },
  { name: '4pm-9pm',   startTime: '16:00', endTime: '21:00' }, { name: '4pm-9pm',   startTime: '40:00', endTime: '45:00' },
  { name: '9pm-12am',  startTime: '21:00', endTime: '24:00' }, { name: '9pm-12am',  startTime: '45:00', endTime: '48:00' },
  { name: '12am-4am',  startTime: '00:00', endTime: '04:00' }, { name: '12am-4am',  startTime: '24:00', endTime: '28:00' },
]);

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
  if (process.env.SHIFTMGR_PERIOD) return process.env.SHIFTMGR_PERIOD;
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
function periodRange(period) {
  const [y, m] = period.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0));
  const today = new Date();
  const end = (today.getUTCFullYear() === y && today.getUTCMonth() + 1 === m && today < monthEnd) ? today : monthEnd;
  return { first: `${period}-01`, last: `${end.getUTCFullYear()}-${pad2(end.getUTCMonth() + 1)}-${pad2(end.getUTCDate())}` };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Resolves what window + table this run targets. Explicit SHIFTMGR_START always wins over
// SHIFTMGR_PERIOD and routes to the range table — see the file header for why.
//
// This is a hand-invoked investigative path (SHIFTMGR_START set from the Actions UI or a
// laptop) — a typo'd date or an inverted range is the EXPECTED failure mode, not an edge case.
// Left unvalidated, a bad SHIFTMGR_START/SHIFTMGR_END silently reaches the endpoint, returns
// zero rows, and main()'s only diagnostic is "no manager rows (check timeSlices / auth)" —
// which points at auth when the actual cause was the input. Fail fast here instead, before any
// network call, with a message that names the actual problem (PR #267 review, 2026-08-14).
function resolveWindow() {
  const start = (process.env.SHIFTMGR_START || '').trim();
  if (start) {
    const end = (process.env.SHIFTMGR_END || '').trim() || start;
    if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
      console.error(`[shift-mgr] ✗ SHIFTMGR_START/SHIFTMGR_END must be YYYY-MM-DD — got start="${start}" end="${end}"`);
      process.exit(1);
    }
    if (end < start) {
      console.error(`[shift-mgr] ✗ SHIFTMGR_END (${end}) is before SHIFTMGR_START (${start})`);
      process.exit(1);
    }
    return { first: start, last: end, isRange: true };
  }
  const period = currentPeriod();
  const { first, last } = periodRange(period);
  return { first, last, isRange: false, period };
}

function buildUrl({ first, last }) {
  const params = new URLSearchParams({
    nsn: STORE_NSNS.join(','), orgId: ORG_ID, enterpriseName: ENTERPRISE,
    timeSegment: 'daypart', segmentBy: 'daypart', timeInterval: 'daypart',
    startDate: first, endDate: last, dsd: 's', compType: 'trading', weekStart: '3',
    timeSlices: TIME_SLICES,
  });
  return `${API_BASE}/reports/mcd/shift/shiftManagerSummary?${params}`;
}

function extractRows(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.resp)) return body.resp;
  if (Array.isArray(body?.result?.resp)) return body.result.resp;
  if (Array.isArray(body?.result)) return body.result;
  return [];
}

// Aggregate the "Manager Total" records per (loc, geid) into one row for the window.
// Sums volume; transaction-weights speed + avg check; hour-weights labor%. `window` decides
// whether the row is tagged period_month (monthly table) or period_start/period_end (range
// table) — see resolveWindow() and the file header.
function aggregate(records, window) {
  const acc = {};
  for (const r of records) {
    const key = r.loc + '|' + r.geid;
    const a = acc[key] || (acc[key] = {
      loc: r.loc, geid: r.geid, name: r.name,
      numShifts: 0, actualHours: 0, actualVsScheduled: 0, actualVsNeeded: 0,
      netSales: 0, transactions: 0,
      _spW: 0, _oepe: 0, _r2p: 0, _ctp: 0, _dtTtl: 0, _kvs: 0, _acW: 0, _ac: 0, _lbW: 0, _lb: 0,
    });
    if (r.name) a.name = r.name;
    a.numShifts += r.numShifts || 0;
    a.actualHours += r.actualHours || 0;
    a.actualVsScheduled += r.actualVsScheduled || 0;
    a.actualVsNeeded += r.actualVsNeeded || 0;
    a.netSales += r.netSales || 0;
    a.transactions += r.transactions || 0;
    const tw = r.transactions || 0;          // transaction weight for speed + avg check
    if (tw > 0) {
      a._spW += tw;
      a._oepe += (r.oepe || 0) * tw; a._r2p += (r.r2p || 0) * tw; a._ctp += (r.ctp || 0) * tw;
      a._dtTtl += (r.dtTtl || 0) * tw; a._kvs += (r.kvs || 0) * tw;
      if (r.avgCheck != null) { a._acW += tw; a._ac += r.avgCheck * tw; }
    }
    const hw = r.actualHours || 0;           // hour weight for labor %
    if (hw > 0 && r.laborPct != null) { a._lbW += hw; a._lb += r.laborPct * hw; }
  }
  const windowCols = window.isRange
    ? { period_start: window.first, period_end: window.last }
    : { period_month: window.period };
  return Object.values(acc).map(a => ({
    loc: String(a.loc), ...windowCols, geid: a.geid, manager_name: a.name || null,
    num_shifts: a.numShifts || null, actual_hours: a.actualHours || null,
    actual_vs_scheduled: a.actualVsScheduled || null, actual_vs_needed: a.actualVsNeeded || null,
    net_sales: a.netSales || null, transactions: a.transactions || null,
    avg_check: a._acW ? a._ac / a._acW : (a.transactions ? a.netSales / a.transactions : null),
    tpph: a.actualHours ? a.transactions / a.actualHours : null,
    oepe: a._spW ? a._oepe / a._spW : null, r2p: a._spW ? a._r2p / a._spW : null,
    ctp: a._spW ? a._ctp / a._spW : null, dt_ttl: a._spW ? a._dtTtl / a._spW : null,
    kvs: a._spW ? a._kvs / a._spW : null, labor_pct: a._lbW ? a._lb / a._lbW : null,
    updated_at: new Date().toISOString(),
  }));
}

async function upsert(rows, table, onConflict) {
  if (!rows.length) return 0;
  const CHUNK = 500; let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).upsert(slice, { onConflict });
    if (error) throw error;
    saved += slice.length;
  }
  return saved;
}

async function fetchDirect(token, window) {
  const url = buildUrl(window);
  if (DEBUG) console.log(`[shift-mgr] GET ${url.slice(0, 150)}…`);
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

// Resolves either a plain token string (Playwright mode) or the getFreshToken function itself
// (direct-API mode) — mirrors qsrsoft-dar-pull.mjs.
async function resolveToken(token, forceRemint) {
  return typeof token === 'function' ? await token({ forceRemint }) : token;
}

async function fetchViaPlaywright(window) {
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
    await snap('shiftmgr-01-landing.png');

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
    await snap('shiftmgr-02-post-login.png');
    console.log('[auth] post-login url:', page.url());

    await page.goto(REPORT_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await wait(3000);
    await snap('shiftmgr-03-report.png');
    console.log('[auth] report url:', page.url(), '| token captured:', !!token);

    if (!token) {
      await page.evaluate(async url => { try { await fetch(url, { credentials: 'include' }); } catch {} }, buildUrl(window));
      await wait(2000);
    }
    if (!token) { console.error('[auth] ✗ could not capture a reporting token'); await snap('shiftmgr-error.png'); return null; }
    console.log(`[auth] ✓ token captured (${token.length} chars) — fetching shift manager summary…`);

    const result = await page.evaluate(async ({ url, tok }) => {
      try {
        const r = await fetch(url, {
          headers: { 'X-Auth-Token': tok, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/' },
          signal: AbortSignal.timeout(60000),
        });
        if (!r.ok) return { error: `HTTP ${r.status}` };
        return { body: await r.json() };
      } catch (e) { return { error: e.message }; }
    }, { url: buildUrl(window), tok: token });

    await snap('shiftmgr-final.png');
    if (result.error) { console.error('[shift-mgr] in-browser fetch error:', result.error); return null; }
    return extractRows(result.body);
  } catch (e) {
    console.error('[auth] Playwright error:', e.message);
    await snap('shiftmgr-error.png');
    return null;
  } finally {
    await browser.close();
  }
}

async function main() {
  const window = resolveWindow();
  const table = window.isRange ? 'shift_manager_range' : 'shift_manager_monthly';
  const onConflict = window.isRange ? 'loc,geid,period_start,period_end' : 'loc,period_month,geid';
  console.log(window.isRange
    ? `[shift-mgr] explicit range ${window.first}…${window.last} → ${table} × ${STORE_NSNS.length} stores`
    : `[shift-mgr] period ${window.period} (${window.first}…${window.last}) → ${table} × ${STORE_NSNS.length} stores`);

  let rawRows = null;
  console.log('[auth] trying direct server-side fetch via getFreshToken()…');
  try {
    const tok = await resolveToken(getFreshToken, false);
    try {
      rawRows = await fetchDirect(tok, window);
    } catch (e) {
      if (String(e.message).startsWith('AUTH_FAILED')) {
        console.log('[auth]   cached token rejected — forcing a re-mint and retrying once');
        const freshTok = await resolveToken(getFreshToken, true);
        rawRows = await fetchDirect(freshTok, window);
      } else throw e;
    }
    console.log('[auth] ✓ getFreshToken() accepted');
  } catch (e) {
    console.log(`[auth] mint-and-fetch failed (${e.message}) — falling back to Playwright`);
  }
  if (rawRows == null) {
    rawRows = await fetchViaPlaywright(window);
  }
  if (rawRows == null) { console.error('[shift-mgr] ✗ no auth method succeeded'); process.exit(1); }

  const records = parseShiftManagerSummary(rawRows);      // Manager Total rows, real geid
  const rows = aggregate(records, window);
  const stores = new Set(rows.map(r => r.loc)).size;
  console.log(`[shift-mgr] ${records.length} manager-total rows → ${rows.length} managers × ${stores} stores`);
  if (!rows.length) { console.error('[shift-mgr] ✗ no manager rows (check timeSlices / auth)'); process.exit(1); }
  const saved = await upsert(rows, table, onConflict);
  console.log(`[shift-mgr] ✓ ${saved} manager rows upserted to ${table}`);
  if (!saved) process.exit(1);
}

main().catch(err => { console.error('[shift-mgr] FATAL:', err); process.exit(1); });
