#!/usr/bin/env node
// scripts/qsrsoft-sales-quarter-hour-pull.mjs
// QSRSoft quarter-hour sales totals -- true 15-minute sales buckets, all 27 stores.
// API: https://api.reports.myqsrsoft.com/v1/reports/shift/daily-activity-raw
// One API call per day covers ALL 27 stores simultaneously -- same endpoint and shape
// scripts/qsrsoft-dar-pull.mjs already drives for the HOURLY qsr_daily_activity table;
// this script requests the IDENTICAL endpoint with segmentBy/timeInterval='quarterHour'
// instead of 'hour', writing to the new qsr_sales_quarter_hour table. See
// supabase/schema-qsr-sales-quarter-hour.sql's header for the full "why" and the
// architecture decision (pre-aggregated sales endpoint, not item-level Product Mix).
//
// Built for Record Hour in Sales (src/engine/record-hour.js): the best 60-CONSECUTIVE-
// MINUTE sliding window of sales a store has ever had, any 15-min-aligned start.
//
// ⚠️ UNVERIFIED AGAINST LIVE QSRSOFT: this was written without QSRSoft credentials
// available (sandboxed dev session) -- segmentBy/timeInterval='quarterHour' is a
// reasoned extrapolation from the API's existing 'hour' behavior and the endpoint's own
// `endQtrHourTime` field name (see schema file), not a live-confirmed parameter value.
// This script logs a loud diagnostic on the FIRST day of its FIRST real run (distinct
// qtr_slot count) specifically so that run is the actual measurement, per CLAUDE.md's
// "measure it, don't reason about it" rule -- check the Action's run log after this
// first deploys, and do not assume Record Hour's numbers are trustworthy before that
// log confirms more than 24 distinct slots/store/day are coming back.
//
// Required env vars:
//   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Auth -- same two-path pattern as every other QSRSoft pull (CLAUDE.md "Adding a new
// automated pull" checklist):
//   getFreshToken()              -- mints a Cognito ID token per run (scripts/lib/
//                                    qsrsoft-auth.mjs), resolved PER DATE (dispatch #82)
//   QSRSOFT_USERNAME + PASSWORD  -- Playwright fallback: logs in, navigates to the Daily
//                                    Activity report (same page DAR uses -- this is the
//                                    same endpoint), captures token, fetches in-browser
//
// Optional:
//   QSRSOFT_QTRHR_DAYS_BACK    -- max history on first run (default: 90)
//   QSRSOFT_QTRHR_DAYS_RECENT  -- rolling re-pull window (default: 4)
//   QSRSOFT_QTRHR_FORCE_FULL   -- set to '1' to ignore existing data and pull full range
//   QSRSOFT_QTRHR_START_DATE / QSRSOFT_QTRHR_END_DATE -- explicit backfill window
//   QSRSOFT_QTRHR_DEBUG        -- set to '1' for verbose logging

import { createClient } from '@supabase/supabase-js';
import { withRetry } from './_retry.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';
import { getFreshToken } from './lib/qsrsoft-auth.mjs';

const BASE     = 'https://api.reports.myqsrsoft.com';
const ORG_ID   = 'a546d4ef-684a-4f25-8bc0-6580af068875';

const STORE_NSNS = [
  3708,  5183,  5985,  6178,  6838,  6972,
  10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109,
  33222, 33704, 34222, 35064, 35242, 37566,
  38609, 43380, 43701,
];

const DAYS_BACK   = parseInt(process.env.QSRSOFT_QTRHR_DAYS_BACK   || '90', 10);
const DAYS_RECENT = parseInt(process.env.QSRSOFT_QTRHR_DAYS_RECENT || '4',  10);
const START_DATE  = (process.env.QSRSOFT_QTRHR_START_DATE || '').trim();
const END_DATE    = (process.env.QSRSOFT_QTRHR_END_DATE   || '').trim();
const FORCE_FULL  = process.env.QSRSOFT_QTRHR_FORCE_FULL === '1';
const DEBUG       = process.env.QSRSOFT_QTRHR_DEBUG      === '1';

// Minimal column set -- sales totals only, not the full ~40-field DAR column list.
// Record Hour only needs net sales (+ transactions/DT split for future use); it has no
// use for speed-of-service fields at quarter-hour grain.
const SELECT_COLS = [
  'transactions', 'productSales', 'allNetSales',
  'dt_transactions', 'dt_allNetSales',
].join(',');

