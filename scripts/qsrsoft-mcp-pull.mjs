#!/usr/bin/env node
// scripts/qsrsoft-mcp-pull.mjs
// QSRSoft Native MCP Server pull — Time Slice Summary + Service Time Statistics.
//
// WHY THIS EXISTS: QSRSoft's 2026-11 Operator Security Notice Letter asked operators not to
// connect third-party AI tools via credential login, and named three sanctioned alternatives,
// one of which is this MCP server. This script is the first migration slice: it pulls the 2
// report types the MCP server exposes today via a proper OAuth2 connection (reports:read scope),
// NOT a username/password login. See memory/finding-qsrsoft-security-notice-2026-11-16.md for
// the full compliance context and why this is additive, not a replacement, for the existing
// ~33 credential-login pull scripts (none of which are touched or disabled by this change).
//
// Auth: scripts/lib/qsrsoft-mcp-auth.mjs mints a fresh access token per run via OAuth
// refresh_token grant (rotating refresh token cached in Supabase qsr_mcp_token_cache — no
// username/password anywhere in this pull). There is deliberately no Playwright/second-path
// fallback here, unlike the scraping scripts: there is nothing to scrape as a fallback for a
// sanctioned API client, and if this connection breaks the existing scraping pipeline still
// covers the same metrics in parallel, so there's no new coverage gap introduced by a hard
// failure here.
//
// Both reports are "completed days only" per the server's own report descriptions — no intraday
// equivalent exists yet. Pulled once daily, segmentBy=summary (one row per store per whole
// business day), for all 27 stores, over a trailing window (so a transient failure self-heals on
// the next run without needing a manual backfill).
//
// Required env vars: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (same service-role key every
// other qsrsoft-*.mjs pull already uses — no new secret needed beyond the one-time
// qsr_mcp_token_cache seed).
// Optional: QSRSOFT_MCP_DAYS_BACK (default 4 — a short trailing window; these are completed-day
// summary reports, not a backfill-heavy stream), QSRSOFT_MCP_DEBUG=1.

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { getFreshAccessToken } from './lib/qsrsoft-mcp-auth.mjs';
import { callTool } from './lib/qsrsoft-mcp-client.mjs';

const STORE_NSNS = [
  3708, 5183, 5985, 6178, 6838, 6972, 10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109, 33222, 33704, 34222, 35064, 35242,
  37566, 38609, 43380, 43701, 44689,
];
const DAYS_BACK = parseInt(process.env.QSRSOFT_MCP_DAYS_BACK || '4', 10);
const DEBUG = process.env.QSRSOFT_MCP_DEBUG === '1';

// safeCreateClient (scripts/lib/safe-supabase-client.mjs) rather than createClient() directly —
// CI's qsrsoft-mcp-pull.test.js imports this file's pure parseReportCsv() for unit testing
// (2026-11-16) without either env var set, and an unguarded createClient(undefined, undefined)
// throws at module-load time, failing that import before any test can even run. Resolves to
// null instead when the env vars are missing; the real scheduled pull always has both set, so
// production behavior is unchanged.
const supabase = safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const nsn7 = n => String(n).padStart(7, '0');
const num = v => (v == null || v === '' || v === 'null' || isNaN(Number(v))) ? null : Number(v);
const toISO = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };

// IMPORTANT: post_queryReport's structuredContent carries only column METADATA (name/type),
// never the row values — the actual data is only in content[0].text, as a CSV block whose
// header uses the report's vendor DISPLAY LABELS (e.g. "STW GC", "DT GCs"), not the camelCase
// API field keys used to request them, and in a server-chosen column order that does NOT match
// the order the `fields` param was requested in (measured live, 2026-11-16 — do not assume
// structuredContent.grids[x].rows exists; it doesn't). So each entry here carries three things:
// [snake_case column, API field key for the `fields` request param, exact display label for
// parsing the CSV header]. Labels are copied verbatim from post_getReportDetail's
// availableColumns (the text before " - " in each definition) — do not guess or fuzzy-match
// them; "DT GCs" (totalDriveThruTransactions) and "DT GC" (dtTransactions) are different real
// fields with near-identical labels. *CompAmt vs-LY-delta fields are deliberately excluded —
// see schema file header (Meridian computes its own vs-LY via vs-ly.js).
const TIME_SLICE_FIELDS = [
  ['stw_gc', 'transactions', 'STW GC'],
  ['all_net_sales', 'allNetSales', 'All Net Sales'],
  ['avg_check', 'avgCheck', 'Average Check'],
  ['product_sales', 'productSales', 'Product Sales'],
  ['oepe', 'OEPE', 'OEPE'],
  ['oepe_no_park', 'OEPENoPark', 'OEPE W/O Parked'],
  ['r2p', 'R2P', 'R2P'],
  ['kvs_time_per_tran', 'KVSTimePerTran', 'KVS Time Per GC'],
  ['total_dt_sales', 'totalDriveThruSales', 'DT Sales'],
  ['total_dt_transactions', 'totalDriveThruTransactions', 'DT GCs'],
  ['dt_avg_check', 'dtAvgCheck', 'DT Where Ordered Avg Chk'],
  ['total_instore_sales', 'totalInStoreSales', 'All In Store Sales'],
  ['total_instore_transactions', 'totalInStoreTransactions', 'All In Store GCs'],
  ['kiosk_all_net_sales', 'kioskAllNetSales', 'Kiosk All Net Sales'],
  ['kiosk_avg_check', 'kioskAvgCheck', 'Kiosk Average Check'],
  ['delivery_all_net_sales', 'deliveryAllNetSales', '3PO McDelivery Net Sales'],
  ['delivery_avg_check', 'deliveryAvgCheck', '3PO McDelivery Average Check'],
  ['mop_all_net_sales', 'mopAllNetSales', 'MOP Sales'],
  ['fc_all_net_sales', 'fcAllNetSales', 'FC All Net Sales'],
  ['dt_all_net_sales', 'dtAllNetSales', 'DT Where Ordered Sales'],
  ['dt_transactions', 'dtTransactions', 'DT GC'],
  ['instore_all_net_sales', 'instoreAllNetSales', 'In-Store All Net Sales'],
  ['instore_transactions', 'instoreTransactions', 'In-Store GC'],
];

