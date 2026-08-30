#!/usr/bin/env node
// scripts/qsrsoft-employee-roster-pull.mjs
// QSRSoft Employee Roster → (1) per-store active role-bucket counts, monthly
// (roster_role_counts, unchanged) AND (2) per-person tenure (qsr_employee_tenure,
// dispatch #57 / #56 Part B).
// (1) feeds the Performance-Review "# Shift Certified Managers" metric (Cert Swing +
// Dept Mgrs). Headcount itself comes from Roster Statistics.
//
// PRIVACY: the Employee Roster catalog carries heavy PII (SSN, DOB, address, phone,
// protected-class fields). This pull requests an ALLOWLIST selectCols so SSN/DOB/
// address/protected-class fields never leave QSRSoft at all — never mind never being
// stored. assertNoDeniedSelectCols() (below) fails loudly at import time if a future
// edit ever widens SELECT_COLS to include one of them.
//
// 🔴 As of dispatch #57 (owner-approved 2026-08-21, reversing an earlier deliberate
// decision), individual-employee data — name, both start dates, job title, status,
// pay rate — IS now persisted, in qsr_employee_tenure. roster_role_counts stays an
// aggregate-only table, unchanged; this is additive, not a replacement. Full scoping:
// memory/dispatch-57.md.
//
// Endpoint (confirmed 2026-07-28, one call returns all stores):
//   GET https://api.reports.myqsrsoft.com/reporting/v2/people/employee-roster
//       ?catalogType=employeeRoster&nsd=d&nsn=<csv>&orgId=<org>&enterpriseName=McDonalds
//       &startDate=YYYY-MM-01&endDate=YYYY-MM-DD&weekStart=3
//       &locationType=home&employmentStatus=active&selectCols=<allowlist>
//   → { result: [ {storeNum, geid, fullEmployeeName, orgStartDate, storeStartDate,
//                  storeEndDate, employmentStatus, locationType, terminationEntryDate,
//                  terminationReason, jobTitleCode, jobCodeType, jobTitleCodeDescription,
//                  jobTitleCodeStartDate, hourlyPayRate} ] }
// Parsed with parseEmployeeRosterApi() + rosterCounts() from src/engine/people-reports.js
// (the SAME engine the manual xlsx-upload path uses — one source of truth).
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Auth — tried in order:
//   getFreshToken()    — mints a Cognito ID token per run (scripts/lib/qsrsoft-auth.mjs).
//                        QSRSOFT_TOKEN and QSRSOFT_COGNITO_TOKEN are the SAME credential
//                        (a ~1h-TTL Cognito ID token) -- a value stored as a static secret
//                        is stale ~23/24 hours by construction, no matter how often it's
//                        rotated, so every run was falling straight through to Playwright.
//                        Neither env var is read here anymore.
//   QSRSOFT_USERNAME + QSRSOFT_PASSWORD — Playwright fallback (unchanged -- still the
//                        required env for BOTH paths, since getFreshToken() also mints
//                        from these same two secrets)
// Optional: ROSTER_PERIOD=YYYY-MM · ROSTER_STORES=3708,… · QSRSOFT_DEBUG=1

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { parseEmployeeRosterApi, rosterCounts } from '../src/engine/people-reports.js';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { getFreshToken } from './lib/qsrsoft-auth.mjs';

const API_BASE   = 'https://api.reports.myqsrsoft.com';
const ORG_ID     = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const ENTERPRISE = 'McDonalds';
const REPORT_URL = 'https://v3.myqsrsoft.com/reports/mcd/people/employeeRoster';
const DEBUG      = process.env.QSRSOFT_DEBUG === '1';

