#!/usr/bin/env node
// scripts/qsrsoft-pay-history-pull.mjs
// QSRSoft employee-pay-details -- real historical pay-period wage data, crew AND management,
// keyed by geid. Owner request 2026-11-05 ("we can also infer wages in the past from this
// report"), surfaced mid-session while reviewing the LifeLenz crew-roster pay-rate fix. See
// supabase/schema-qsr-employee-pay-history.sql's header for the full measurement + architecture
// decision (this table becomes PRIMARY for Pay Rate History; the LifeLenz-roster and
// qsr_employee_tenure mechanisms stay as fallback/cross-check, not removed).
//
// Endpoint (confirmed live 2026-11-05, owner-captured DevTools request, re-verified against a
// wide 2018-2026 date range -- same /data_layer/v1/ family as qsrsoft-punch-times-pull.mjs and
// qsrsoft-ops-pull.mjs, ONE STORE PER CALL like punch-times, not the all-27-stores-in-one-call
// shape some /service/ endpoints in this family use):
//   GET https://api.reports.myqsrsoft.com/data_layer/v1/people/employee-pay-details
//       ?nsd=d&nsn=<single NSN>&orgId=<org>&enterpriseName=McDonalds
//       &startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&weekStart=3&selectCols=<allowlist>
//   -> { result: [ {storeNum, geid, startDate, endDate, payType, hourlyPayRate, jobTitleCode,
//                   totalHours, isFinal, totalDollars, ...} ] }
// A single call accepts a WIDE multi-year range and returns every pay period in it (measured:
// one store, 2018-01-01..2026-11-03, returned 7377 rows spanning 2020-08-05..2026-10-21 in one
// request) -- unlike punch-times, no MAX_CHUNK_DAYS=14-style chunking is required for the API
// itself to work, but this script still chunks (default much wider, see MAX_CHUNK_DAYS below)
// purely as a request-size/timeout safety margin for a cold-start multi-year backfill.
//
// PII: NO name field requested (fullEmployeeName/firstName/lastName exist on this endpoint per
// the owner's own original capture, but are deliberately never asked for) -- geid is the stable
// person key, same identity-resolution pattern qsrsoft-punch-times-pull.mjs already uses
// (resolveEmployeeIdentity(): geid -> qsr_employee_tenure.full_employee_name at READ time, never
// stored redundantly here). assertNoDeniedSelectCols() fails loudly if SELECT_COLS is ever
// widened to include a denied field -- same guard shape as every other QSRSoft pull in this repo.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth -- tried in order (matches every other QSRSoft pull in this repo, post-#312):
//   getFreshToken()    -- mints a Cognito ID token per run (scripts/lib/qsrsoft-auth.mjs)
//   QSRSOFT_USERNAME + QSRSOFT_PASSWORD -- Playwright fallback (also required for getFreshToken)
// Optional:
//   QSRSOFT_PAY_DAYS_BACK    -- first-run history, daily rolling mode (default 60)
//   QSRSOFT_PAY_DAYS_RECENT  -- rolling re-pull window, catches late pay-period corrections (default 21)
//   QSRSOFT_PAY_START_DATE / QSRSOFT_PAY_END_DATE -- explicit backfill window (use this for the
//     real historical backfill -- e.g. QSRSOFT_PAY_START_DATE=2018-01-01 -- not DAYS_BACK, which
//     is sized for the daily incremental case only)
//   QSRSOFT_PAY_STORES      -- subset of NSNs, comma-separated (default: all 27)
//   QSRSOFT_PAY_MAX_CHUNK_DAYS -- per-request window size (default 365)
//   QSRSOFT_PAY_DEBUG       -- '1' for verbose logging
//
// Manual-upload fallback: deliberately NOT built, same reasoning qsrsoft-punch-times-pull.mjs's
// header already gives for punch data -- nobody manually re-keys historical per-period pay rates
// from a spreadsheet, and this isn't a report QSRSoft exposes as a franchisee-facing download.

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { withRetry } from './_retry.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';
import { getFreshToken } from './lib/qsrsoft-auth.mjs';