const SERVICE_TIME_FIELDS = [
  ['total_dt_transactions', 'totalDriveThruTransactions', 'DT GCs'],
  ['ctp', 'CTP', 'Avg CTP'],
  ['oepe', 'OEPE', 'OEPE'],
  ['oepe_no_park', 'OEPENoPark', 'OEPE W/O Parked'],
  ['dt_ttl', 'dtTTL', 'Avg DT TTL'],
  ['dt_order_time', 'dtOrderTime', 'DT Order Time'],
  ['dt_line_time', 'dtLineTime', 'DT Line Time'],
  ['dt_win1_time', 'dtWin1Time', 'DT Win1 Time'],
  ['dt_win2_time', 'dtWin2Time', 'DT Win2 Time'],
  ['dt_parked_car_time', 'dtParkedCarTime', 'DT Parked Time'],
  ['dt_parked_trans', 'dtParkedTrans', 'DT Parked Count'],
  ['dt_pct_pull_forward', 'dtPctPullForward', 'DT Parked %'],
  ['exp_transactions', 'expTransactions', 'Expeditor GC'],
  ['r2p', 'R2P', 'R2P'],
  ['kiosk_r2p', 'kioskR2P', 'Kiosk R2P'],
  ['fc_r2p', 'fcR2P', 'FC R2P'],
  ['exp_order_time', 'expOrderTime', 'FC Order Time'],
  ['exp_ttl', 'expTTL', 'FC Total Time'],
  ['kvs_transactions', 'KVSTransactions', 'KVS GC'],
  ['kvs_items', 'KVSItems', 'KVS Item'],
  ['kvs_items_per_tran', 'KVSItemsPerTran', 'KVS Items / GC'],
  ['kvs_time_per_tran', 'KVSTimePerTran', 'KVS Time Per GC'],
  ['kvs_time_per_item', 'KVSTimePerItem', 'KVS Time Per Item'],
  ['healthy_use_pct', 'healthyUsePct', 'KVS Healthy Usage'],
  ['mfy1_transactions', 'MFY1Transactions', 'MFY1 GC'],
  ['mfy1_items', 'MFY1Items', 'MFY1 Item'],
  ['mfy1_items_per_order', 'MFY1ItemsPerOrder', 'MFY1 Item/Order'],
  ['mfy1_time_per_order', 'MFY1TimePerOrder', 'MFY1 Order/Time'],
  ['mfy1_time_per_item', 'MFY1TimePerItem', 'MFY1 Item Time'],
  ['mfy2_transactions', 'MFY2Transactions', 'MFY2 GC'],
  ['mfy2_items', 'MFY2Items', 'MFY2 Item'],
  ['mfy2_items_per_order', 'MFY2ItemsPerOrder', 'MFY2 Item/Order'],
  ['mfy2_time_per_order', 'MFY2TimePerOrder', 'MFY2 Order/Time'],
  ['mfy2_time_per_item', 'MFY2TimePerItem', 'MFY2 Item Time'],
  ['bev_trans', 'bevTrans', 'Beverage GC'],
  ['bev_order_time', 'bevOrderTime', 'Beverage Order Time'],
  ['bev_run_time', 'bevRunTime', 'Beverage Run Time'],
  ['bev_ttl', 'bevTTL', 'Beverage Total Time'],
];

function parseCsvLine(line) {
  return line.split(',').map(c => c.trim());
}

/** Parses the post_queryReport text-CSV block (summary line, blank line, header, rows) into
 *  { loc: { snake_case: numberOrNull } } using fieldSpecs' [col, apiField, label] triples to
 *  match the CSV header's display labels (NOT the requested field order — see header comment). */
