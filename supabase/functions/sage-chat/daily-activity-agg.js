// @ts-nocheck
// Shared, Deno/Node-agnostic aggregation logic for SAGE's query_daily_activity tool. Imported
// directly by supabase/functions/sage-chat/index.ts and by its Vitest test in src/__tests__/, so
// the SAME code that runs in production is what the test exercises. Plain JS, no TypeScript, per
// repo convention. Extracted (was inline in index.ts) while adding daypart-filtered OEPE/KVS/R2P
// support, 2026-10-27 -- a complex SAGE question needed hour-of-day slicing that didn't exist.
//
// Bug found and fixed in the same pass: the original inline version keyed its per-store map by
// the RAW row.loc (zero-padded at the DB level, e.g. "0003708") and looked store names up in
// index.ts's STORE_NAMES dict, whose keys are unpadded ("3708") -- the lookup could never match,
// so every query_daily_activity response named every store "Store 00XXXXX" instead of its real
// name. Same bug class, same fix, as lifelenz-labor-agg.js's existing loc normalization.
import { oepeSeconds } from '../../../src/utils/oepe.js';

export function aggregateDailyActivity(rows, storeNames = {}) {
  const byStore = {};
  for (const row of rows) {
    const loc = String(parseInt(row.loc, 10));
    if (!byStore[loc]) {
      byStore[loc] = {
        sales: 0, proj: 0, dtMs: 0, dtTrans: 0, days: new Set(),
        oepeUntilServe: 0, oepeUntilStore: 0, oepeHeld: 0, oepeTrans: 0,
        kvsServe: 0, kvsTrans: 0,
        r2pServe: 0, r2pClose: 0, r2pTrans: 0,
      };
    }
    const s = byStore[loc];
    s.sales += row.product_sales || 0;
    s.proj += row.proj_sales_dollars || 0;
    if ((row.dt_trans_cnt || 0) > 0) {
      s.dtMs += row.dt_untilserve || 0;
      s.dtTrans += row.dt_trans_cnt;
    }
    s.days.add(row.dt);

    // OEPE inputs summed raw; run through the shared oepeSeconds() once per store below, so the
    // formula itself lives in exactly one place (src/utils/oepe.js), never re-derived here.
    if ((row.dt_trans_cnt || 0) > 0 && (row.dt_untilstore || 0) > 0) {
      s.oepeUntilServe += row.dt_untilserve || 0;
      s.oepeUntilStore += row.dt_untilstore || 0;
      s.oepeHeld += row.dt_heldtime || 0;
      s.oepeTrans += row.dt_trans_cnt;
    }
    // KVS -- src/views/graded-visits.js's formula: (mfy1+mfy2 untilserve) / (mfy1+mfy2 trans).
    const kvsTransRow = (row.mfy1_trans_cnt || 0) + (row.mfy2_trans_cnt || 0);
    if (kvsTransRow > 0) {
      s.kvsServe += (row.mfy1_untilserve || 0) + (row.mfy2_untilserve || 0);
      s.kvsTrans += kvsTransRow;
    }
    // R2P -- src/engine/metric-provenance.js's documented formula.
    if ((row.fc_trans_cnt || 0) > 0 && (row.fc_untilclosedrawer || 0) > 0) {
      s.r2pServe += row.fc_untilserve || 0;
      s.r2pClose += row.fc_untilclosedrawer || 0;
      s.r2pTrans += row.fc_trans_cnt;
    }
  }

  return Object.entries(byStore)
    .map(([loc, s]) => ({
      loc,
      name: storeNames[loc] || `Store ${loc}`,
      sales: Math.round(s.sales),
      qsr_proj: Math.round(s.proj),
      vs_proj_pct: s.proj > 0 ? +((s.sales / s.proj - 1) * 100).toFixed(1) : null,
      dt_avg_sec: s.dtTrans > 0 ? Math.round(s.dtMs / s.dtTrans / 1000) : null,
      oepe_avg_sec: oepeSeconds({
        dt_untilserve: s.oepeUntilServe, dt_untilstore: s.oepeUntilStore,
        dt_heldtime: s.oepeHeld, dt_trans_cnt: s.oepeTrans,
      }),
      kvs_avg_sec: s.kvsTrans > 0 ? Math.round(s.kvsServe / s.kvsTrans / 1000) : null,
      r2p_avg_sec: s.r2pTrans > 0 ? Math.round((s.r2pServe - s.r2pClose) / s.r2pTrans / 1000) : null,
      days: s.days.size,
    }))
    .sort((a, b) => b.sales - a.sales);
}

export const DAILY_ACTIVITY_NOTE =
  'sales = product_sales (net sales). dt_avg_sec = seconds per car, raw time-until-served '
  + '(does NOT subtract parked/held time). oepe_avg_sec = true OEPE (Order-to-Exit), the same '
  + 'formula and inputs the in-app panels use (subtracts parked/held time) -- prefer this over '
  + 'dt_avg_sec for any question specifically about drive-thru speed/OEPE. kvs_avg_sec = kitchen '
  + '(Made-for-You) time per guest count. r2p_avg_sec = front-counter Receipt-to-Print time. All '
  + 'three (oepe/kvs/r2p) are null when a store has no qualifying transactions in range -- report '
  + 'that plainly, never as zero. If hour_slot_min/hour_slot_max were passed, every figure above '
  + 'is scoped to ONLY that time-of-day window, not the whole business day -- say so explicitly '
  + 'when reporting a daypart-scoped result, since it will not match a whole-day figure elsewhere '
  + 'in this conversation.';
