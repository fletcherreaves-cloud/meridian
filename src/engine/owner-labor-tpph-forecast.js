// @ts-nocheck
// Owner's Labor % and TPPH forecast model (task #80 Phase 2), ported from the SAME manually-
// maintained monthly projections workbook as owner-sales-forecast.js (task #80 Phase 1, already
// shipped — memory/finding-owner-sales-forecast-model-2026-11-04.md). Phase 1 ported his sales
// model (Level + damped Momentum + shrink-to-fleet); this is the OTHER, simpler model from the
// same workbook: a fixed recency-weighted blend across four trailing windows, no momentum or
// shrinkage step. See that memory file's "2. Labor % and TPPH — a separate, simpler recency-
// weighted blend" section for the reverse-engineered spec this ports verbatim.
//
// Both metrics blend the SAME four windows with the SAME fixed weights (his own named ranges
// `LaborWeights`/`TPPHWeights`): L3M 10% / L6W 20% / LM 30% / MTD 40% — most recent counts most.
// TPPH additionally rounds its final blended value UP to the nearest 0.05 (a deliberate
// conservative bias -- never round a labor-efficiency target down). Like Phase 1's suggestion,
// this is NEVER auto-applied: it's a value the Monthly Targets editor offers as a clickable
// suggestion, filling the normal edit flow exactly like a hand-typed override would.
//
// `laborPct`/`tpph` are both declared `derive: {kind:'ratio'}` metrics in metric-source.js, so
// each window is read via metricSumRatio (Σnumerator/Σdenominator over the window) -- never
// metricAvg's mean-of-daily-ratios, per this repo's own standing rule that a rate metric's
// period figure must sum the real numerator/denominator, not average pre-rolled daily ratios
// (metric-source.js's own "ROLLUP CAVEAT" comment, and the measured SPPH gap that motivated it).
import { metricSumRatio } from './metric-source.js';
import { addD } from '../utils/date.js';

export const LABOR_TPPH_WEIGHTS = Object.freeze({ l3m: 0.10, l6w: 0.20, lm: 0.30, mtd: 0.40 });
export const TPPH_ROUND_STEP = 0.05;
// His Assumptions tab's trend-arrow dials -- 0.1 labor-% point/period (stored as a 0-1 fraction,
// so 0.001) and 0.05 TPPH/period. Display-only: they drive the up/flat/down arrow, never the
// forecast value itself.
export const LABOR_TREND_THRESHOLD = 0.001;
export const TPPH_TREND_THRESHOLD = 0.05;

// Trailing windows, all ending the day BEFORE `asOf` -- deliberately uniform across all four
// (including MTD) so none of them can pull in an in-progress "today," whose zero-filled
// remaining hours would understate the window's own rate (CLAUDE.md's standing "watch for
// incomplete DAR days" trap). L3M/L6W reuse this house's own established day-counts (90/42 days
// ending at `asOf`, exclusive) -- smart-targets.js's `weightedRecencyProjection`/`windowRate`
// already define T3M/T6W this exact way; this is the same convention, not a new one.
export function windowRange(kind, asOf) {
  const yesterday = addD(asOf, -1);
  switch (kind) {
    case 'l3m': return { s: addD(asOf, -90), e: yesterday };
    case 'l6w': return { s: addD(asOf, -42), e: yesterday };
    case 'lm': {
      const firstOfThisMonth = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
      const lastOfPriorMonth = addD(firstOfThisMonth, -1);
      const firstOfPriorMonth = new Date(lastOfPriorMonth.getFullYear(), lastOfPriorMonth.getMonth(), 1);
      return { s: firstOfPriorMonth, e: lastOfPriorMonth };
    }
    case 'mtd': return { s: new Date(asOf.getFullYear(), asOf.getMonth(), 1), e: yesterday };
    default: return null;
  }
}

// Linear-regression slope over the 4 window values in their fixed order [l3m, l6w, lm, mtd],
// mirroring his workbook's own `SLOPE()` call over those same 4 named cells (x = 0..3, not real
// calendar dates -- the windows overlap in time, so there is no non-overlapping time axis to
// regress against; his formula doesn't have one either). Needs at least 2 real points.
function slopeOf(values) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => typeof v === 'number');
  if (pts.length < 2) return null;
  const n = pts.length;
  const sumX = pts.reduce((a, [x]) => a + x, 0);
  const sumY = pts.reduce((a, [, y]) => a + y, 0);
  const sumXY = pts.reduce((a, [x, y]) => a + x * y, 0);
  const sumXX = pts.reduce((a, [x]) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  return (n * sumXY - sumX * sumY) / denom;
}

function trendOf(slope, threshold) {
  if (slope == null) return null;
  if (slope > threshold) return 'up';
  if (slope < -threshold) return 'down';
  return 'flat';
}

// Blends one ratio metric's 4 trailing windows for one store. Weights are RENORMALIZED over
// whichever windows actually resolve real data (a store without 90 days of history yet, e.g.
// newly opened, still gets a real blend from its available windows rather than nulling out
// entirely) -- `null` only when EVERY window comes back empty, never a fabricated number
// standing in for "we don't know yet" (same guard Phase 1's `forecastSales` uses).
function blendedRatio(ds, loc, asOf, key) {
  const windows = {};
  let weightedSum = 0, weightSum = 0;
  for (const kind of ['l3m', 'l6w', 'lm', 'mtd']) {
    const range = windowRange(kind, asOf);
    const r = range && metricSumRatio(ds, loc, range, key);
    windows[kind] = r ? r.value : null;
    if (r) { weightedSum += r.value * LABOR_TPPH_WEIGHTS[kind]; weightSum += LABOR_TPPH_WEIGHTS[kind]; }
  }
  const value = weightSum > 0 ? weightedSum / weightSum : null;
  const slope = slopeOf(['l3m', 'l6w', 'lm', 'mtd'].map(k => windows[k]));
  return { value, windows, slope };
}

// Full per-store Labor %/TPPH forecast for one or more stores, as of `asOf` ("today" -- the
// four windows are always trailing from here, independent of which future month the Monthly
// Targets editor is filling in, exactly like Phase 1's weekly comp series). Returns
// { [loc]: { laborPct: {value, windows, trend}, tpph: {value, rawValue, windows, trend} } }.
// `laborPct.value`/`tpph.value` are null (never fabricated) when a store has no real data in
// ANY of its 4 windows. `tpph.rawValue` is the blend before the CEILING(0.05) rounding; `value`
// is the rounded figure that's actually suggested, matching his workbook's published number.
export function computeLaborTpphForecast(ds, locs, asOf = new Date()) {
  const list = Array.isArray(locs) ? locs : [locs];
  const out = {};
  for (const loc of list) {
    const labor = blendedRatio(ds, loc, asOf, 'laborPct');
    const tpphRaw = blendedRatio(ds, loc, asOf, 'tpph');
    const tpphRounded = tpphRaw.value == null ? null : Math.ceil(tpphRaw.value / TPPH_ROUND_STEP) * TPPH_ROUND_STEP;
    out[loc] = {
      laborPct: { value: labor.value, windows: labor.windows, trend: trendOf(labor.slope, LABOR_TREND_THRESHOLD) },
      tpph: { value: tpphRounded, rawValue: tpphRaw.value, windows: tpphRaw.windows, trend: trendOf(tpphRaw.slope, TPPH_TREND_THRESHOLD) },
    };
  }
  return out;
}
