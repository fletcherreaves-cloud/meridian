// @ts-nocheck
// Auto-first "3 Peaks" (Breakfast/Lunch/Dinner) daypart metrics, derived from the already-
// auto-pulled HOURLY qsr_daily_activity stream instead of the manual "3 Peaks" Excel upload
// (peaks_rows / ds.peaksSvcRows+ds.peaksSalesRows).
//
// Why this exists (owner report, live, 2026-11-15/16): the 3 Peaks × Labor Gap section on the
// Shift Analysis tab showed TPPH as "—" for every daypart while OEPE/R2P/KVS/Parked/Sales all
// showed real numbers. Measured live against production: the whole section was reading a
// manual upload (`peaks_rows`) that hadn't been refreshed since 2026-06-30 — 4.5 months stale —
// and TPPH specifically had NEVER had a non-zero value in that table, ever (a 2026-11-05 fix
// added the "Trans Per Person Hour" header alias QSRSoft's export actually uses, but nobody had
// re-uploaded a file since, so that fix had never been exercised against a real workbook).
// Per CLAUDE.md's standing rule ("manual sourcing is always temporary... the fix is the auto
// stream that covers it, never a request for another spreadsheet"), the right fix is not asking
// for a fresh upload — it's deriving these same numbers from data already being pulled daily.
//
// qsr_daily_activity is hourly and already carries everything these formulas need
// (actual_punched_hours, transactions, and the same dt_*/fc_*/mfy*_* raw components
// oepeSeconds()/_finalizeQsrAct() already use for the whole-day versions of these metrics) — so
// this reuses those EXACT proven formulas, just summed across a fixed set of hour_slots instead
// of a full day.
import { oepeSeconds } from '../utils/oepe.js';

// hour_slot convention (CLAUDE.md): "HH:00" string = the END of that hour's block (e.g. "08:00"
// = the 7am-8am block). Breakfast 7-9am = the 7-8am + 8-9am blocks; Lunch 11am-2pm = 11-12 + 12-1
// + 1-2pm; Dinner 5-7pm = 5-6 + 6-7pm. Matches the daypart windows already shown on the Shift
// Analysis "3 Peaks" cards (store-analytics.js's SliceCard `info` labels) and the auto-pulled
// qsr_peaks_sales table's own `time_slice` labels (confirmed live: '7am-9am'/'11am-2pm'/'5pm-7pm').
export const DAYPART_HOUR_SLOTS = {
  breakfast: ['08:00', '09:00'],
  lunch: ['12:00', '13:00', '14:00'],
  dinner: ['18:00', '19:00'],
};

export const ALL_DAYPART_HOUR_SLOTS = Object.values(DAYPART_HOUR_SLOTS).flat();

const _SLOT_TO_DAYPART = Object.fromEntries(
  Object.entries(DAYPART_HOUR_SLOTS).flatMap(([dp, slots]) => slots.map(s => [s, dp]))
);

// Sums every raw leg a daypart's metrics are built from, across every matching hourly row for
// this store+date-range, THEN takes one ratio per leg pair — never averaging per-day ratios
// first (CLAUDE.md: "metricSumRatio... sums the raw legs across the range" is the correct shape
// for a rate metric; a mean-of-daily-ratios lets a single low-volume day skew the result).
export function aggregateAutoPeaks(rows, loc, range) {
  const locStr = String(loc || '').trim();
  const s = range?.s ? new Date(range.s) : null;
  const e = range?.e ? new Date(range.e) : null;
  if (e) e.setHours(23, 59, 59, 999);

  const legs = {};
  for (const dp of Object.keys(DAYPART_HOUR_SLOTS)) {
    legs[dp] = {
      dtUntilServe: 0, dtUntilStore: 0, dtHeldTime: 0, dtTransCnt: 0, dtCarsHeld: 0,
      fcServe: 0, fcDrawer: 0, fcCnt: 0,
      mfyServe: 0, mfyCnt: 0,
      productSales: 0, transactions: 0, actualPunchedHours: 0,
      days: new Set(),
    };
  }

  for (const r of rows) {
    if (String(r.loc || '').trim() !== locStr) continue;
    const dp = _SLOT_TO_DAYPART[r.hour_slot];
    if (!dp) continue;
    const dt = r.dt instanceof Date ? r.dt : new Date(String(r.dt) + 'T00:00:00');
    if (s && dt < s) continue;
    if (e && dt > e) continue;
    const L = legs[dp];
    L.dtUntilServe += r.dt_untilserve || 0;
    L.dtUntilStore += r.dt_untilstore || 0;
    L.dtHeldTime += r.dt_heldtime || 0;
    L.dtTransCnt += r.dt_trans_cnt || 0;
    L.dtCarsHeld += r.dt_carsheld || 0;
    L.fcServe += r.fc_untilserve || 0;
    L.fcDrawer += r.fc_untilclosedrawer || 0;
    L.fcCnt += r.fc_trans_cnt || 0;
    L.mfyServe += (r.mfy1_untilserve || 0) + (r.mfy2_untilserve || 0);
    L.mfyCnt += (r.mfy1_trans_cnt || 0) + (r.mfy2_trans_cnt || 0);
    L.productSales += r.product_sales || 0;
    L.transactions += r.transactions || 0;
    L.actualPunchedHours += r.actual_punched_hours || 0;
    L.days.add(String(r.dt));
  }

  const out = {};
  for (const dp of Object.keys(DAYPART_HOUR_SLOTS)) {
    const L = legs[dp];
    const gc = L.transactions;
    const netSales = L.productSales;
    out[dp] = {
      oepe: oepeSeconds({ dt_untilserve: L.dtUntilServe, dt_untilstore: L.dtUntilStore, dt_heldtime: L.dtHeldTime, dt_trans_cnt: L.dtTransCnt }) || 0,
      r2p: L.fcCnt > 0 ? (L.fcServe - L.fcDrawer) / L.fcCnt / 1000 : 0,
      kvst: L.mfyCnt > 0 ? L.mfyServe / L.mfyCnt / 1000 : 0,
      parkPct: L.dtTransCnt > 0 ? L.dtCarsHeld / L.dtTransCnt : 0,
      dtGC: L.dtTransCnt,
      netSales,
      gc,
      avgCheck: gc > 0 ? netSales / gc : 0,
      tpph: L.actualPunchedHours > 0 && gc > 0 ? gc / L.actualPunchedHours : 0,
      count: L.days.size,
    };
  }
  return out;
}
