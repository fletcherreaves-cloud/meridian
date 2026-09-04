#!/usr/bin/env node
// scripts/qsrsoft-inventory-summary-pull.mjs — Inventory Usage sync for Inventory Intelligence
//
// Closes the gap memory/finding-inventory-summary-automation-2026-08-27.md (dispatch #178) left
// open: qsr_inventory_summary has existed, RLS-scoped and correctly read by the panel (dispatch
// #214), since before this pull existed — but nothing ever wrote to it, so the panel always showed
// "No auto data yet" and every store fell back to a manual "Inventory Summary and Usage.xlsx"
// upload. The real endpoint (owner-captured live, 2026-09-04) was the missing piece:
//
//   GET /api/inv/{nsn}/inv_summary/rawitems?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
//     → { getInvSummaryInfo: [{full_wrin, long_desc, invty_class, uom_desc, uom_cost, case_qty,
//         begin_inv_qty, purchase_qty, transfer_qty, waste_qty, end_inv_qty, actual_usage}, ...] }
//
// Same host (prod.ebos.qsrsoft.com) and auth ladder as the already-automated FOB/On-Hand pulls, so
// this needed no new auth mechanism — only a new endpoint + mapper (mapInventorySummaryResponse,
// src/engine/eom-parsers.js) + this script.
//
// Window: mirrors the manual upload's own usual scope (period-to-date, not a fixed lookback) —
// defaults to the 1st of the current UTC month through yesterday, capped at 60 days (the QSRSoft
// KB's own stated report limit: "Starting Business Date (up to 60 days)"). `usage_per_day` and
// `days_supply` aren't in the API response (only the raw begin/purchase/end/actual_usage atoms
// are) — derived here, once, in deriveUsageRate() below, from actual_usage over the window length
// and end_inv_qty over that rate. `period` (the qsr_inventory_summary PK's month key) is the
// window's END date's month, so a daily re-pull keeps refreshing THIS month's row per WRIN with
// the latest period-to-date figures, same "current-state snapshot" shape as qsr_onhand/qsr_fob.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Auth — shared eBOS ladder (scripts/lib/ebos-auth.mjs): QSRSOFT_EBOS_TOKEN -> getFreshToken()
//   (SSO exchange) -> QSRSOFT_USERNAME/PASSWORD (Playwright), same as every other eBOS pull.
// Optional:
//   INVSUM_STORES=3708,...   -- subset of NSNs (default: all 27)
//   INVSUM_START_DATE / INVSUM_END_DATE -- override the window (default: month-to-date, yesterday)
//   QSRSOFT_DEBUG=1
//
// Token refresh: v3.myqsrsoft.com -> wherever "Inventory Summary and Usage" lives -> DevTools ->
//   Network -> any prod.ebos.qsrsoft.com/api/inv/ request -> copy X-Auth-Token -> update
//   QSRSOFT_EBOS_TOKEN.

import { createClient } from '@supabase/supabase-js';
import { withRetry } from './_retry.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { EBOS_BASE, resolveEbosToken } from './lib/ebos-auth.mjs';
import { mapInventorySummaryResponse } from '../src/engine/eom-parsers.js';

const DEBUG = process.env.QSRSOFT_DEBUG === '1';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

const STORE_NSNS = (process.env.INVSUM_STORES
  ? process.env.INVSUM_STORES.split(',').map(s => s.trim())
  : [
    3708, 5183, 5985, 6178, 6838, 6972,
    10034, 10422, 10915, 11657, 13113, 18213,
    20475, 24471, 29760, 31357, 32525, 33109,
    33222, 33704, 34222, 35064, 35242, 37566,
    38609, 43380, 43701,
  ]).map(String);

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const pad2 = n => String(n).padStart(2, '0');
const pad7 = n => String(n).padStart(7, '0');
const fmtDate = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const addDay = (d, n) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };
const MAX_WINDOW_DAYS = 60; // QSRSoft KB's own stated cap on this report

function defaultWindow() {
  const end = addDay(new Date(), -1); // yesterday — actual_usage needs the day fully closed out
  const monthStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const earliestAllowed = addDay(end, -(MAX_WINDOW_DAYS - 1));
  const start = monthStart > earliestAllowed ? monthStart : earliestAllowed;
  return { start: fmtDate(start), end: fmtDate(end) };
}
const { start: DEFAULT_START, end: DEFAULT_END } = defaultWindow();
const START_DATE = process.env.INVSUM_START_DATE || DEFAULT_START;
const END_DATE = process.env.INVSUM_END_DATE || DEFAULT_END;
const PERIOD = END_DATE.slice(0, 7); // 'YYYY-MM'