export function parseReportCsv(resultText, fieldSpecs) {
  const lines = String(resultText || '').split('\n').map(l => l.trimEnd());
  const headerIdx = lines.findIndex(l => /^Loc,/.test(l));
  if (headerIdx < 0) return {};
  const headerCells = parseCsvLine(lines[headerIdx]);
  const labelToCol = new Map(fieldSpecs.map(([col, , label]) => [label, col]));
  const colIdxByCol = {};
  headerCells.forEach((label, i) => {
    const col = labelToCol.get(label);
    if (col) colIdxByCol[col] = i;
  });
  const out = {};
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cells = parseCsvLine(lines[i]);
    const loc = cells[0];
    if (!loc) continue;
    const row = {};
    for (const [col] of fieldSpecs) {
      const idx = colIdxByCol[col];
      row[col] = idx != null ? num(cells[idx]) : null;
    }
    out[nsn7(loc)] = row;
  }
  return out;
}

async function pullOneDay(accessToken, reportId, dateStr, fieldSpecs) {
  const result = await callTool(accessToken, 'post_queryReport', {
    reportId,
    startDate: dateStr,
    endDate: dateStr,
    segmentBy: 'summary',
    fields: fieldSpecs.map(([, apiField]) => apiField).join(','),
  });
  const text = result?.content?.[0]?.text ?? result?.text ?? '';
  return parseReportCsv(text, fieldSpecs);
}

async function upsertRows(table, rows) {
  if (!rows.length) return 0;
  const payload = rows.map(r => ({ tenant_id: '00000000-0000-0000-0000-000000000001', updated_at: new Date().toISOString(), ...r }));
  const { error } = await supabase.from(table).upsert(payload, { onConflict: 'loc,dt' });
  if (error) { console.warn(`[supabase] upsert error for ${table}:`, error.message); return 0; }
  return payload.length;
}

async function main() {
  const accessToken = await getFreshAccessToken();
  console.log('[qsrsoft-mcp-pull] obtained fresh access token');

  const today = new Date();
  const dates = [];
  for (let i = 1; i <= DAYS_BACK; i++) dates.push(toISO(addDays(today, -i))); // yesterday back DAYS_BACK days — completed days only

  const tracker = makeOutcomeTracker('qsrsoft-mcp-pull');
  const requestedUnits = dates.map(d => `${d}`);
  const coveredDates = new Set();

  let totalTimeSliceSaved = 0;
  let totalServiceTimeSaved = 0;

  for (const dateStr of dates) {
    let timeSliceByLoc = {};
    let serviceTimeByLoc = {};
    try {
      timeSliceByLoc = await pullOneDay(accessToken, 'timeSliceSummaryReport', dateStr, TIME_SLICE_FIELDS);
    } catch (e) {
      console.warn(`  [${dateStr}] timeSliceSummaryReport: ${e.message}`);
      tracker.fail(`${dateStr}:timeSlice`, e.message);
    }
    try {
      serviceTimeByLoc = await pullOneDay(accessToken, 'serviceTimeStatsReport', dateStr, SERVICE_TIME_FIELDS);
    } catch (e) {
      console.warn(`  [${dateStr}] serviceTimeStatsReport: ${e.message}`);
      tracker.fail(`${dateStr}:serviceTime`, e.message);
    }

    const timeSliceRows = [];
    for (const nsn of STORE_NSNS) {
      const loc = nsn7(nsn);
      const r = timeSliceByLoc[loc];
      if (!r) continue;
      timeSliceRows.push({ loc, dt: dateStr, ...r });
    }
    const serviceTimeRows = [];
    for (const nsn of STORE_NSNS) {
      const loc = nsn7(nsn);
      const r = serviceTimeByLoc[loc];
      if (!r) continue;
      serviceTimeRows.push({ loc, dt: dateStr, ...r });
    }

    const savedTimeSlice = await upsertRows('qsr_mcp_time_slice_summary', timeSliceRows);
    const savedServiceTime = await upsertRows('qsr_mcp_service_time_stats', serviceTimeRows);
    totalTimeSliceSaved += savedTimeSlice;
    totalServiceTimeSaved += savedServiceTime;

    if (DEBUG) console.log(`  [${dateStr}] timeSlice: ${timeSliceRows.length} rows → ${savedTimeSlice} saved; serviceTime: ${serviceTimeRows.length} rows → ${savedServiceTime} saved`);
    if (savedTimeSlice > 0 || savedServiceTime > 0) coveredDates.add(dateStr);
  }

  console.log(`[qsrsoft-mcp-pull] ✓ time_slice_summary: ${totalTimeSliceSaved} row(s) saved; service_time_stats: ${totalServiceTimeSaved} row(s) saved, across ${coveredDates.size}/${dates.length} day(s)`);

  const code = tracker.finalize({
    requestedUnits,
    totalSaved: totalTimeSliceSaved + totalServiceTimeSaved,
    formatRerun: () => 're-run the whole workflow — no per-day rerun flag exists yet',
  });
  if (code) process.exit(code);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('[qsrsoft-mcp-pull] fatal error:', err);
    process.exit(1);
  });
}
