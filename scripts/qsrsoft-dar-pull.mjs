#!/usr/bin/env node
// scripts/qsrsoft-dar-pull.mjs
// QSRSoft Daily Activity Report — hourly intraday data for all 27 stores
// API: https://api.reports.myqsrsoft.com/v1/reports/shift/daily-activity-raw
// One API call per day covers ALL 27 stores simultaneously.
//
// Required env vars:
//   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Auth — tried in order:
//   getFreshToken()    — mints a Cognito ID token per run (scripts/lib/qsrsoft-auth.mjs),
//                        resolved PER DATE rather than once at the top (dispatch #82 /
//                        memory/project-qsrsoft-cognito-auth-312.md): a stored QSRSOFT_TOKEN
//                        is a ~1h-TTL Cognito token, stale ~23/24 hours by construction, no
//                        matter how often it's rotated -- every run was falling straight
//                        through to Playwright. QSRSOFT_TOKEN itself is no longer read here.
//   QSRSOFT_USERNAME + QSRSOFT_PASSWORD — Playwright fallback: logs in, navigates
//                        to Daily Activity page, captures token, fetches in-browser
//                        (unchanged -- still the required env for BOTH paths, since
//                        getFreshToken() also mints from these same two secrets)
//
// Optional:
//   QSRSOFT_DAR_DAYS_BACK   — max history on first run (default: 90)
//   QSRSOFT_DAR_DAYS_RECENT — rolling re-pull window (default: 7)
//   QSRSOFT_DAR_FORCE_FULL  — set to '1' to ignore existing data and pull full range
//   QSRSOFT_DAR_DEBUG       — set to '1' for verbose logging

import { createClient } from '@supabase/supabase-js';
import { withRetry } from './_retry.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';
import { getFreshToken } from './lib/qsrsoft-auth.mjs';

const DAR_BASE  = 'https://api.reports.myqsrsoft.com';
const ORG_ID    = 'a546d4ef-684a-4f25-8bc0-6580af068875';

const STORE_NSNS = [
  3708,  5183,  5985,  6178,  6838,  6972,
  10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109,
  33222, 33704, 34222, 35064, 35242, 37566,
  38609, 43380, 43701,
];

const DAYS_BACK   = parseInt(process.env.QSRSOFT_DAR_DAYS_BACK   || '90', 10);
const DAYS_RECENT = parseInt(process.env.QSRSOFT_DAR_DAYS_RECENT || '4',  10);
// Explicit backfill window (YYYY-MM-DD). When set, overrides the rolling logic —
// pull exactly this range. Lets a 1-2 year backfill run in safe chunks (quarters).
const START_DATE  = (process.env.QSRSOFT_DAR_START_DATE || '').trim();
const END_DATE    = (process.env.QSRSOFT_DAR_END_DATE   || '').trim();
const FORCE_FULL  = process.env.QSRSOFT_DAR_FORCE_FULL === '1';
const DEBUG       = process.env.QSRSOFT_DAR_DEBUG      === '1';

// mop_transactions (added 2026-09-02, backlog-master-2026-08-19.md line 659) -- Mobile Order &
// Pay guest count, one leg alongside dt_transactions/is_transactions. Field name taken verbatim
// from QSRSoft's own extracted columnFactory bundle (memory/project-qsrsoft-dar-columns.md: "MOP
// GC = mop_transactions"), not guessed. Requires supabase/schema-qsr-dar-mop-transactions.sql to
// be applied first -- both qsr_daily_activity and its rollup upsert the WHOLE row, so a missing
// column fails that date's entire save, not just this one field.
const SELECT_COLS = [
  'transactions','productSales','allNetSales',
  'dt_transactions','dt_allNetSales','is_transactions','is_allNetSales','mop_transactions',
  'transScrubbed','prodSalesScrubbed',
  'dt_trans_cnt','dt_untilserve','dt_untilstore','dt_untilrecall','dt_heldtime','dt_carsheld',
  'fc_trans_cnt','fc_untilserve','fc_untilclosedrawer',
  'mfy1_itemscount','mfy1_trans_cnt','mfy1_untilserve',
  'mfy2_itemscount','mfy2_trans_cnt','mfy2_untilserve',
  'bev_trans_cnt','bev_itemscount','bev_untilserve','bev_untilclosedrawer',
  'actualPunchedHours','totalScheduledHours','totalNeededHours',
  'salariedManagerScheduledHours','actualPunchedDollars',
  'healthy_count','unhealthy_count',
  'projectedTransScrubbed','projectedDTTransScrubbed','projectedInStoreTransScrubbed',
  'projectedProdSalesScrubbed','projectedKVSItemsScrubbed',
  'totalTransactions','dtTransactions','salesDollars','sandwichCounts','inStoreProjTrans',
  'totalSalesMean','totalTransactionsMean','totalDriveThruTransactionsMean',
  'totalSandwichesMean','totalFryHashesMean','totalBeveragesMean',
].join(',');