// Inclusive day count between two ISO dates — the window length actual_usage was measured over.
export function inclusiveDaySpan(startDate, endDate) {
  const s = new Date(startDate + 'T00:00:00Z'), e = new Date(endDate + 'T00:00:00Z');
  const days = Math.round((e - s) / 86400000) + 1;
  return days > 0 ? days : 1;
}

// usagePerDay = actualUsage / window length; daysSupply = endInv / usagePerDay (how many more
// days the item on hand right now will last at the measured rate). Guards the div-by-zero case
// (a slow-moving item with zero usage this window still has a real end_inv, just no rate to
// divide by — daysSupply is null there, not Infinity/NaN, matching the manual parser's own
// "0 usage → 0 rate, not a crash" convention).
export function deriveUsageRate(actualUsage, endInv, windowDays) {
  const usagePerDay = windowDays > 0 && actualUsage != null ? actualUsage / windowDays : null;
  const daysSupply = usagePerDay != null && usagePerDay > 0 && endInv != null ? endInv / usagePerDay : null;
  return { usagePerDay, daysSupply };
}

async function getInventorySummary(token, nsn, startDate, endDate) {
  const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
  const url = `${EBOS_BASE}/api/inv/${nsn}/inv_summary/rawitems?${params}`;
  if (DEBUG) console.log('[GET]', url);
  const resp = await fetch(url, {
    headers: { 'X-Auth-Token': token, 'X-Current-Nsn': String(nsn), 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/', 'User-Agent': UA },
  });
  if (resp.status === 401 || resp.status === 403) throw new Error(`AUTH_FAILED:${resp.status}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 160)}`);
  return resp.json();
}

async function upsert(rows) {
  if (!rows.length) return 0;
  const CHUNK = 500; let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await withRetry(
      () => supabase.from('qsr_inventory_summary').upsert(chunk, { onConflict: 'loc,period,wrin' }),
      { label: 'qsr_inventory_summary upsert' },
    );
    if (error) console.warn('[qsr_inventory_summary] upsert error:', error.message);
    else saved += chunk.length;
  }
  return saved;
}

async function main() {
  const token = await resolveEbosToken();
  const windowDays = inclusiveDaySpan(START_DATE, END_DATE);
  console.log(`[inventory-summary] window ${START_DATE}..${END_DATE} (${windowDays}d) · period ${PERIOD} · ${STORE_NSNS.length} stores`);

  let totalSaved = 0, storesOk = 0, authFailed = false;
  const tracker = makeOutcomeTracker('inventory-summary');
  for (const nsn of STORE_NSNS) {
    if (authFailed) break;
    const loc = pad7(nsn);
    try {
      const raw = await getInventorySummary(token, nsn, START_DATE, END_DATE);
      const items = mapInventorySummaryResponse(raw);
      const rows = items.filter(it => it.wrin).map(it => {
        const { usagePerDay, daysSupply } = deriveUsageRate(it.actualUsage, it.endInv, windowDays);
        return {
          loc, period: PERIOD, wrin: it.wrin,
          descr: it.descr, cls: it.cls, uom: it.uom, case_sz: it.caseSz, cost: it.cost,
          start_inv: it.startInv, purchases: it.purchases, end_inv: it.endInv,
          actual_usage: it.actualUsage, usage_per_day: usagePerDay, days_supply: daysSupply,
          rng: `${START_DATE}..${END_DATE}`, updated_at: new Date().toISOString(),
        };
      });
      const saved = await upsert(rows);
      totalSaved += saved;
      storesOk++;
      console.log(`  ${nsn}: ${items.length} items · ${rows.length} rows built · ${saved} saved`);
    } catch (e) {
      if (String(e.message).startsWith('AUTH_FAILED')) { authFailed = true; console.error('[inventory-summary] auth failed — refresh QSRSOFT_EBOS_TOKEN'); break; }
      console.warn(`  ${nsn}: ${e.message}`);
      tracker.fail(nsn, e.message);
    }
  }

  console.log(`[inventory-summary] ✓ ${storesOk}/${STORE_NSNS.length} stores · ${totalSaved} rows saved`);
  if (authFailed) process.exit(1);

  const code = tracker.finalize({
    requestedUnits: STORE_NSNS, totalSaved,
    formatRerun: failedStores => `INVSUM_STORES=${failedStores.join(',')}`,
  });
  if (code) process.exit(code);
}

main().catch(err => { console.error('[inventory-summary] fatal:', err); process.exit(1); });
