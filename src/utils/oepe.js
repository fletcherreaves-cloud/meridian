// @ts-nocheck
// OEPE (Order-to-Exit Peak Efficiency), seconds — QSRSoft's headline drive-thru speed metric.
// #183/#185 (2026-08-11): reconciled EXACTLY against a real QSRSoft Service report (27 stores x
// 10 days, r(our gap, QSRSoft gap) = 0.9958) — subtract dt_heldtime (held/parked time), keep
// every car in the denominator (dt_trans_cnt, not dt_trans_cnt minus held cars). The alternative
// (drop held cars from the denominator too) is ruled out.
//
// One shared definition for two callers that used to compute this independently:
// src/views/graded-visits.js (per-hour rows) and src/lib/supabase.js's loadQsrActSummary
// (day-summed pseudo-rows). Both feed rows shaped { dt_untilserve, dt_untilstore, dt_heldtime,
// dt_trans_cnt } — a single hourly row or a summed day — Σµs / Σtrans / 1000 = sec either way,
// so one function serves both without knowing which shape it's fed.
const _secOf = (us, cnt) => cnt > 0 ? Math.round(us / cnt / 1000) : null;

export const oepeSeconds = (x) => (x.dt_untilstore || 0) > 0
  ? _secOf((x.dt_untilserve - x.dt_untilstore) - (x.dt_heldtime || 0), x.dt_trans_cnt)
  : null;

// WITH parked/held time included — the pre-#183 formula. Kept as a named diagnostic only
// (#184 item 3's explicit instruction): never scored, never tOepe's basis.
export const oepeWithParkSeconds = (x) => (x.dt_untilstore || 0) > 0
  ? _secOf(x.dt_untilserve - x.dt_untilstore, x.dt_trans_cnt)
  : null;
