// @ts-nocheck
// #242 — pre-emptive guard, no live bug today. Placed ahead of the first real consumer (#211's
// Labor instantiation) rather than after.
//
// #241 measured qsr_labor_summary over July 2026 (31 days, all 27 stores) and found
// salaried_manager_hours and salaried_manager_dollars populate INDEPENDENTLY — either one alone
// is a broken configuration, not a partial signal to average through:
//
//   complete (hours>0 AND dollars>0)   4 stores  — Chipley-St Rd 77, Cottondale, Mossy Head, Freeport
//   partial  (exactly one >0)         12 stores  — 2 dollars-only (DeFuniak Springs, Bonifay) +
//                                                   10 hours-only (Chickasha, Seminole, Purcell,
//                                                   Lindsay, OKC-I240/Sooner, Ardmore-Cooper, Elgin,
//                                                   Tecumseh, Harrah, Ponce de Leon)
//   absent   (neither)                11 stores  — Ardmore-Broadway, Durant, Ada, Atoka, Madill,
//                                                   Duncan, Pauls Valley, Sulphur, Marietta,
//                                                   Holdenville, Tishomingo
//
// Reading total_hours/gross_dollars naively on a partial store produces a NUMBER that is wrong in
// an invisible direction, not a missing one: #241 measured Bonifay's average wage +13.7% high
// (dollars carry salaried cost, hours don't) and Ponce de Leon's hours denominator +6.7% heavy
// (hours carry salaried time, dollars don't). A blank is honest; a wrong number that looks
// plausible is not — which is why `partial` renders "not configured", the same as `absent`, never
// a value.
//
// Do NOT key this on FL/OK. Ponce de Leon is FL and sits in the hours-only (partial) bucket, so a
// market-based rule is already wrong today and would silently rot as configuration changes.
// Coverage is derived from the data every time, per the rows actually passed in.

/**
 * @param {Array<{salaried_manager_hours?: number|string|null, salaried_manager_dollars?: number|string|null}>} rows
 *   qsr_labor_summary-shaped rows (raw snake_case field names, as they arrive via
 *   ds.opsLaborRows / loadOpsLaborSummary's `...r` spread) for one (loc, period) — the caller
 *   decides the grouping; this function only sums whatever it's given.
 * @returns {'complete'|'partial'|'absent'}
 */
export function salariedCoverage(rows) {
  let hours = 0, dollars = 0;
  for (const r of rows || []) {
    hours += Number(r.salaried_manager_hours) || 0;
    dollars += Number(r.salaried_manager_dollars) || 0;
  }
  const hasHours = hours > 0;
  const hasDollars = dollars > 0;
  if (hasHours && hasDollars) return 'complete';
  if (hasHours || hasDollars) return 'partial';
  return 'absent';
}

/**
 * Guard wrapper for any future metric derived from total_hours/gross_dollars (average wage rate,
 * Total Labor %, or any productivity figure using total_hours as a denominator). Returns null —
 * never a computed value — unless coverage is 'complete'. #241's own instruction: partial must
 * read "not configured", never a plausible-but-wrong number.
 *
 * @param {Array} rows
 * @param {(rows: Array) => number|null} computeFn
 * @returns {number|null}
 */
export function deriveIfSalariedComplete(rows, computeFn) {
  return salariedCoverage(rows) === 'complete' ? computeFn(rows) : null;
}