// Job-code + status + (as of dispatch #57) name/tenure/pay fields. Still an ALLOWLIST,
// not a denylist — nothing outside this set is ever requested. Adding orgStartDate
// (dispatch #57's own "half of Part B" — not previously fetched at all) and
// hourlyPayRate (the approved pay-rate column) alongside the pre-existing set.
export const SELECT_COLS = [
  'homeLocation', 'geid', 'orgStartDate', 'storeStartDate', 'storeEndDate', 'employmentStatus',
  'locationType', 'fullEmployeeName', 'terminationEntryDate', 'terminationReason',
  'jobTitleCode', 'jobCodeType', 'jobTitleCodeDescription', 'jobTitleCodeStartDate',
  'hourlyPayRate',
];

// 🔴 These field names were never on the table and dispatch #57's "do it all" does NOT
// authorise them — they stay excluded from SELECT_COLS permanently. Two reasons, both
// still live: (1) ssn must never leave QSRSoft — selectCols is caller-chosen, so this
// costs nothing; (2) nationalOrigin/gender/dateOfBirth/federalMaritalStatus are
// protected-class attributes — storing them beside performance data makes it possible
// to compute a metric split by race/age/sex BY ACCIDENT, not a hypothetical in a system
// that auto-correlates metric pairs (the Signals Scanner). Case-insensitive substring
// match so a near-variant (e.g. "dob", "socialSecurityNumber") is still caught.
const DENIED_SELECT_COLS = [
  'ssn', 'socialsecuritynumber', 'dateofbirth', 'birthday', 'dob',
  'nationalorigin', 'race', 'gender', 'sex', 'federalmaritalstatus', 'maritalstatus',
  'address', 'streetaddress', 'city', 'zipcode', 'postalcode',
  'emailaddress', 'email', 'phone', 'mobilephone', 'homephone', 'emergencycontact',
];
export function assertNoDeniedSelectCols(cols = SELECT_COLS) {
  const lower = cols.map(c => String(c).toLowerCase());
  const hits = lower.filter(c => DENIED_SELECT_COLS.some(denied => c.includes(denied)));
  if (hits.length) {
    throw new Error(
      `[employee-roster] SELECT_COLS widened to include a denied PII/protected-class field: ` +
      `${hits.join(', ')}. See dispatch-57.md — this fails loudly on purpose, do not remove.`
    );
  }
}
assertNoDeniedSelectCols();

const STORE_NSNS = (process.env.ROSTER_STORES
  ? process.env.ROSTER_STORES.split(',').map(s => s.trim())
  : [
    3708, 5183, 5985, 6178, 6838, 6972,
    10034, 10422, 10915, 11657, 13113, 18213,
    20475, 24471, 29760, 31357, 32525, 33109,
    33222, 33704, 34222, 35064, 35242, 37566,
    38609, 43380, 43701,
  ]).map(String);

// Guarded, not unconditional -- toTenureRows()/assertNoDeniedSelectCols() are unit-tested by
// importing this module directly (no supabase/fetch dependency in those functions themselves),
// and vitest's environment has neither env var set. An unconditional createClient() call at
// module scope would throw at import time before a test could even reach them -- same pattern
// qsrsoft-register-audit-pull.mjs already uses for its own mapRow()/extractRows() tests.
const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

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
    weekStart: '3', locationType: 'home', employmentStatus: 'active', selectCols: SELECT_COLS.join(','),
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

// parseEmployeeRosterApi() records → qsr_employee_tenure columns. geid is the PK (a
// stable QSRSoft person key), so a record without one can't be keyed and is dropped —
// same "drop, don't fabricate a placeholder key" contract as every other normalizer in
// this repo. loc is re-padded to 7 chars here (records carry the unpadded form
// rosterCounts()/roster_role_counts use) — the SAME padStart(7,'0') convention every
// other QSRSoft pull script already uses, not a second one.
export function toTenureRows(records) {
  return (records || [])
    .filter(r => r && r.geid != null && String(r.geid).trim() !== '')
    .map(r => ({
      loc: String(r.loc).padStart(7, '0'),
      geid: String(r.geid),
      full_employee_name: r.name || null,
      employment_status: r.employmentStatus || null,
      location_type: r.locationType || null,
      org_start_date: r.orgStartDate || null,
      store_start_date: r.startDate || null,
      store_end_date: r.endDate || null,
      termination_entry_date: r.terminationDate || null,
      termination_reason: r.terminationReason || null,
      job_title_code: r.primaryCode ?? null,
      job_code_type: r.jobCodeType || null,
      job_title_code_description: r.primaryDesc || null,
      job_title_code_start_date: r.jobCodeStartDate || null,
      hourly_pay_rate: r.hourlyPayRate ?? null,
      updated_at: new Date().toISOString(),
    }));
}