function fmtDate(d) { return d.toISOString().slice(0, 10); }
function addDay(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function nv(v) { return v ?? 0; }

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── Gap detection ─────────────────────────────────────────────────────────────
async function getLatestDate() {
  const { data, error } = await supabase
    .from('qsr_daily_activity')
    .select('dt')
    .order('dt', { ascending: false })
    .limit(1)
    .single();
  if (error) {
    // PGRST116 = "Results contain 0 rows" -- .single() rejects a genuinely empty
    // table the same way it rejects a failed query, so this is the ONLY error code
    // that means "no existing data" rather than "the read didn't happen". Anything
    // else (network, RLS, timeout, Cloudflare 522...) must abort, not fall through
    // to the DAYS_BACK branch below -- a failed read has no business picking the
    // 91-day/61k-row branch over the 5-day one (#399).
    if (error.code === 'PGRST116') return null;
    throw new Error(`[dar-pull] getLatestDate() read failed -- ${error.code}: ${error.message}`);
  }
  return data?.dt ? new Date(data.dt + 'T12:00:00Z') : null;
}

async function getDateRange() {
  const today = new Date();
  if (START_DATE) {
    const e = END_DATE || fmtDate(today);
    console.log(`[dar-pull] explicit backfill window ${START_DATE} → ${e}`);
    return { startDate: START_DATE, endDate: e };
  }
  if (FORCE_FULL) {
    const s = fmtDate(addDay(today, -DAYS_BACK));
    const e = fmtDate(today);
    console.log(`[dar-pull] force_full=1 — pulling ${DAYS_BACK} days (${s} → ${e})`);
    return { startDate: s, endDate: e };
  }
  const latest = await getLatestDate();
  if (!latest) {
    const s = fmtDate(addDay(today, -DAYS_BACK));
    console.log(`[dar-pull] no existing data — pulling ${DAYS_BACK} days from ${s}`);
    return { startDate: s, endDate: fmtDate(today) };
  }
  const daysSince   = Math.floor((today - latest) / 86400000);
  const daysToFetch = Math.min(Math.max(DAYS_RECENT, daysSince + DAYS_RECENT), DAYS_BACK);
  const s = fmtDate(addDay(today, -daysToFetch));
  console.log(`[dar-pull] latest ${fmtDate(latest)} (${daysSince}d ago) — pulling ${daysToFetch} days`);
  return { startDate: s, endDate: fmtDate(today) };
}

// ── Row mapping ───────────────────────────────────────────────────────────────
function mapRow(row, date) {
  return {
    loc:       String(row.nsn).padStart(7, '0'),
    dt:        date,
    hour_slot: row.endQtrHourTime,
    transactions:        nv(row.transactions),
    product_sales:       nv(row.productSales ?? row.prodSalesScrubbed),
    net_sales:           nv(row.allNetSales),
    dt_transactions:     nv(row.dt_transactions),
    dt_sales:            nv(row.dt_allNetSales),
    is_transactions:     nv(row.is_transactions),
    is_sales:            nv(row.is_allNetSales),
    mop_transactions:    nv(row.mop_transactions),
    trans_scrubbed:      nv(row.transScrubbed),
    prod_sales_scrubbed: nv(row.prodSalesScrubbed),
    dt_trans_cnt:        nv(row.dt_trans_cnt),
    dt_untilserve:       nv(row.dt_untilserve),
    dt_untilstore:       nv(row.dt_untilstore),
    dt_untilrecall:      nv(row.dt_untilrecall),
    dt_heldtime:         nv(row.dt_heldtime),
    dt_carsheld:         nv(row.dt_carsheld),
    fc_trans_cnt:        nv(row.fc_trans_cnt),
    fc_untilserve:       nv(row.fc_untilserve),
    fc_untilclosedrawer: nv(row.fc_untilclosedrawer),
    mfy1_itemscount:     nv(row.mfy1_itemscount),
    mfy1_trans_cnt:      nv(row.mfy1_trans_cnt),
    mfy1_untilserve:     nv(row.mfy1_untilserve),
    mfy2_itemscount:     nv(row.mfy2_itemscount),
    mfy2_trans_cnt:      nv(row.mfy2_trans_cnt),
    mfy2_untilserve:     nv(row.mfy2_untilserve),
    bev_trans_cnt:       nv(row.bev_trans_cnt),
    bev_itemscount:      nv(row.bev_itemscount),
    bev_untilserve:      nv(row.bev_untilserve),
    bev_untilclosedrawer:nv(row.bev_untilclosedrawer),
    actual_punched_hours:             nv(row.actualPunchedHours),
    total_scheduled_hours:            nv(row.totalScheduledHours),
    total_needed_hours:               nv(row.totalNeededHours),
    salaried_manager_scheduled_hours: nv(row.salariedManagerScheduledHours),
    actual_punched_dollars:           nv(row.actualPunchedDollars),
    healthy_count:   nv(row.healthy_count),
    unhealthy_count: nv(row.unhealthy_count),
    proj_trans_scrubbed:      nv(row.projectedTransScrubbed),
    proj_dt_trans_scrubbed:   nv(row.projectedDTTransScrubbed),
    proj_is_trans_scrubbed:   nv(row.projectedInStoreTransScrubbed),
    proj_prod_sales_scrubbed: nv(row.projectedProdSalesScrubbed),
    proj_kvs_items_scrubbed:  nv(row.projectedKVSItemsScrubbed),
    proj_total_transactions:  nv(row.totalTransactions),
    proj_dt_transactions:     nv(row.dtTransactions),
    proj_sales_dollars:       nv(row.salesDollars),
    proj_sandwich_counts:     nv(row.sandwichCounts),
    proj_is_transactions:     nv(row.inStoreProjTrans),
    mean_sales:           nv(row.totalSalesMean),
    mean_transactions:    nv(row.totalTransactionsMean),
    mean_dt_transactions: nv(row.totalDriveThruTransactionsMean),
    mean_sandwiches:      nv(row.totalSandwichesMean),
    mean_fry_hashes:      nv(row.totalFryHashesMean),
    mean_beverages:       nv(row.totalBeveragesMean),
    ly_transactions:    nv(row['ly.transactions']),
    ly_product_sales:   nv(row['ly.productSales']),
    ly_dt_transactions: nv(row['ly.dt_transactions']),
    ly_dt_sales:        nv(row['ly.dt_allNetSales']),
    ly_is_transactions: nv(row['ly.is_transactions']),
    ly_sales_dollars:   nv(row['ly.salesDollars']),
    ly_punched_hours:   nv(row['ly.actualPunchedHours']),
    updated_at: new Date().toISOString(),
  };
}

// ── Daily rollup maintenance ─────────────────────────────────────────────────
// qsr_daily_activity is HOURLY (~675 rows/day). The client used to page ~40,000 of
// those rows over ~40 requests to build a per-(loc,dt) summary on every login — the
// single heaviest load in the app. qsr_daily_activity_rollup holds that summary
// pre-aggregated (~1,650 rows for a 60-day window, 2 requests).
//
// So the rollup MUST be refreshed whenever the hourly rows change, or the app shows
// data frozen at the last backfill. Summing `records` is exact: fetchDayDirect returns
// the WHOLE day for every store, so a batch is the complete set for that date — the
// same grouping the backfill does in SQL.
//
// tenant_id is deliberately not set here. The set_tenant_id() trigger
// (schema-qsr-rollup-tenant-trigger.sql) supplies it, exactly as it does for every
// other table this script writes — service_role has no auth.uid() to derive it from.
async function refreshRollup(records, date) {
  const byLoc = new Map();
  const add = (o, k, v) => { o[k] = (o[k] || 0) + (Number(v) || 0); };
  for (const r of records) {
    if (!byLoc.has(r.loc)) byLoc.set(r.loc, { loc: r.loc, dt: date });
    const a = byLoc.get(r.loc);
    add(a, 'product_sales',           r.product_sales);
    add(a, 'transactions',            r.transactions);
    add(a, 'mop_transactions',        r.mop_transactions);
    add(a, 'healthy_count',           r.healthy_count);
    add(a, 'unhealthy_count',         r.unhealthy_count);
    add(a, 'dt_untilserve',           r.dt_untilserve);
    add(a, 'dt_untilstore',           r.dt_untilstore);
    add(a, 'dt_trans_cnt',            r.dt_trans_cnt);
    add(a, 'dt_carsheld',             r.dt_carsheld);
    add(a, 'dt_heldtime',             r.dt_heldtime);
    add(a, 'fc_untilserve',           r.fc_untilserve);
    add(a, 'fc_untilclosedrawer',     r.fc_untilclosedrawer);
    add(a, 'fc_trans_cnt',            r.fc_trans_cnt);
    // mfy1 + mfy2 collapse to one pair, matching the backfill and the client's own
    // KVS-time derivation.
    add(a, 'mfy_untilserve',          (Number(r.mfy1_untilserve) || 0) + (Number(r.mfy2_untilserve) || 0));
    add(a, 'mfy_trans_cnt',           (Number(r.mfy1_trans_cnt)  || 0) + (Number(r.mfy2_trans_cnt)  || 0));
    add(a, 'proj_total_transactions', r.proj_total_transactions);
    add(a, 'proj_sales_dollars',      r.proj_sales_dollars);
    add(a, 'ly_product_sales',        r.ly_product_sales);
    add(a, 'ly_transactions',         r.ly_transactions);
    add(a, 'actual_punched_hours',    r.actual_punched_hours);
    add(a, 'total_needed_hours',      r.total_needed_hours);
    // #210 — planning-vs-execution labor split. Non-fatal if the owner hasn't run
    // supabase/schema-qsr-rollup-scheduled-hours.sql yet: the upsert below fails as a whole
    // and is caught/logged, same as this file's dt_heldtime rollout (#183) — hourly rows are
    // already saved regardless, so this can ship ahead of the migration.
    add(a, 'total_scheduled_hours',   r.total_scheduled_hours);
  }
  const rows = [...byLoc.values()].map(r => ({ ...r, refreshed_at: new Date().toISOString() }));
  if (!rows.length) return 0;
  const { error } = await supabase
    .from('qsr_daily_activity_rollup')
    .upsert(rows, { onConflict: 'loc,dt' });
  if (error) {
    // Non-fatal: the hourly rows are already saved and the client falls back to them.
    console.error(`[dar-pull]   rollup refresh FAILED for ${date}: ${error.message}`);
    return 0;
  }
  return rows.length;
}

// ── Supabase upsert ───────────────────────────────────────────────────────────
async function upsertBatch(records) {
  if (!records.length) return 0;
  const SIZE = 500;
  let total = 0;
  for (let i = 0; i < records.length; i += SIZE) {
    const batch = records.slice(i, i + SIZE);
    const { error } = await withRetry(
      () => supabase.from('qsr_daily_activity').upsert(batch, { onConflict: 'loc,dt,hour_slot' }),
      { label: 'qsr_daily_activity upsert' });
    if (error) throw error;
    total += batch.length;
  }
  return total;
}

function buildUrl(date) {
  const params = new URLSearchParams({
    timeSegment: 'openClose', segmentBy: 'hour',
    segmentNames: 'open-close', segmentsSelected: 'open-close',
    nsd: 'd', nsn: STORE_NSNS.join(','), orgId: ORG_ID,
    enterpriseName: 'McDonalds', startDate: date, endDate: date,
    compType: 'trading', weekStart: '3', timeInterval: 'hour',
    selectCols: SELECT_COLS,
  });
  return `${DAR_BASE}/v1/reports/shift/daily-activity-raw?${params}`;
}

// ── Path A: direct server-side fetch ─────────────────────────────────────────
async function fetchDayDirect(token, date) {
  const url = buildUrl(date);
  if (DEBUG) console.log(`[dar-pull] GET ${url.slice(0, 120)}...`);
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
  const rows = Array.isArray(body) ? body : (Array.isArray(body?.result) ? body.result : []);
  // TEMP diagnostic (dispatch: mop_transactions verification) — mop_transactions is landing as 0
  // on every row post-merge despite real MOP volume in sales_ledger_daily for the same store/date
  // (store 3708, 2026-09-01: 178 MOP guests via Sales Ledger, 0 via this pull for all 24 hours).
  // Dump every key on a busy row once, plus anything mop-shaped, to find the real field name/
  // location before assuming the selectCols name is wrong. Remove after diagnosis.
  if (DEBUG && !globalThis.__mopDumped && rows.length) {
    const busy = rows.find(r => Number(r.transactions) > 20) || rows[0];
    globalThis.__mopDumped = true;
    console.log('[MOP-DEBUG] row keys:', Object.keys(busy).join(', '));
    const mopKeys = Object.keys(busy).filter(k => /mop/i.test(k));
    console.log('[MOP-DEBUG] mop-shaped keys:', mopKeys.length ? JSON.stringify(Object.fromEntries(mopKeys.map(k => [k, busy[k]]))) : '(none found)');
    console.log('[MOP-DEBUG] full busy row:', JSON.stringify(busy));
  }
  return rows;
}

// Resolves either a plain token string (Playwright mode) or the getFreshToken function itself
// (direct-API mode) — per date, so a multi-day backfill re-mints transparently near expiry
// instead of a single mint sailing past its ~1h TTL mid-run (mirrors qsrsoft-ops-pull.mjs).
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
          console.log(`[dar-pull]   ${date}: cached token rejected — forcing a re-mint and retrying once`);
          const freshTok = await resolveToken(token, true);
          rows = await fetchDayDirect(freshTok, date);
        } else throw e;
      }
      if (!rows.length) { console.log(`[dar-pull]   ${date}: no data`); continue; }
      const records = rows.map(r => mapRow(r, date));
      const n = await upsertBatch(records);
      totalRows += n;
      if (coveredStores) for (const r of records) coveredStores.add(r.loc);
      const rolled = await refreshRollup(records, date);
      console.log(`[dar-pull]   ${date}: ${rows.length} rows → ${n} upserted, ${rolled} rollup`);
    } catch (e) {
      if (e.message.startsWith('AUTH_FAILED')) throw e; // bubble up for fallback
      console.error(`[dar-pull]   ${date} ERROR: ${e.message}`);
      tracker.fail(date, e.message);
    }
    if (i < dates.length - 1) await new Promise(r => setTimeout(r, 150));
  }
  return totalRows;
}