const BASE   = 'https://api.reports.myqsrsoft.com';
const ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const REPORT_URL = 'https://v3.myqsrsoft.com/reports/mcd/people/empPayDetails'; // from the owner's own capture

const STORE_NSNS = (process.env.QSRSOFT_PAY_STORES
  ? process.env.QSRSOFT_PAY_STORES.split(',').map(s => s.trim())
  : [
    3708, 5183, 5985, 6178, 6838, 6972, 10034, 10422, 10915, 11657, 13113, 18213,
    20475, 24471, 29760, 31357, 32525, 33109, 33222, 33704, 34222, 35064, 35242,
    37566, 38609, 43380, 43701,
  ]).map(String);
const STORE_LOCS = STORE_NSNS.map(n => String(n).padStart(7, '0'));

const DAYS_BACK      = parseInt(process.env.QSRSOFT_PAY_DAYS_BACK   || '60', 10);
const DAYS_RECENT    = parseInt(process.env.QSRSOFT_PAY_DAYS_RECENT || '21', 10);
const START_DATE     = (process.env.QSRSOFT_PAY_START_DATE || '').trim();
const END_DATE       = (process.env.QSRSOFT_PAY_END_DATE   || '').trim();
const DEBUG          = process.env.QSRSOFT_PAY_DEBUG === '1';
const MAX_CHUNK_DAYS = parseInt(process.env.QSRSOFT_PAY_MAX_CHUNK_DAYS || '365', 10);

// ── The allowlist, hard-coded and reviewable -- every field this script asks QSRSoft for, and
// nothing else. No ssn, no name, no address/phone/email. jobTitleCode/jobTitleDescription are
// job metadata, not PII.
export const SELECT_COLS = [
  'geid', 'payType', 'hourlyPayRate', 'jobTitleCode', 'jobTitleDescription',
  'totalHours', 'totalDollars', 'isFinal',
];

// Same denylist shape as qsrsoft-punch-times-pull.mjs / qsrsoft-employee-roster-pull.mjs --
// case-insensitive substring match so a near-variant is still caught.
const DENIED_SELECT_COLS = [
  'ssn', 'socialsecuritynumber', 'dateofbirth', 'birthday', 'dob',
  'nationalorigin', 'race', 'gender', 'sex', 'federalmaritalstatus', 'maritalstatus',
  'address', 'streetaddress', 'city', 'zipcode', 'postalcode',
  'emailaddress', 'email', 'phone', 'mobilephone', 'homephone', 'emergencycontact',
  'name', 'employeename', 'fullemployeename', 'firstname', 'lastname', 'legalname',
  'payrollid', 'lawsoncode', 'badgetype', // not denied for privacy, just never requested -- not needed
];
export function assertNoDeniedSelectCols(cols = SELECT_COLS) {
  const lower = cols.map(c => String(c).toLowerCase());
  const hits = lower.filter(c => DENIED_SELECT_COLS.some(denied => c.includes(denied)));
  if (hits.length) {
    throw new Error(
      `[pay-history] SELECT_COLS widened to include a denied/unwanted field: ${hits.join(', ')}. ` +
      `This fails loudly on purpose, do not remove.`
    );
  }
}
assertNoDeniedSelectCols();

