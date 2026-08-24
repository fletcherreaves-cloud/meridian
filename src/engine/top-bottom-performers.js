// @ts-nocheck
// ── Top/Bottom Performers (dispatch #77 Step 3) ────────────────────────────────
// Only buildable once direction is a single, explicit field (Step 1/2, see
// engine/metric-source.js's METRIC_SOURCES `direction` + metricDirection/rankableMetricKeys).
// Ranks INDIVIDUAL STORES ONLY, one metric at a time, inside a caller-supplied scope (the
// standing All -> State -> Org/Patch -> Store pill hierarchy, resolved by the caller via
// components/PanelControls.js's locationSelectorLocs before calling in here).
//
// Honesty guards, per memory/dispatch-77.md:
//  - never rank a metric metricDirection() can't resolve -- an unrecognized/undecided key
//    (park, actVsNeed, anything not yet given a direction) returns direction:null, rows:[].
//  - "never average averages / dollar-weight aggregates" is satisfied FOR THE CROSS-STORE
//    DIMENSION ONLY, by construction: no cross-store rollup happens anywhere in this file, so
//    there is no district aggregate to get wrong. Each store is compared against other stores
//    on its own values.
//    ACROSS DAYS (dispatch #77, resolved 2026-08-24): for the 10 of 16 PERFORMER_METRICS that
//    are ratios (tpph, avgCheck, laborPct, cashOSPct, tRedAPct, tRedBPct, discPct, compWaste,
//    rawWaste, statVar), `value` is now the TRUE Σnumerator/Σdenominator period figure
//    (`metricSumRatio`, engine/metric-source.js) whenever every included store's window
//    resolves both legs -- not the mean-of-daily-ratios average-of-averages this panel shipped
//    with. The gap that motivated fixing it was measured independently of this panel: SPPH on
//    store 5985 for 2026-08 was $70.18/hr mean-of-daily vs $67.04/hr Sum/Sum, a 4.5% gap
//    (metric-source.js's ROLLUP CAVEAT comment).
//    ⚠️ It is a WHOLE-RANKING switch, never per-store: if even one included store's window can't
//    resolve both legs (e.g. it has no auto-pulled coverage for the underlying numerator/
//    denominator streams, only a precomputed manual ratio), the ENTIRE ranking falls back to
//    mean-of-daily uniformly, rather than comparing one store's period total against another
//    store's daily average -- mixing bases within one ranking would be WORSE than being
//    uniformly approximate, since the two numbers would no longer even be the same kind of
//    thing. `rollup: 'sum'|'mean'` on the return value says which basis this call actually used.
//    Non-ratio metrics (sales, gc, oepe, kvst, r2p, otHrs) always return rollup:'mean' -- summing
//    a plain count/rate metric's daily values across the window is what a period figure already
//    IS for sales/gc/otHrs, and oepe/kvst/r2p are ratios computed upstream (by the DAR loader,
//    supabase.js) with no numerator/denominator exposed as separate metric-source chains yet --
//    real, larger follow-on work, not part of this dispatch. See memory/dispatch-77.md.
//  - count-completeness: "never rank a store with 3 days of data against one with 90." Thin
//    rows are separated out (`thinRows`), not blended into the ranked list. The floor here is a
//    STRUCTURAL, scope-relative rule (half of the best-covered store's day-count in THIS
//    ranking) -- unlike visit-readiness.js's CHANNEL_YEAR_MIN_N, which is a break measured in a
//    real distribution, there is no equivalent distribution to measure for an arbitrary
//    metric/window/scope combination, so this is documented as a floor, not a finding.
import { metricSeries, metricDirection, rankableMetricKeys, metricSumRatio, rollupCapableMetricKeys } from './metric-source.js';

export const THIN_RELATIVE_FLOOR = 0.5;

