// @ts-nocheck
// Weighted rollup primitives — the standing "never average averages, dollar-weight
// aggregates" rule, as reusable functions.
//
// The recurring bug these exist to prevent: a ratio metric (labor %, TPPH, avg check,
// OEPE) is computed per day or per store, and the rollup then takes a plain mean of
// those ratios. That silently gives a $2k Tuesday the same weight as a $12k Saturday.
//
//   a $2,000 day at 30% labor + a $20,000 day at 19% labor
//     mean of percentages ......... 24.5%
//     Σ(labor$) / Σ(sales) ........ 20.0%
//
// Every function here falls back to the plain mean when the weighting basis is missing
// (a forward-looking schedule has percentages but no actual sales yet), because showing
// the unweighted figure beats showing 0 — but never silently prefers it.

const _n = (v) => (Number.isFinite(+v) ? +v : 0);

/** Plain arithmetic mean of the positive values produced by fn. 0 when there are none. */
export function plainMean(rows, fn) {
  const v = (rows || []).map(fn).map(_n).filter((x) => x > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

/**
 * Weighted mean: Σ(value × weight) / Σ(weight).
 *
 * Use when you have the ratio and its denominator — e.g. labor % weighted by sales,
 * since labor$ = laborPct × sales, so this reconstructs Σ(labor$)/Σ(sales) exactly.
 *
 * Falls back to plainMean(rows, valueFn) when no row carries a positive weight.
 */
export function weightedMean(rows, valueFn, weightFn) {
  let num = 0, den = 0;
  for (const r of rows || []) {
    const v = _n(valueFn(r)), w = _n(weightFn(r));
    if (v > 0 && w > 0) { num += v * w; den += w; }
  }
  return den > 0 ? num / den : plainMean(rows, valueFn);
}

/**
 * Ratio of sums: Σ(numerator) / Σ(denominator).
 *
 * Use when both components are on the row — e.g. average check = Σsales / Σguests,
 * TPMH = Σtransactions / Σhours. This is the correct aggregate for any per-unit rate.
 *
 * Falls back to fallbackFn's plain mean (when given) if no row has a positive
 * denominator, else 0.
 */
export function ratioOfSums(rows, numFn, denFn, fallbackFn) {
  let num = 0, den = 0;
  for (const r of rows || []) {
    const a = _n(numFn(r)), b = _n(denFn(r));
    if (a > 0 && b > 0) { num += a; den += b; }
  }
  if (den > 0) return num / den;
  return fallbackFn ? plainMean(rows, fallbackFn) : 0;
}

/**
 * Ratio of sums where the denominator is not stored, but is recoverable from the row's
 * own ratio: denominator = numerator / ratio.
 *
 * Use for rates whose denominator basis is defined by the upstream system rather than
 * by us — LifeLenz's TPMH and TPPH both divide transactions by a specific hours basis.
 * Deriving hours from each row's own ratio reproduces exactly that basis, so the rollup
 * stays consistent with the per-row values displayed beside it. Summing whichever hours
 * column looks right instead can make a total silently disagree with its own rows.
 *
 * Falls back to the plain mean of the ratio when no row has both parts.
 */
export function ratioOfSumsDerived(rows, numFn, ratioFn) {
  let num = 0, den = 0;
  for (const r of rows || []) {
    const a = _n(numFn(r)), ratio = _n(ratioFn(r));
    if (a > 0 && ratio > 0) { num += a; den += a / ratio; }
  }
  return den > 0 ? num / den : plainMean(rows, ratioFn);
}