function fmtDate(d) { return d.toISOString().slice(0, 10); }
function addDay(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
const nsn7 = n => String(n).padStart(7, '0');

function chunkDateRange(startDate, endDate, maxDays = MAX_CHUNK_DAYS) {
  const chunks = [];
  let cur = new Date(startDate + 'T12:00:00Z');
  const end = new Date(endDate + 'T12:00:00Z');
  while (cur <= end) {
    const chunkEndCandidate = addDay(cur, maxDays - 1);
    const chunkEnd = chunkEndCandidate > end ? end : chunkEndCandidate;
    chunks.push({ start: fmtDate(cur), end: fmtDate(chunkEnd) });
    cur = addDay(chunkEnd, 1);
  }
  return chunks;
}

function buildUrl(nsn, startDate, endDate) {
  const params = new URLSearchParams({
    nsd: 'd', nsn: String(nsn), orgId: ORG_ID, enterpriseName: 'McDonalds',
    startDate, endDate, weekStart: '3', selectCols: SELECT_COLS.join(','),
  });
  return `${BASE}/data_layer/v1/people/employee-pay-details?${params}`;
}

// Same defensive multi-shape envelope every /data_layer/v1/ or /reporting/v2/ endpoint in this
// repo has turned out to need (see qsrsoft-punch-times-pull.mjs's extractRows()).
export function extractRows(body, unit) {
  if (Array.isArray(body)) return body;
  const rows = body?.result?.resp || body?.resp || body?.result || body?.data;
  if (Array.isArray(rows)) return rows;
  if (body && typeof body === 'object') {
    const shape = Object.entries(body).map(([k, v]) =>
      Array.isArray(v) ? `${k}[${v.length}]` : `${k}:${v === null ? 'null' : typeof v}`).join(' ');
    console.error(`[pay-history] ${unit}: unrecognized envelope -- top-level shape: {${shape}}`);
  } else {
    console.error(`[pay-history] ${unit}: unrecognized body type: ${typeof body}`);
  }
  return [];
}

// Response row -> the shape saveRows() expects. No supabase/fetch dependency -- unit-testable
// directly. payType is passed through as a raw string, never matched against a hardcoded enum
// ('Regular'/'Overtime' are the two values measured live, but an unrecognized value must still
// save, not drop -- same discipline qsrsoft-punch-times-pull.mjs's mapRow() uses for badgeType).
export function mapRow(r, nsn) {
  return {
    loc:            nsn7(r.storeNum ?? nsn),
    geid:           (r.geid == null ? '' : String(r.geid).trim()) || null,
    payType:        r.payType ?? null,
    periodStart:    r.startDate || null,
    periodEnd:      r.endDate || null,
    hourlyPayRate:  (r.hourlyPayRate === '' || r.hourlyPayRate == null) ? null : Number(r.hourlyPayRate),
    totalHours:     (r.totalHours === '' || r.totalHours == null) ? null : Number(r.totalHours),
    totalDollars:   (r.totalDollars === '' || r.totalDollars == null) ? null : Number(r.totalDollars),
    isFinal:        r.isFinal == null ? null : /^y(es)?$/i.test(String(r.isFinal).trim()),
    jobTitleCode:   r.jobTitleCode ?? null,
  };
}

const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

async function saveRows(rows) {
  if (!rows.length) return 0;
  const upsert = rows
    .filter(r => r.loc && r.geid && r.payType && r.periodStart) // PK: loc,geid,pay_type,period_start
    .map(r => ({
      loc:             r.loc,
      geid:            r.geid,
      pay_type:        r.payType,
      period_start:    r.periodStart,
      period_end:      r.periodEnd,
      hourly_pay_rate: r.hourlyPayRate,
      total_hours:     r.totalHours,
      total_dollars:   r.totalDollars,
      is_final:        r.isFinal,
      job_title_code:  r.jobTitleCode,
      updated_at:      new Date().toISOString(),
    }));
  const CHUNK = 500;
  let saved = 0;
  for (let i = 0; i < upsert.length; i += CHUNK) {
    const batch = upsert.slice(i, i + CHUNK);
    const { error } = await withRetry(
      () => supabase.from('qsr_employee_pay_period_history').upsert(batch, { onConflict: 'tenant_id,loc,geid,pay_type,period_start' }),
      { label: 'qsr_employee_pay_period_history upsert' });
    if (error) throw error;
    saved += batch.length;
  }
  return saved;
}

// ── Gap detection (mirrors every other QSRSoft pull in this repo) ──────────────────────────────
async function getLatestDate() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('qsr_employee_pay_period_history').select('period_start')
    .order('period_start', { ascending: false }).limit(1).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[pay-history] getLatestDate() read failed -- ${error.code}: ${error.message}`);
  }
  return data?.period_start ? new Date(data.period_start + 'T00:00:00') : null;
}

async function getDateRange() {
  const today = new Date();
  if (START_DATE) {
    const e = END_DATE || fmtDate(today);
    console.log(`[pay-history] explicit backfill window ${START_DATE} → ${e}`);
    return { startDate: START_DATE, endDate: e, latestForFreshness: await getLatestDate() };
  }
  const latest = await getLatestDate();
  const daysSince = latest ? Math.floor((today - latest) / 86400000) : DAYS_BACK;
  const back = Math.min(Math.max(DAYS_RECENT, daysSince + DAYS_RECENT), DAYS_BACK);
  const s = fmtDate(addDay(today, -back));
  console.log(latest
    ? `[pay-history] latest in DB: ${fmtDate(latest)} (${daysSince}d ago) — pulling ${back} days back`
    : `[pay-history] no existing data — pulling ${back} days of history (run with QSRSOFT_PAY_START_DATE for a real historical backfill)`);
  return { startDate: s, endDate: fmtDate(today), latestForFreshness: latest };
}

// ── Fetch (direct or Playwright in-browser) ────────────────────────────────────────────────────
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

async function fetchDirect(token, nsn, startDate, endDate) {
  const url = buildUrl(nsn, startDate, endDate);
  if (DEBUG) console.log(`[pay-history] GET ${url.slice(0, 150)}…`);
  const resp = await fetch(url, {
    headers: { 'X-Auth-Token': token, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': REPORT_URL, 'User-Agent': UA },
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 200)}`);
  return extractRows(await resp.json(), `${nsn}:${startDate}..${endDate}`);
}

