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

// ── Owner's weighted-recency projector (T3M / T6W / T3W) ─────────────────────
// The owner's proven method: project a period total from a daily RATE that blends
// three trailing windows — trailing 3 months, 6 weeks, 3 weeks — with the most
// weight on the most recent window. Anomalies are excluded from each window's
// rate (robust mean of the k·MAD-kept set), and known events adjust the result
// (+/- dollars, or a set of dates to drop from history as one-offs).
//
//   dailySeries : [{date: Date|string, value: number}]  (any order)
//   asOf        : Date|string — project as if standing here (exclusive upper bound)
//   targetDays  : # of days in the period you're projecting (e.g. days in August)
//   weights     : {m3:.., w6:.., w3:..} recency weights (default favor recent)
//   excludeDates: Set/array of ISO 'YYYY-MM-DD' one-off days to drop from history
//   eventDelta  : signed dollars (or metric units) to add to the projection
export function toISODate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(+dt)) return null;
  return dt.toISOString().slice(0, 10);
}

// Robust (anomaly-excluded) mean daily rate over the days in [asOf-days, asOf).
export function windowRate(dailySeries, asOf, days, { k = 3, excludeDates } = {}) {
  const end = asOf instanceof Date ? new Date(asOf) : new Date(asOf);
  if (Number.isNaN(+end)) return { rate: null, n: 0, excluded: 0 };
  const start = new Date(end); start.setDate(start.getDate() - days);
  const excl = excludeDates instanceof Set ? excludeDates : new Set(excludeDates || []);
  const vals = [];
  for (const r of dailySeries || []) {
    const iso = toISODate(r.date); if (!iso) continue;
    const dt = new Date(iso + 'T00:00:00');
    if (dt >= start && dt < end && !excl.has(iso) && _isNum(r.value)) vals.push(r.value);
  }
  if (!vals.length) return { rate: null, n: 0, excluded: 0 };
  const rb = robustBaseline(vals, { k });               // drop anomalous days
  const kept = rb.kept.length ? rb.kept : vals;
  const rate = kept.reduce((a, b) => a + b, 0) / kept.length; // mean daily rate
  return { rate, n: vals.length, excluded: rb.excluded };
}

export function weightedRecencyProjection(dailySeries, opts = {}) {
  const {
    asOf = new Date(), targetDays = 30, k = 3,
    weights = { m3: 0.2, w6: 0.3, w3: 0.5 }, // recency-weighted: 3-week heaviest
    excludeDates = null, eventDelta = 0,
  } = opts;
  const t3m = windowRate(dailySeries, asOf, 90, { k, excludeDates });
  const t6w = windowRate(dailySeries, asOf, 42, { k, excludeDates });
  const t3w = windowRate(dailySeries, asOf, 21, { k, excludeDates });
  const parts = [
    { r: t3m.rate, w: weights.m3 },
    { r: t6w.rate, w: weights.w6 },
    { r: t3w.rate, w: weights.w3 },
  ].filter(p => _isNum(p.r) && p.w > 0);
  if (!parts.length) return { projection: null, dailyRate: null, windows: { t3m, t6w, t3w }, wSum: 0 };
  const wSum = parts.reduce((a, p) => a + p.w, 0);
  const dailyRate = parts.reduce((a, p) => a + p.r * p.w, 0) / wSum; // normalized blend
  const projection = dailyRate * targetDays + (_isNum(eventDelta) ? eventDelta : 0);
  return { projection, dailyRate, windows: { t3m, t6w, t3w }, wSum };
}

// ── Ratio-metric target (labor %, speed, …) — WEIGHTED, never averaged ────────
// A ratio target must be dollar/volume-weighted: Σ(value·weight)/Σweight, NOT the
// mean of daily ratios (that would average averages). Each point is
// {value, weight} — e.g. {value: dayLaborPct, weight: daySales}. Anomalous DAYS
// (whose ratio is beyond k·MAD of the ratio distribution) are dropped first, then
// the kept days are weight-aggregated.
export function weightedLevel(points, { k = 3 } = {}) {
  const pts = (points || []).filter(p => p && _isNum(p.value) && _isNum(p.weight) && p.weight > 0);
  if (!pts.length) return { level: null, n: 0, excluded: 0 };
  const ratios = pts.map(p => p.value);
  const med = median(ratios), md = mad(ratios, med);
  const thr = md != null && md > 0 ? 1.4826 * md * k : Infinity;
  const kept = pts.filter(p => Math.abs(p.value - med) <= thr);
  const use = kept.length ? kept : pts;
  const sw = use.reduce((a, p) => a + p.weight, 0);
  const level = sw > 0 ? use.reduce((a, p) => a + p.value * p.weight, 0) / sw : null;
  return { level, n: pts.length, excluded: pts.length - kept.length };
}

