// @ts-nocheck
// ── Shared statistical + accuracy primitives ─────────────────────────────────
// Pure, unit-tested functions. Use these instead of hand-rolled averages so
// aggregates are correct and identical everywhere. Two golden rules are enforced
// here (see memory/vision-and-roadmap.md → Accuracy & Integrity System):
//   1. Robust to anomalies — median / MAD, not a plain mean a bad day can swing.
//   2. NEVER average ratios across units/stores — weight by the base
//      (dollarWeightedRatio). Averaging store %s is the classic wrong answer.

export function mean(xs) {
  const v = (xs || []).filter(x => typeof x === 'number' && !isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function median(xs) {
  const v = (xs || []).filter(x => typeof x === 'number' && !isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Median absolute deviation (raw — not σ-scaled).
export function mad(xs) {
  const med = median(xs);
  if (med == null) return null;
  return median((xs || []).filter(x => typeof x === 'number' && !isNaN(x)).map(x => Math.abs(x - med)));
}

// Robust baseline: median of the points within k scaled-MAD of the median
// (1.4826 scales MAD→σ for a normal dist). Returns {value, n, excluded} so callers
// can SHOW how many anomalies were set aside — that transparency is the point:
// addressable one-offs are handled by store discipline, not baked into the target.
export function robustBaseline(xs, k = 3) {
  const v = (xs || []).filter(x => typeof x === 'number' && !isNaN(x));
  if (!v.length) return { value: null, n: 0, excluded: 0 };
  const med = median(v), rawMad = mad(v);
  if (rawMad == null || rawMad === 0) return { value: med, n: v.length, excluded: 0 };
  const scaled = rawMad * 1.4826, lo = med - k * scaled, hi = med + k * scaled;
  const kept = v.filter(x => x >= lo && x <= hi);
  return { value: median(kept), n: kept.length, excluded: v.length - kept.length };
}

// Linear-interpolated percentile. p in [0,100].
export function percentile(xs, p) {
  const v = (xs || []).filter(x => typeof x === 'number' && !isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  if (v.length === 1) return v[0];
  const idx = (p / 100) * (v.length - 1), lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (idx - lo);
}

// Best-quartile anchor: 25th pct when lower-is-better, 75th when higher-is-better.
export function bestQuartile(xs, lowerBetter) {
  return percentile(xs, lowerBetter ? 25 : 75);
}

// Dollar/count-weighted ratio: Σnum / Σden — the ONLY correct way to aggregate a
// ratio (%, avg check, TPPH) across stores or days. pairs = [{num, den}].
// Never mean the per-row ratios.
export function dollarWeightedRatio(pairs) {
  let n = 0, d = 0;
  for (const p of (pairs || [])) {
    if (p && typeof p.num === 'number' && typeof p.den === 'number' && !isNaN(p.num) && !isNaN(p.den)) { n += p.num; d += p.den; }
  }
  return d > 0 ? n / d : null;
}

// Realistic target step: move `from` toward `anchor` by `frac` of the gap, capped
// at `cap` (absolute, metric units) and never overshooting the anchor.
export function stepToward(from, anchor, frac, cap) {
  if (from == null || anchor == null) return from;
  let step = (anchor - from) * frac;
  if (cap != null && Math.abs(step) > cap) step = Math.sign(step) * cap;
  return from + step;
}