async function resolveToken(token, forceRemint) {
  return typeof token === 'function' ? await token({ forceRemint }) : token;
}

async function runDirect(token, chunks, tracker, coveredStores) {
  let total = 0;
  for (const nsn of STORE_NSNS) {
    for (const chunk of chunks) {
      const unit = `${nsn}:${chunk.start}..${chunk.end}`;
      try {
        const tok = await resolveToken(token, false);
        let rows;
        try {
          rows = await fetchDirect(tok, nsn, chunk.start, chunk.end);
        } catch (e) {
          if (String(e.message).startsWith('AUTH_FAILED') && typeof token === 'function') {
            console.log(`[pay-history] ${unit}: cached token rejected — forcing a re-mint and retrying once`);
            const freshTok = await resolveToken(token, true);
            rows = await fetchDirect(freshTok, nsn, chunk.start, chunk.end);
          } else throw e;
        }
        if (!rows.length) { console.log(`[pay-history] ${unit}: 0 rows`); continue; }
        const mapped = rows.map(r => mapRow(r, nsn)).filter(r => r.loc && r.geid);
        const dropped = rows.length - mapped.length;
        if (dropped) console.log(`[pay-history] ${unit}: ${dropped}/${rows.length} row(s) dropped (missing geid/loc)`);
        const n = await saveRows(mapped);
        total += n;
        if (n) coveredStores.add(nsn7(nsn));
        console.log(`[pay-history] ${unit}: ${rows.length} rows → ${n} saved`);
      } catch (e) {
        if (String(e.message).startsWith('AUTH_FAILED')) throw e; // bubble up for Playwright fallback
        console.error(`[pay-history] ${unit} ERROR: ${e.message}`);
        tracker.fail(unit, e.message);
      }
      await new Promise(r => setTimeout(r, 150));
    }
  }
  return total;
}