function fmtDate(d) { return d.toISOString().slice(0, 10); }
function addDay(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function nv(v) { return v ?? 0; }
function nsn7(n) { return String(n).padStart(7, '0'); }

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── Gap detection ─────────────────────────────────────────────────────────────
async function getLatestDate() {
  const { data, error } = await supabase
    .from('qsr_sales_quarter_hour')
    .select('dt')
    .order('dt', { ascending: false })
    .limit(1)
    .single();
  if (error) {
    // PGRST116 = "Results contain 0 rows" -- the only error code that means "no
    // existing data" rather than "the read didn't happen" (matches dar-pull.mjs's #399
    // fix exactly -- a failed read must never silently pick the big DAYS_BACK branch).
    if (error.code === 'PGRST116') return null;
    throw new Error(`[qtrhr-pull] getLatestDate() read failed -- ${error.code}: ${error.message}`);
  }
  return data?.dt ? new Date(data.dt + 'T12:00:00Z') : null;
}

async function getDateRange() {
  const today = new Date();
  if (START_DATE) {
    const e = END_DATE || fmtDate(today);
    console.log(`[qtrhr-pull] explicit backfill window ${START_DATE} → ${e}`);
    return { startDate: START_DATE, endDate: e };
  }
  if (FORCE_FULL) {
    const s = fmtDate(addDay(today, -DAYS_BACK));
    const e = fmtDate(today);
    console.log(`[qtrhr-pull] force_full=1 — pulling ${DAYS_BACK} days (${s} → ${e})`);
    return { startDate: s, endDate: e };
  }
  const latest = await getLatestDate();
  if (!latest) {
    const s = fmtDate(addDay(today, -DAYS_BACK));
    console.log(`[qtrhr-pull] no existing data — pulling ${DAYS_BACK} days from ${s}`);
    return { startDate: s, endDate: fmtDate(today) };
  }
  const daysSince   = Math.floor((today - latest) / 86400000);
  const daysToFetch = Math.min(Math.max(DAYS_RECENT, daysSince + DAYS_RECENT), DAYS_BACK);
  const s = fmtDate(addDay(today, -daysToFetch));
  console.log(`[qtrhr-pull] latest ${fmtDate(latest)} (${daysSince}d ago) — pulling ${daysToFetch} days`);
  return { startDate: s, endDate: fmtDate(today) };
}

// ── Row mapping ───────────────────────────────────────────────────────────────
function mapRow(row, date) {
  return {
    loc:             nsn7(row.nsn),
    dt:              date,
    qtr_slot:        row.endQtrHourTime,
    transactions:    nv(row.transactions),
    product_sales:   nv(row.productSales),
    net_sales:       nv(row.allNetSales),
    dt_transactions: nv(row.dt_transactions),
    dt_sales:        nv(row.dt_allNetSales),
    updated_at:      new Date().toISOString(),
  };
}

// ── Supabase upsert ───────────────────────────────────────────────────────────
async function upsertBatch(records) {
  if (!records.length) return 0;
  const SIZE = 500;
  let total = 0;
  for (let i = 0; i < records.length; i += SIZE) {
    const batch = records.slice(i, i + SIZE);
    const { error } = await withRetry(
      () => supabase.from('qsr_sales_quarter_hour').upsert(batch, { onConflict: 'loc,dt,qtr_slot' }),
      { label: 'qsr_sales_quarter_hour upsert' });
    if (error) throw error;
    total += batch.length;
  }
  return total;
}

function buildUrl(date) {
  const params = new URLSearchParams({
    // Same single whole-day 'open-close' segment DAR uses for its own hourly pull --
    // segmentBy/timeInterval is what tells the API how finely to slice that one window.
    timeSegment: 'openClose', segmentBy: 'quarterHour',
    segmentNames: 'open-close', segmentsSelected: 'open-close',
    nsd: 'd', nsn: STORE_NSNS.join(','), orgId: ORG_ID,
    enterpriseName: 'McDonalds', startDate: date, endDate: date,
    compType: 'trading', weekStart: '3', timeInterval: 'quarterHour',
    selectCols: SELECT_COLS,
  });
  return `${BASE}/v1/reports/shift/daily-activity-raw?${params}`;
}

// First-day diagnostic -- see this file's header. Logged once per run, not per date.
let _diagnosticLogged = false;
function logFirstDayDiagnostic(rows) {
  if (_diagnosticLogged || !rows.length) return;
  _diagnosticLogged = true;
  const slots = new Set(rows.map(r => r.endQtrHourTime));
  const perStore = rows.length / STORE_NSNS.length;
  console.log(`[qtrhr-pull] DIAGNOSTIC (first day): ${rows.length} rows, ${slots.size} distinct ` +
    `qtr_slot values, ~${perStore.toFixed(1)} rows/store. Sample slots: ${[...slots].sort().slice(0, 8).join(',')}...`);
  if (slots.size <= 24) {
    console.warn('[qtrhr-pull] ⚠️  WARNING: 24 or fewer distinct slots seen — the API may have ' +
      'ignored segmentBy/timeInterval=quarterHour and returned HOURLY granularity instead ' +
      '(the same shape qsr_daily_activity already has). Record Hour needs true 15-minute ' +
      'buckets to compute a real rolling 60-minute window — do not trust it until this is ' +
      'fixed. See this file\'s header comment.');
  }
}

// ── Path A: direct server-side fetch ─────────────────────────────────────────
async function fetchDayDirect(token, date) {
  const url = buildUrl(date);
  if (DEBUG) console.log(`[qtrhr-pull] GET ${url.slice(0, 120)}...`);
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': token,
      'Accept':       'application/json',
      'Origin':       'https://v3.myqsrsoft.com',
      'Referer':      'https://v3.myqsrsoft.com/',
      'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const body = await resp.json();
  return Array.isArray(body) ? body : (Array.isArray(body?.result) ? body.result : []);
}

async function resolveToken(token, forceRemint) {
  return typeof token === 'function' ? await token({ forceRemint }) : token;
}

async function runDirect(token, dates, tracker, coveredStores) {
  let totalRows = 0;
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    try {
      const tok = await resolveToken(token, false);
      let rows;
      try {
        rows = await fetchDayDirect(tok, date);
      } catch (e) {
        if (String(e.message).startsWith('AUTH_FAILED') && typeof token === 'function') {
          console.log(`[qtrhr-pull]   ${date}: cached token rejected — forcing a re-mint and retrying once`);
          const freshTok = await resolveToken(token, true);
          rows = await fetchDayDirect(freshTok, date);
        } else throw e;
      }
      if (!rows.length) { console.log(`[qtrhr-pull]   ${date}: no data`); continue; }
      logFirstDayDiagnostic(rows);
      const records = rows.map(r => mapRow(r, date));
      const n = await upsertBatch(records);
      totalRows += n;
      if (coveredStores) for (const r of records) coveredStores.add(r.loc);
      console.log(`[qtrhr-pull]   ${date}: ${rows.length} rows → ${n} upserted`);
    } catch (e) {
      if (e.message.startsWith('AUTH_FAILED')) throw e; // bubble up for fallback
      console.error(`[qtrhr-pull]   ${date} ERROR: ${e.message}`);
      tracker.fail(date, e.message);
    }
    if (i < dates.length - 1) await new Promise(r => setTimeout(r, 150));
  }
  return totalRows;
}