// Recency-weighted weighted-level across trailing windows — the ratio analog of
// weightedRecencyProjection, and the primary "simple" ratio target. Blends the
// weighted levels of the trailing 3-month / 6-week / 3-week windows with the most
// weight on the most recent. dailyWeighted = [{date, value, weight}] (any order).
export function weightedRecencyLevel(dailyWeighted, opts = {}) {
  const { asOf = new Date(), k = 3, weights = { m3: 0.2, w6: 0.3, w3: 0.5 }, excludeDates = null } = opts;
  const excl = excludeDates instanceof Set ? excludeDates : new Set(excludeDates || []);
  const end = asOf instanceof Date ? new Date(asOf) : new Date(asOf);
  const win = (days) => {
    if (Number.isNaN(+end)) return { level: null, n: 0, excluded: 0 };
    const start = new Date(end); start.setDate(start.getDate() - days);
    const pts = [];
    for (const r of dailyWeighted || []) {
      const iso = toISODate(r.date); if (!iso) continue;
      const dt = new Date(iso + 'T00:00:00');
      if (dt >= start && dt < end && !excl.has(iso)) pts.push({ value: r.value, weight: r.weight });
    }
    return weightedLevel(pts, { k });
  };
  const L90 = win(90), L42 = win(42), L21 = win(21);
  const parts = [
    { l: L90.level, w: weights.m3 },
    { l: L42.level, w: weights.w6 },
    { l: L21.level, w: weights.w3 },
  ].filter(p => _isNum(p.l) && p.w > 0);
  if (!parts.length) return { level: null, windows: { L90, L42, L21 }, wSum: 0 };
  const wSum = parts.reduce((a, p) => a + p.w, 0);
  const level = parts.reduce((a, p) => a + p.l * p.w, 0) / wSum;
  return { level, windows: { L90, L42, L21 }, wSum };
}

// ── Generic projector scoreboard (which method wins per store) ────────────────
// Walk back over the most recent completed periods, project each with every
// supplied projector, compare to the actual period total, and grade. A projector
// is { key, name, project(dailySeries, {asOf, targetDays}) -> number|{projection} }.
// Returns per-method MAPE + the winning key, so the owner's method and the
// forecast-engine models compete on the same held-out actuals.
function _proj(val) { return _isNum(val) ? val : (val && _isNum(val.projection) ? val.projection : null); }

export function periodTotal(dailySeries, start, end) {
  const s = new Date(toISODate(start) + 'T00:00:00'), e = new Date(toISODate(end) + 'T00:00:00');
  let sum = 0, n = 0;
  for (const r of dailySeries || []) {
    const iso = toISODate(r.date); if (!iso) continue;
    const dt = new Date(iso + 'T00:00:00');
    if (dt >= s && dt < e && _isNum(r.value)) { sum += r.value; n++; }
  }
  return { total: sum, n };
}

export function backtestProjectors(dailySeries, projectors, opts = {}) {
  const { periodDays = 28, folds = 3, minCoverageFrac = 0.6 } = opts;
  const series = (dailySeries || []).filter(r => toISODate(r.date) && _isNum(r.value));
  if (!series.length || !(projectors || []).length) return { perMethod: {}, winner: null, folds: 0 };
  const maxIso = series.map(r => toISODate(r.date)).sort().slice(-1)[0];
  const anchor = new Date(maxIso + 'T00:00:00'); anchor.setDate(anchor.getDate() + 1); // exclusive end
  const scores = {}; projectors.forEach(p => { scores[p.key] = []; });
  let usedFolds = 0;
  for (let f = 0; f < folds; f++) {
    const end = new Date(anchor); end.setDate(end.getDate() - f * periodDays);
    const start = new Date(end); start.setDate(start.getDate() - periodDays);
    const act = periodTotal(series, start, end);
    if (!(act.total > 0) || act.n < periodDays * minCoverageFrac) continue; // skip sparse periods
    usedFolds++;
    for (const p of projectors) {
      let val = null;
      try { val = _proj(p.project(series, { asOf: start, targetDays: periodDays })); } catch { val = null; }
      if (_isNum(val) && val > 0) scores[p.key].push(Math.abs(val - act.total) / act.total * 100);
    }
  }
  const perMethod = {};
  for (const [k, errs] of Object.entries(scores)) {
    if (errs.length) perMethod[k] = { mape: +(errs.reduce((a, v) => a + v, 0) / errs.length).toFixed(1), n: errs.length, accuracy: +Math.max(0, 100 - errs.reduce((a, v) => a + v, 0) / errs.length).toFixed(1) };
  }
  const ranked = Object.entries(perMethod).sort((a, b) => a[1].mape - b[1].mape);
  return { perMethod, winner: ranked.length ? ranked[0][0] : null, folds: usedFolds };
}
