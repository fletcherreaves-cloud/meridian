// @ts-nocheck
// Correlation Stats — pure statistical primitives shared across every correlation surface.
//
// Extracted from src/engine/signal-registry.js under dispatch #195 (2026-08-28) — see
// memory/dispatch-195.md. Byte-identical math, only relocated: signal-registry.js re-exports
// these same functions so its existing consumers (csat-signals.js, signals.js, tests) see no
// behavior change. The reason to relocate rather than have a panel outside Signals import
// signal-registry.js directly is that signal-registry.js also carries ~900 lines of Signals-
// specific machinery (METRIC_CATEGORIES, extractMetricValues, pmix item indexing, custom-signal
// computation, SEEDED_SIGNALS) that a panel elsewhere in the app has no reason to statically
// pull into its own lazy chunk just to reach four math functions.
//
// This module is just the math: Pearson r, Spearman rho, a p-value for r, and Benjamini-
// Hochberg FDR correction — the exact statistical guardrails the owner named when resolving
// "merge Metric Correlations into Scanner" (memory/decisions-panel-inventory-2026-08-10.md):
// "Signals Scanner has real statistical guardrails... Take Scanner's math, Correlations'
// presentation."
//
// Consumers (2026-08-28): src/engine/signal-registry.js (Scanner's scanAllPairs / custom
// signals, via re-export), src/views/signals.js's merged Correlations tab (dispatch #195,
// imports directly).

// Pearson correlation coefficient over [{x,y}, ...] pairs. Requires n >= 5 (below that a
// correlation coefficient is not a meaningful summary); returns null if either axis has zero
// variance (a constant series correlates with nothing).
export function pearson(pairs) {
  const n = pairs.length;
  if (n < 5) return null;
  const mx = pairs.reduce((s,p)=>s+p.x,0)/n;
  const my = pairs.reduce((s,p)=>s+p.y,0)/n;
  let num=0, dx2=0, dy2=0;
  for (const {x,y} of pairs) { const dx=x-mx,dy=y-my; num+=dx*dy; dx2+=dx*dx; dy2+=dy*dy; }
  if (!dx2||!dy2) return null;
  return Math.max(-1, Math.min(1, num/Math.sqrt(dx2*dy2)));
}

// Ordinary least-squares fit over the same pair shape. Returns { slope, intercept, mx, my } or
// null under n < 5 / zero-variance x.
export function linearRegression(pairs) {
  const n = pairs.length;
  if (n < 5) return null;
  const mx = pairs.reduce((s,p)=>s+p.x,0)/n;
  const my = pairs.reduce((s,p)=>s+p.y,0)/n;
  let num=0, den=0;
  for (const {x,y} of pairs) { const dx=x-mx; num+=dx*(y-my); den+=dx*dx; }
  if (!den) return null;
  const slope = num/den;
  return { slope, intercept: my - slope*mx, mx, my };
}

// Spearman rank correlation = Pearson on the rank-transformed values. Catches monotone-but-
// nonlinear relationships and is robust to outliers; a large gap between Pearson r and this
// value on the same pairs is the "divergent" flag callers surface as a nonlinearity warning.
export function spearman(pairs) {
  const n = pairs.length;
  if (n < 5) return null;
  const rankOf = (getter) => {
    const arr = pairs.map((p, i) => ({ v: getter(p), i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && arr[j + 1].v === arr[i].v) j++;
      const avg = (i + j) / 2 + 1; // 1-based average rank for ties
      for (let k = i; k <= j; k++) ranks[arr[k].i] = avg;
      i = j + 1;
    }
    return ranks;
  };
  const xr = rankOf(p => p.x);
  const yr = rankOf(p => p.y);
  return pearson(xr.map((x, i) => ({ x, y: yr[i] })));
}

// Standard-normal CDF via an Abramowitz-Stegun erf approximation.
function _erf(x) {
  const s = x < 0 ? -1 : 1; const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return s * y;
}
function _normCdf(z) { return 0.5 * (1 + _erf(z / Math.SQRT2)); }

// Two-sided p-value for a Pearson r under H0: rho = 0. t = r*sqrt((n-2)/(1-r^2)); approximated
// by the normal tail (accurate for n >~ 30). Small-sample scans are directional only.
export function pValueFromR(r, n) {
  if (r == null || n == null || n < 4) return null;
  const rr = Math.min(0.999999, Math.max(-0.999999, r));
  const t = rr * Math.sqrt((n - 2) / (1 - rr * rr));
  const p = 2 * (1 - _normCdf(Math.abs(t)));
  return Math.max(0, Math.min(1, p));
}

// Benjamini-Hochberg FDR. Mutates each item: sets .qValue and .fdrSig (survives FDR at
// `alpha`). Denominator = number of tests actually run (all items with a p-value), so the
// correction reflects the true search space, not just what ends up surfaced to the user —
// this is the guardrail that keeps a batch of correlation tests from reading "significant" by
// chance alone just because enough of them were run.
export function benjaminiHochberg(items, alpha = 0.05) {
  const withP = items.filter(it => it.p != null);
  const m = withP.length;
  if (!m) return items;
  const sorted = [...withP].sort((a, b) => a.p - b.p);
  let kMax = 0;
  for (let i = 0; i < m; i++) if (sorted[i].p <= ((i + 1) / m) * alpha) kMax = i + 1;
  const threshP = kMax > 0 ? sorted[kMax - 1].p : -1;
  let minq = 1;
  for (let i = m - 1; i >= 0; i--) {
    const q = Math.min(1, sorted[i].p * m / (i + 1));
    minq = Math.min(minq, q);
    sorted[i].qValue = minq;
  }
  for (const it of withP) it.fdrSig = it.p <= threshP;
  return items;
}

// Scanner's own defaults (src/engine/signal-registry.js's scanAllPairs), reused as-is per
// dispatch #195's "not a methodology change" instruction — not redefined per surface.
export const SCANNER_DEFAULT_MIN_ABS_R = 0.35;
export const SCANNER_DEFAULT_ALPHA = 0.05;
