// @ts-nocheck
// ── Smart Targets engine (Workstream B) ──────────────────────────────────────
// A defensible, data-proven target for a metric, per store. Pure and
// dependency-free so the math is unit-testable in isolation
// (src/__tests__/smart-targets.test.js). Method, per store per metric:
//   1. Robust baseline    — median with anomalies (beyond k·MAD) dropped, and a
//                           COUNT of how many days were set aside.
//   2. Own trajectory     — baseline projected by a BOUNDED trend (capped step).
//   3. Peer stretch anchor— the good-direction quartile among LIKE-SIZED district
//                           peers (compare same-volume stores; FL/OK kept separate
//                           by the caller passing only the right peer set).
//   4. Blend              — own trajectory nudged toward the anchor by a bounded
//                           fraction of the gap, capped, never worse than baseline.
//   5. Confidence         — from sample size + variability.
// Direction-aware: 'higher' = more is better (sales); 'lower' = less is better
// (cost, speed, waste).

export const _isNum = x => typeof x === 'number' && !Number.isNaN(x) && Number.isFinite(x);

export function median(xs) {
  const a = (xs || []).filter(_isNum).slice().sort((p, q) => p - q);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// Median absolute deviation — a robust spread measure that ignores outliers.
export function mad(xs, med) {
  const a = (xs || []).filter(_isNum);
  if (!a.length) return null;
  const c = med == null ? median(a) : med;
  return median(a.map(x => Math.abs(x - c)));
}

// Linear-interpolated quantile.
export function quantile(xs, q) {
  const a = (xs || []).filter(_isNum).slice().sort((p, r) => p - r);
  if (!a.length) return null;
  const pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

// Least-squares slope (value units per step) over an ordered series.
export function trendSlope(values) {
  const a = (values || []).map((v, i) => [i, v]).filter(([, v]) => _isNum(v));
  if (a.length < 3) return 0;
  const n = a.length;
  const sx = a.reduce((s, [x]) => s + x, 0), sy = a.reduce((s, [, y]) => s + y, 0);
  const sxx = a.reduce((s, [x]) => s + x * x, 0), sxy = a.reduce((s, [x, y]) => s + x * y, 0);
  const denom = n * sxx - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}

// Robust baseline: median after dropping points beyond k·MAD (scaled 1.4826 to be
// std-equivalent). Reports how many were excluded — operationalizes "handle
// addressable one-offs through discipline, don't bake them into the target."
export function robustBaseline(values, { k = 3 } = {}) {
  const a = (values || []).filter(_isNum);
  if (!a.length) return { baseline: null, n: 0, excluded: 0, kept: [] };
  const med = median(a), md = mad(a, med);
  const thr = md != null && md > 0 ? 1.4826 * md * k : Infinity;
  const kept = a.filter(x => Math.abs(x - med) <= thr);
  return { baseline: kept.length ? median(kept) : med, n: a.length, excluded: a.length - kept.length, kept };
}

// Peers whose volume is within [1/band, band]× this store's volume.
export function likeSizedPeers(peers, myVolume, { band = 2 } = {}) {
  if (!_isNum(myVolume) || myVolume <= 0) return (peers || []).filter(p => _isNum(p.baseline));
  return (peers || []).filter(p => _isNum(p.baseline) && _isNum(p.volume) && p.volume >= myVolume / band && p.volume <= myVolume * band);
}

// Peer stretch anchor = good-direction quartile of like-sized peers' baselines.
export function peerAnchor(peers, myVolume, { direction = 'higher', quantile: qq = 0.75, band = 2 } = {}) {
  const tier = likeSizedPeers(peers, myVolume, { band });
  const vals = tier.map(p => p.baseline).filter(_isNum);
  if (!vals.length) return { anchor: null, tierN: 0 };
  const q = direction === 'lower' ? (1 - qq) : qq;
  return { anchor: quantile(vals, q), tierN: vals.length };
}

// Blend a starting value toward the anchor by closeGapFrac of the gap, cap the
// total move to capFrac of the baseline, and never propose worse-than-baseline.
export function blend(baseline, anchor, { closeGapFrac = 0.5, capFrac = 0.08, direction = 'higher' } = {}) {
  if (!_isNum(baseline)) return null;
  if (!_isNum(anchor)) return baseline;
  let target = baseline + (anchor - baseline) * closeGapFrac;
  const maxMove = Math.abs(baseline) * capFrac;
  if (Math.abs(target - baseline) > maxMove) target = baseline + Math.sign(anchor - baseline) * maxMove;
  if (direction === 'higher' && target < baseline) target = baseline;
  if (direction === 'lower' && target > baseline) target = baseline;
  return target;
}

export function confidence(n, cv) {
  if (!_isNum(n) || n < 8) return 'Low';
  if (cv == null) return n >= 20 ? 'High' : 'Med';
  if (n >= 20 && cv < 0.25) return 'High';
  if (n >= 12 && cv < 0.5) return 'Med';
  return 'Low';
}

// Orchestrator. `series` = this store's per-period metric values (oldest→newest).
// `peers` = [{baseline, volume}] robust baselines for the district peers that
// should be compared (caller filters to the same state so FL/OK stay separate).
export function computeSmartTarget(series, peers, opts = {}) {
  const { direction = 'higher', volume = null, closeGapFrac = 0.5, capFrac = 0.08, band = 2, k = 3 } = opts;
  const rb = robustBaseline(series, { k });
  if (rb.baseline == null) return { smart: null, baseline: null, own: null, anchor: null, tierN: 0, confidence: 'Low', excludedDays: 0, n: 0, cv: null };
  const kept = rb.kept;
  const meanKept = kept.reduce((a, b) => a + b, 0) / kept.length;
  const sd = Math.sqrt(kept.reduce((a, b) => a + (b - meanKept) ** 2, 0) / Math.max(1, kept.length - 1));
  const cv = meanKept !== 0 ? Math.abs(sd / meanKept) : null;
  // Own trajectory: baseline nudged by a bounded fractional trend, one step ahead.
  const projFrac = meanKept !== 0 ? trendSlope(kept) / meanKept : 0;
  const boundedFrac = Math.max(-capFrac, Math.min(capFrac, projFrac));
  const own = rb.baseline * (1 + boundedFrac);
  const { anchor, tierN } = peerAnchor(peers, volume, { direction, band });
  const smart = blend(own, anchor, { closeGapFrac, capFrac, direction });
  return { smart, baseline: rb.baseline, own, anchor, tierN, confidence: confidence(rb.n, cv), excludedDays: rb.excluded, n: rb.n, cv };
}