async function upsertTenure(rows) {
  if (!rows.length) return 0;
  const CHUNK = 500; let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from('qsr_employee_tenure')
      .upsert(slice, { onConflict: 'tenant_id,loc,geid' });
    if (error) throw new Error(`[qsr_employee_tenure] ${error.message}`);
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

// Resolves either a plain token string (Playwright mode) or the getFreshToken function
// itself (direct-API mode). One forced re-mint-and-retry on an AUTH_FAILED rejection of a
// nominally-fresh cached token -- mirrors qsrsoft-dar-pull.mjs's resolveToken()/runDirect().
async function resolveToken(token, forceRemint) {
  return typeof token === 'function' ? await token({ forceRemint }) : token;
}

async function fetchDirectWithRetry(token, period) {
  const tok = await resolveToken(token, false);
  try {
    return await fetchDirect(tok, period);
  } catch (e) {
    if (String(e.message).startsWith('AUTH_FAILED') && typeof token === 'function') {
      console.log('[auth]   cached token rejected — forcing a re-mint and retrying once');
      const freshTok = await resolveToken(token, true);
      return await fetchDirect(freshTok, period);
    }
    throw e;
  }
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
  console.log('[auth] trying direct server-side fetch via getFreshToken()…');
  try {
    rawRows = await fetchDirectWithRetry(getFreshToken, period);
    console.log('[auth] ✓ getFreshToken() accepted');
  } catch (e) {
    console.log(`[auth] mint-and-fetch failed (${e.message}) — falling back to Playwright`);
  }
  if (rawRows == null) {
    rawRows = await fetchViaPlaywright(period);
  }
  if (rawRows == null) { console.error('[employee-roster] ✗ no auth method succeeded'); process.exit(1); }

  const records = parseEmployeeRosterApi(rawRows);          // job-code/status/name/tenure/pay -- see header
  const byLoc = rosterCounts(records);                      // active-only bucket counts per loc
  const rows = toRows(byLoc, period);
  const found = Object.keys(byLoc).length;
  console.log(`[employee-roster] ${records.length} active employees → ${found} stores`);
  const saved = await upsert(rows);
  console.log(`[employee-roster] ✓ ${saved} store rows upserted to roster_role_counts for ${period}`);

  // Dispatch #57: per-person tenure, additive to the aggregate above. Independent success --
  // a tenure-upsert failure must not roll back or block the roster_role_counts write that
  // already succeeded above.
  const tenureRows = toTenureRows(records);
  const tenureSaved = await upsertTenure(tenureRows);
  console.log(`[employee-roster] ✓ ${tenureSaved} person rows upserted to qsr_employee_tenure`);

  // #263: a store missing from the response could be a genuine zero-active-employee
  // store, but a THIRD of the district missing at once is far more likely an API/org
  // filter problem than 9 real zero-employee stores in the same run -- track it as a
  // failed unit so the threshold below can tell "one odd store" from "the pull broke".
  const tracker = makeOutcomeTracker('employee-roster');
  for (const loc of STORE_NSNS) if (!byLoc[loc]) tracker.fail(loc, 'missing from API response');
  const code = tracker.finalize({
    requestedUnits: STORE_NSNS, totalSaved: saved,
    formatRerun: missing => `ROSTER_STORES=${missing.join(',')}`,
  });
  if (code) process.exit(code);
}

// Only run main() when executed directly (not when imported for unit tests — see
// register-audit-pull.mjs's own use of this same guard, mapRow()/extractRows() precedent).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error('[employee-roster] FATAL:', err); process.exit(1); });
}