// ── Path B: Playwright ──────────────────────────────────────────────────────────────────────────
async function viaPlaywright(chunks, tracker, coveredStores) {
  const u = process.env.QSRSOFT_USERNAME, pw = process.env.QSRSOFT_PASSWORD;
  if (!u || !pw) { console.error('[auth] no QSRSOFT_USERNAME/PASSWORD — cannot use Playwright fallback'); return null; }
  const { chromium } = await import('playwright');
  const { mkdirSync } = await import('node:fs');
  try { mkdirSync('screenshots', { recursive: true }); } catch {}
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ userAgent: UA })).newPage();
  page.setDefaultTimeout(180000);
  const snap = name => page.screenshot({ path: `screenshots/${name}`, fullPage: true }).catch(() => {});
  const wait = ms => new Promise(r => setTimeout(r, ms));

  let token = null;
  page.on('request', req => {
    if (!req.url().includes('api.reports.myqsrsoft.com')) return;
    const t = req.headers()['x-auth-token'];
    if (t && t.length > 20 && !token) token = t;
  });

  try {
    console.log('[auth] navigating to v3.myqsrsoft.com…');
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    const userSel = ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email', 'input[autocomplete="username"]'].join(', ');
    const found = await page.waitForSelector(userSel, { timeout: 20000 }).then(() => true).catch(() => false);
    if (found) {
      await page.fill(userSel, u);
      await page.fill('input[type="password"], input[name="password"]', pw);
      await page.click('button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")');
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    }
    await snap('pay-history-01-post-login.png');
    console.log('[auth] post-login url:', page.url());

    await page.goto(REPORT_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await wait(3000);
    await snap('pay-history-02-report.png');
    console.log('[auth] report url:', page.url(), '| token captured:', !!token);

    if (!token) { console.error('[auth] ✗ could not capture a pay-details token'); await snap('pay-history-error.png'); return null; }
    console.log(`[auth] ✓ token captured (${token.length} chars) — pulling ${STORE_NSNS.length} stores × ${chunks.length} chunk(s)…`);

    let totalSaved = 0;
    for (const nsn of STORE_NSNS) {
      for (const chunk of chunks) {
        const unit = `${nsn}:${chunk.start}..${chunk.end}`;
        const result = await page.evaluate(async ({ url, tok }) => {
          try {
            const r = await fetch(url, { headers: { 'X-Auth-Token': tok, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com' }, signal: AbortSignal.timeout(30000) });
            if (!r.ok) return { error: `HTTP ${r.status}` };
            return { body: await r.json() };
          } catch (e) { return { error: e.message }; }
        }, { url: buildUrl(nsn, chunk.start, chunk.end), tok: token });

        if (result.error) {
          console.error(`[pay-history] ${unit} ERROR: ${result.error}`);
          tracker.fail(unit, result.error);
        } else {
          const rows = extractRows(result.body, unit);
          if (!rows.length) { console.log(`[pay-history] ${unit}: 0 rows`); }
          else {
            const mapped = rows.map(r => mapRow(r, nsn)).filter(r => r.loc && r.geid);
            const n = await saveRows(mapped);
            totalSaved += n;
            if (n) coveredStores.add(nsn7(nsn));
            console.log(`[pay-history] ${unit}: ${rows.length} rows → ${n} saved`);
          }
        }
        await wait(100);
      }
    }
    await snap('pay-history-final.png');
    return totalSaved;
  } catch (e) {
    console.error('[auth] Playwright error:', e.message);
    await snap('pay-history-error.png');
    return null;
  } finally {
    await browser.close();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[pay-history] Missing Supabase env'); process.exit(1);
  }

  const { startDate, endDate, latestForFreshness } = await getDateRange();
  const fresh = checkFreshness(latestForFreshness, { warnAfterHours: 54, errorAfterHours: 240, label: 'pay-history' });
  if (fresh.message) (fresh.status === 'error' ? console.error : console.warn)(fresh.message);

  const chunks = chunkDateRange(startDate, endDate, MAX_CHUNK_DAYS);
  console.log(`[pay-history] ${STORE_NSNS.length} store(s) × ${chunks.length} chunk(s): ${startDate} → ${endDate} (~${STORE_NSNS.length * chunks.length} requests)`);

  const tracker = makeOutcomeTracker('pay-history');
  const coveredStores = new Set();
  const requestedUnits = STORE_NSNS.flatMap(nsn => chunks.map(c => `${nsn}:${c.start}..${c.end}`));

  let totalSaved = 0;
  try {
    totalSaved = await runDirect(getFreshToken, chunks, tracker, coveredStores);
  } catch (e) {
    console.log(`[auth] mint-and-fetch failed (${e.message}) — falling back to Playwright`);
    totalSaved = await viaPlaywright(chunks, tracker, coveredStores) || 0;
  }

  console.log(`[pay-history] done — ${totalSaved} rows saved.`);
  logPartitionCoverage(coveredStores, STORE_LOCS, { label: 'pay-history', kind: 'store' });
  const code = tracker.finalize({
    requestedUnits, totalSaved,
    formatRerun: () => `QSRSOFT_PAY_START_DATE=${startDate} QSRSOFT_PAY_END_DATE=${endDate}`,
  });
  process.exit(code);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[pay-history] FATAL:', e); process.exit(1); });
}