// ── Path B: Playwright login → in-browser fetches ────────────────────────────
async function pullViaPlaywright(dates, tracker, coveredStores) {
  const u = process.env.QSRSOFT_USERNAME;
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

  let darToken = null;
  page.on('request', req => {
    if (!req.url().includes('api.reports.myqsrsoft.com')) return;
    const t = req.headers()['x-auth-token'];
    if (t && t.length > 20 && !darToken) {
      darToken = t;
      if (DEBUG) console.log('[auth] DAR token captured from:', req.url().replace(/\?.*/, ''));
    }
  });

  const snap = (name) => page.screenshot({ path: `screenshots/${name}`, fullPage: true }).catch(() => {});
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  try {
    // ── Login ──
    console.log('[auth] navigating to v3.myqsrsoft.com…');
    await page.goto('https://v3.myqsrsoft.com', { waitUntil: 'networkidle', timeout: 45000 });
    await snap('dar-01-landing.png');

    const userSel = [
      'input[name="username"]','input[name="email"]','input[type="email"]',
      '#username','#email','input[autocomplete="username"]',
      'input[placeholder*="email" i]','input[placeholder*="username" i]',
    ].join(', ');
    await page.waitForSelector(userSel, { timeout: 20000 });
    await page.fill(userSel, u);
    await page.fill('input[type="password"], input[name="password"]', pw);
    await page.click('button[type="submit"], input[type="submit"], .btn-primary, button:has-text("Login"), button:has-text("Sign in")');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await snap('dar-02-post-login.png');
    console.log('[auth] post-login url:', page.url());

    // ── Navigate to Daily Activity page to trigger api.reports.myqsrsoft.com calls ──
    console.log('[auth] navigating to Daily Activity report…');
    await page.goto('https://v3.myqsrsoft.com/reports/mcd/shift/dailyActivity', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await wait(3000);
    await snap('dar-03-daily-activity.png');
    console.log('[auth] daily activity url:', page.url(), '| token captured:', !!darToken);

    if (!darToken) {
      // Token not yet captured — the page may not have auto-fired a request.
      // Try fetching a URL from within the browser to trigger the auth flow.
      console.log('[auth] token not captured from navigation — attempting in-browser fetch to trigger auth…');
      const today = fmtDate(new Date());
      const testUrl = buildUrl(today);
      const testResult = await page.evaluate(async ({ url }) => {
        try {
          const r = await fetch(url, { credentials: 'include' });
          return { status: r.status, ok: r.ok };
        } catch (e) { return { error: e.message }; }
      }, { url: testUrl });
      console.log('[auth] in-browser test fetch result:', JSON.stringify(testResult));
      await wait(2000);
    }

    if (!darToken) {
      console.error('[auth] ✗ could not capture DAR token');
      await snap('dar-error.png');
      // #263: this is a TOTAL auth failure (no token, zero dates attempted), not a
      // real zero-row result -- must return null like every other auth-exhausted path
      // in this file, or main()'s `=== null` check silently treats it as success.
      return null;
    }
    console.log(`[auth] ✓ DAR token captured (${darToken.length} chars) — fetching ${dates.length} dates…`);

    // ── One page.evaluate() per date — real-time progress, incremental upsert ──
    let totalUpserted = 0;
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const url = buildUrl(date);
      const result = await page.evaluate(async ({ url, token }) => {
        try {
          const r = await fetch(url, {
            headers: {
              'X-Auth-Token': token,
              'Accept':       'application/json',
              'Origin':       'https://v3.myqsrsoft.com',
              'Referer':      'https://v3.myqsrsoft.com/',
            },
            signal: AbortSignal.timeout(20000),
          });
          if (!r.ok) return { error: `HTTP ${r.status}` };
          const body = await r.json();
          const rows = Array.isArray(body) ? body : (body?.result || []);
          return { rows };
        } catch (e) {
          return { error: e.message };
        }
      }, { url, token: darToken });

      if (result.error) {
        console.error(`[dar-pull]   ${date} ERROR: ${result.error}`);
        tracker.fail(date, result.error);
      } else if (!result.rows.length) {
        console.log(`[dar-pull]   ${date}: no data`);
      } else {
        const records = result.rows.map(r => mapRow(r, date));
        const n = await upsertBatch(records);
        totalUpserted += n;
        if (coveredStores) for (const r of records) coveredStores.add(r.loc);
        // Same rollup refresh as the direct path — without it, any day pulled via the
        // Playwright fallback would land in qsr_daily_activity but never reach the
        // rollup, and the app (which now reads the rollup) would silently miss it.
        const rolled = await refreshRollup(records, date);
        console.log(`[dar-pull]   ${date}: ${result.rows.length} rows → ${n} upserted, ${rolled} rollup`);
      }
      if (i < dates.length - 1) await new Promise(r => setTimeout(r, 100));
    }

    await snap('dar-final.png');
    return totalUpserted;

  } catch (e) {
    console.error('[auth] Playwright error:', e.message);
    await page.screenshot({ path: 'screenshots/dar-error.png', fullPage: true }).catch(() => {});
    return null;
  } finally {
    await browser.close();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Dispatch #32 (Workstream C): freshness SLA, in addition to (not instead of) the
  // existing gap-detection read inside getDateRange() below. warnAfterHours=30/
  // errorAfterHours=54 mirror lifelenz-pull.mjs's own thresholds (one/two missed daily
  // runs + the cron's own scheduling slack) -- this is a second, cheap single-row read,
  // not a restructure of the working gap-detection logic.
  const latestForFreshness = await getLatestDate();
  const fresh = checkFreshness(latestForFreshness, { warnAfterHours: 30, errorAfterHours: 54, label: 'dar-pull' });
  if (fresh.message) (fresh.status === 'error' ? console.error : console.warn)(fresh.message);

  const { startDate, endDate } = await getDateRange();

  const dates = [];
  for (let d = new Date(startDate + 'T12:00:00Z'); fmtDate(d) <= endDate; d = addDay(d, 1)) {
    dates.push(fmtDate(d));
  }
  console.log(`[dar-pull] ${dates.length} dates × ${STORE_NSNS.length} stores (~${dates.length * STORE_NSNS.length * 25} rows expected)`);
  const STORE_LOCS = STORE_NSNS.map(n => String(n).padStart(7, '0'));
  const coveredStores = new Set();

  // #263: one tracker for whichever path actually runs -- a date that failed under
  // Path A never gets counted again if Path B doesn't retry it (each path pulls the
  // FULL date list independently, they don't hand off partial progress).
  const finalizeAndExit = (totalSaved, tracker) => {
    // Dispatch #32: unconditional per-store coverage -- generalizes
    // qsrsoft-pmix-pull.mjs:427-434's own pattern. tracker.fail() above only logs
    // DATES that threw; a date that returned 200 with a partial store list (some
    // stores silently missing from the API response, no error) is invisible to that
    // -- this catches it.
    logPartitionCoverage(coveredStores, STORE_LOCS, { label: 'dar-pull', kind: 'store' });
    const code = tracker.finalize({
      requestedUnits: dates, totalSaved,
      formatRerun: failedDates => failedDates
        .map(d => `QSRSOFT_DAR_START_DATE=${d} QSRSOFT_DAR_END_DATE=${d}`).join('  ||  '),
    });
    if (code) process.exit(code);
  };

  // ── Path A: direct fetch, token minted fresh per date via getFreshToken() ──
  console.log('[auth] trying direct server-side fetch via getFreshToken()…');
  {
    const tracker = makeOutcomeTracker('dar-pull');
    try {
      const total = await runDirect(getFreshToken, dates, tracker, coveredStores);
      console.log(`[dar-pull] done. Total: ${total} rows`);
      finalizeAndExit(total, tracker);
      return;
    } catch (e) {
      console.log(`[auth] mint-and-fetch failed (${e.message}) — falling back to Playwright`);
    }
  }

  // ── Path B: Playwright ──
  const pwTracker = makeOutcomeTracker('dar-pull');
  const totalSaved = await pullViaPlaywright(dates, pwTracker, coveredStores);
  if (totalSaved === null) {
    console.error('[dar-pull] no auth method succeeded — set QSRSOFT_TOKEN or QSRSOFT_USERNAME+PASSWORD');
    process.exit(1);
  }
  console.log(`[dar-pull] done. ${totalSaved} rows upserted`);
  finalizeAndExit(totalSaved, pwTracker);
}

main().catch(e => { console.error('[dar-pull] FATAL:', e); process.exit(1); });