// Display metadata for every metric this panel is allowed to offer. Deliberately NOT a new
// direction declaration -- `dir` here is read straight from metricDirection(key), never
// hand-typed, so this file cannot itself become a ninth disagreeing site. Kept to the subset of
// rankableMetricKeys() that are meaningful as a single-store daily-rate leaderboard entry;
// __tests__/top-bottom-performers.test.js pins that this list and rankableMetricKeys() agree in
// both directions (nothing rankable is missing a label, nothing here lacks a real direction).
export const PERFORMER_METRICS = [
  { key: 'sales',     label: 'Sales ($)',        fmt: v => '$' + Math.round(v).toLocaleString() },
  { key: 'gc',         label: 'Guest Count',       fmt: v => Math.round(v).toLocaleString() },
  { key: 'tpph',       label: 'TPPH',              fmt: v => v.toFixed(2) },
  { key: 'avgCheck',   label: 'Avg Check ($)',     fmt: v => '$' + v.toFixed(2) },
  { key: 'oepe',       label: 'OEPE (seconds)',    fmt: v => Math.round(v) + 's' },
  { key: 'kvst',       label: 'KVS Time (seconds)',fmt: v => Math.round(v) + 's' },
  { key: 'r2p',        label: 'R2P (seconds)',     fmt: v => Math.round(v) + 's' },
  { key: 'laborPct',   label: 'Labor %',           fmt: v => (v * 100).toFixed(2) + '%' },
  { key: 'otHrs',      label: 'OT Hours',          fmt: v => v.toFixed(1) },
  { key: 'cashOSPct',  label: 'Cash O/S %',        fmt: v => (v * 100).toFixed(2) + '%' },
  { key: 'tRedAPct',   label: 'T-Red After %',     fmt: v => (v * 100).toFixed(2) + '%' },
  { key: 'tRedBPct',   label: 'T-Red Before %',    fmt: v => (v * 100).toFixed(2) + '%' },
  { key: 'discPct',    label: 'Discount %',        fmt: v => (v * 100).toFixed(2) + '%' },
  { key: 'compWaste',  label: 'Comp Waste %',      fmt: v => (v * 100).toFixed(2) + '%' },
  { key: 'rawWaste',   label: 'Raw Waste %',       fmt: v => (v * 100).toFixed(2) + '%' },
  { key: 'statVar',    label: 'Stat Variance %',   fmt: v => (v * 100).toFixed(2) + '%' },
  // Dispatch #104 -- overall FOB %, the sum of the 6 controllable components (comp/raw/cond/
  // emp/statv/unex) over sales, built on dispatch #102's fixed latest-snapshot qsr_fob
  // aggregation (metric-source.js's fobTotalAmt/fobPct chains), not the ~24x-inflated raw-sum
  // one #102 replaced.
  { key: 'fobPct',     label: 'FOB %',             fmt: v => (v * 100).toFixed(2) + '%' },
];

// Pure ranking. `locs` is the already-scope-resolved store list (caller's job, via
// locationSelectorLocs); `range` is {s,e}. Returns:
//   { direction: 'lower'|'higher'|null, rows: [{loc,n,value,thin}] sorted best-first,
//     thinRows: same shape, unsorted, held out of the ranked competition,
//     rollup: 'sum'|'mean'|null }
// A metric with no resolved direction returns direction:null, rollup:null and empty
// rows/thinRows -- the caller must not fall back to a guessed order.
export function rankPerformers(ds, { metricKey, locs, range }) {
  const direction = metricDirection(metricKey);
  if (!direction) return { direction: null, rows: [], thinRows: [], rollup: null };

  // Mean-of-daily is computed for every metric regardless -- it is both the value basis for
  // non-ratio metrics (sales, gc, otHrs, oepe, kvst, r2p) and the fallback for a ratio metric
  // when the true Sum/Sum can't be computed for every included store (see below).
  const meanRows = (locs || []).map(loc => {
    const series = metricSeries(ds, loc, range, metricKey);
    const vals = Object.values(series).filter(v => v != null);
    const n = vals.length;
    const value = n ? vals.reduce((a, b) => a + b, 0) / n : null;
    return { loc: String(loc), n, value };
  }).filter(r => r.value != null && r.n > 0);

  let all = meanRows, rollup = 'mean';

  if (rollupCapableMetricKeys().includes(metricKey) && meanRows.length) {
    const sumRows = meanRows.map(r => {
      const sum = metricSumRatio(ds, r.loc, range, metricKey);
      return sum ? { loc: r.loc, n: sum.n, value: sum.value } : null;
    });
    // Whole-ranking switch, never per-store -- see the header comment. Only adopt Sum/Sum when
    // it resolved for EVERY store that has any daily coverage at all; otherwise this ranking
    // would compare one store's true period total against another store's daily average, which
    // is a worse error than being uniformly approximate.
    if (sumRows.every(r => r != null)) { all = sumRows; rollup = 'sum'; }
  }

  const maxN = all.reduce((m, r) => Math.max(m, r.n), 0);
  const floor = Math.max(1, maxN * THIN_RELATIVE_FLOOR);

  const rows = [], thinRows = [];
  for (const r of all) {
    if (r.n < floor) thinRows.push({ ...r, thin: true });
    else rows.push({ ...r, thin: false });
  }

  rows.sort((a, b) => direction === 'lower' ? a.value - b.value : b.value - a.value);
  thinRows.sort((a, b) => b.n - a.n);

  return { direction, rows, thinRows, maxN, rollup };
}
