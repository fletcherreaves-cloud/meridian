// @ts-nocheck
// ── Smart Targets Model v2 ───────────────────────────────────────────────────
// A realistic, forecasted target for one metric at one store. Pure function —
// unit-tested — so the math is verified independently of the UI.
//
// Method (see memory/vision-and-roadmap.md → Smart Targets Model v2):
//   1. Robust baseline of the store's own history (median + MAD outlier
//      rejection) — a broken day or freak event is set aside, not baked in.
//   2. District peer anchor = best-quartile ACROSS peer stores' robust baselines
//      (peers = same market FL/OK + similar volume, supplied by the caller).
//   3. Target = baseline stepped a realistic fraction toward the peer anchor,
//      capped — but only in the IMPROVING direction. A store already better than
//      its district's best quartile holds its own strong baseline (no regression).
//   4. Confidence from sample size.
import { robustBaseline, bestQuartile, stepToward, median } from '../utils/stats.js';

// series        : number[]  — this store's historical daily values for the metric
// peerBaselines : number[]  — peer stores' robust-baseline values (same mkt+tier)
// opts.lowerBetter : bool
// opts.frac     : gap fraction to close per period (default 0.25 — realistic)
// opts.cap      : optional absolute cap on the step, in metric units
export function computeSmartTarget(series, peerBaselines, opts = {}) {
  const { lowerBetter = false, frac = 0.25, cap = null } = opts;
  const base = robustBaseline(series);
  if (base.value == null) {
    return { smart: null, baseline: null, anchor: null, excluded: 0, n: 0, confidence: 'none' };
  }
  const peers = (peerBaselines || []).filter(x => typeof x === 'number' && !isNaN(x));
  // Need a few peers for a trustworthy quartile; otherwise anchor on own trajectory.
  const anchor = peers.length >= 3 ? bestQuartile(peers, lowerBetter) : null;

  let smart = base.value;
  if (anchor != null) {
    // Only step toward the anchor if it represents an IMPROVEMENT over the
    // baseline. If the store already beats the district best quartile, hold.
    const anchorIsBetter = lowerBetter ? anchor < base.value : anchor > base.value;
    if (anchorIsBetter) smart = stepToward(base.value, anchor, frac, cap);
  }

  const confidence = base.n >= 20 ? 'high' : base.n >= 8 ? 'medium' : 'low';
  return { smart, baseline: base.value, anchor, excluded: base.excluded, n: base.n, confidence };
}

// Build the peer-baseline set for a store: robust baseline of each OTHER store in
// the same market whose volume is within `tol` of this store's volume.
// stores: [{loc, series, volume}]. Returns number[] of peer baselines.
export function peerBaselinesFor(loc, stores, volumeTol = 0.40) {
  const me = stores.find(s => String(s.loc) === String(loc));
  if (!me) return [];
  const out = [];
  for (const s of stores) {
    if (String(s.loc) === String(loc)) continue;
    if (me.volume > 0 && s.volume > 0 && Math.abs(s.volume - me.volume) / me.volume > volumeTol) continue;
    const b = robustBaseline(s.series);
    if (b.value != null) out.push(b.value);
  }
  return out;
}

// District roll-up for a metric done RIGHT: dollar-weighted when $-amount pairs
// are supplied (Σnum/Σden), else the median of per-store baselines (robust, never
// a mean of store means). Returns a single representative value.
export function districtValue(perStoreBaselines, dollarPairs) {
  if (dollarPairs && dollarPairs.length) {
    let n = 0, d = 0;
    for (const p of dollarPairs) { if (p && typeof p.num === 'number' && typeof p.den === 'number') { n += p.num; d += p.den; } }
    if (d > 0) return n / d;
  }
  return median((perStoreBaselines || []).filter(x => typeof x === 'number' && !isNaN(x)));
}