// ── Path B: Playwright login → in-browser fetches ────────────────────────────
// Reuses the exact Daily Activity page qsrsoft-dar-pull.mjs's Playwright fallback
// navigates to -- same auth token works for both reports (same endpoint family).
async function pullViaPlaywright(dates, tracker, coveredStores) {
  const u  = process.env.QSRSOFT_USERNAME;
  const pw = process.env.QSRSOFT_PASSWORD;
  if (!u || !pw) {
    console.error('[auth] QSRSOFT_USERNAME or QSRSOFT_PASSWORD not set — cannot use Playwright fallback');
    return null;
  }

  const { chromium } = await import('playwright');
  const { mkdirSync } = await import('fs');
  try { mkdirSync('screenshots', { recursive: true }); } catch {}

  console.log('[auth] launching Playwright…');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);

  let token = null;
  page.on('request', req => {
    if (!req.url().includes('api.reports.myqsrsoft.com')) return;
    const t = req.headers()['x-auth-token'];
    if (t && t.length > 20 && !token) {
      token = t;
      if (DEBUG) console.log('[auth] token captured from:', req.url().replace(/\?.*/, ''));
    }
  });

  const snap = (name) => page.screenshot({ path: `screenshots/${name}`, fullPage: true }).catch(() => {});
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  try {
    console.log('[auth] navigating to v3.myqsrsoft.com…');
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    await snap('qtrhr-01-landing.png');

    const userSel = [
      'input[name="username"]', 'input[name="email"]', 'input[type="email"]',
      '#username', '#email', 'input[autocomplete="username"]',
      'input[placeholder*="email" i]', 'input[placeholder*="username" i]',
    ].join(', ');
    await page.waitForSelector(userSel, { timeout: 20000 });
    await page.fill(userSel, u);
    await page.fill('input[type="password"], input[name="password"]', pw);
    await page.click('button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await snap('qtrhr-02-post-login.png');

    console.log('[auth] navigating to Daily Activity report…');
    await page.goto('https://v3.myqsrsoft.com/reports/mcd/shift/dailyActivity', {
      waitUntil: 'networkidle', timeout: 30000,
    });
    await wait(3000);
    await snap('qtrhr-03-daily-activity.png');

    if (!token) {
      console.log('[auth] token not captured from navigation — attempting in-browser fetch to trigger auth…');
      const today = fmtDate(new Date());
      const testUrl = buildUrl(today);
      await page.evaluate(async ({ url }) => {
        try { const r = await fetch(url, { credentials: 'include' }); return { status: r.status, ok: r.ok }; }
        catch (e) { return { error: e.message }; }
      }, { url: testUrl });
      await wait(2000);
    }

    if (!token) {
      console.error('[auth] ✗ could not capture token');
      await snap('qtrhr-error.png');
      return null;
    }
    console.log(`[auth] ✓ token captured (${token.length} chars) — fetching ${dates.length} dates…`);

    let totalUpserted = 0;
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const url = buildUrl(date);
      const result = await page.evaluate(async ({ url, token }) => {
        try {
          const r = await fetch(url, {
            headers: { 'X-Auth-Token': token, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/' },
            signal: AbortSignal.timeout(20000),
          });
          if (!r.ok) return { error: `HTTP ${r.status}` };
          const body = await r.json();
          return { rows: Array.isArray(body) ? body : (body?.result || []) };
        } catch (e) { return { error: e.message }; }
      }, { url, token });

      if (result.error) {
        console.error(`[qtrhr-pull]   ${date} ERROR: ${result.error}`);
        tracker.fail(date, result.error);
      } else if (!result.rows.length) {
        console.log(`[qtrhr-pull]   ${date}: no data`);
      } else {
        logFirstDayDiagnostic(result.rows);
        const records = result.rows.map(r => mapRow(r, date));
        const n = await upsertBatch(records);
        totalUpserted += n;
        if (coveredStores) for (const r of records) coveredStores.add(r.loc);
        console.log(`[qtrhr-pull]   ${date}: ${result.rows.length} rows → ${n} upserted`);
      }
      if (i < dates.length - 1) await new Promise(r => setTimeout(r, 100));
    }

    await snap('qtrhr-final.png');
    return totalUpserted;

  } catch (e) {
    console.error('[auth] Playwright error:', e.message);
    await page.screenshot({ path: 'screenshots/qtrhr-error.png', fullPage: true }).catch(() => {});
    return null;
  } finally {
    await browser.close();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const latestForFreshness = await getLatestDate();
  const fresh = checkFreshness(latestForFreshness, { warnAfterHours: 30, errorAfterHours: 54, label: 'qtrhr-pull' });
  if (fresh.message) (fresh.status === 'error' ? console.error : console.warn)(fresh.message);

  const { startDate, endDate } = await getDateRange();

  const dates = [];
  for (let d = new Date(startDate + 'T12:00:00Z'); fmtDate(d) <= endDate; d = addDay(d, 1)) {
    dates.push(fmtDate(d));
  }
  console.log(`[qtrhr-pull] ${dates.length} dates × ${STORE_NSNS.length} stores (~${dates.length * STORE_NSNS.length * 96} rows expected if quarter-hour grain is honored)`);
  const STORE_LOCS = STORE_NSNS.map(n => nsn7(n));
  const coveredStores = new Set();

  const finalizeAndExit = (totalSaved, tracker) => {
    logPartitionCoverage(coveredStores, STORE_LOCS, { label: 'qtrhr-pull', kind: 'store' });
    const code = tracker.finalize({
      requestedUnits: dates, totalSaved,
      formatRerun: failedDates => failedDates
        .map(d => `QSRSOFT_QTRHR_START_DATE=${d} QSRSOFT_QTRHR_END_DATE=${d}`).join('  ||  '),
    });
    if (code) process.exit(code);
  };

  console.log('[auth] trying direct server-side fetch via getFreshToken()…');
  {
    const tracker = makeOutcomeTracker('qtrhr-pull');
    try {
      const total = await runDirect(getFreshToken, dates, tracker, coveredStores);
      console.log(`[qtrhr-pull] done. Total: ${total} rows`);
      finalizeAndExit(total, tracker);
      return;
    } catch (e) {
      console.log(`[auth] mint-and-fetch failed (${e.message}) — falling back to Playwright`);
    }
  }

  const pwTracker = makeOutcomeTracker('qtrhr-pull');
  const totalSaved = await pullViaPlaywright(dates, pwTracker, coveredStores);
  if (totalSaved === null) {
    console.error('[qtrhr-pull] no auth method succeeded — set QSRSOFT_TOKEN or QSRSOFT_USERNAME+PASSWORD');
    process.exit(1);
  }
  console.log(`[qtrhr-pull] done. ${totalSaved} rows upserted`);
  finalizeAndExit(totalSaved, pwTracker);
}

main().catch(e => { console.error('[qtrhr-pull] FATAL:', e); process.exit(1); });
