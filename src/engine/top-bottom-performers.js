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
//  - "never average averages / dollar-weight aggregates" is satisfied BY CONSTRUCTION, not by
//    a generic weighted-aggregator: this only ever compares one store's own daily values
//    against another store's own daily values. No cross-store rollup happens anywhere in this
//    file, so there is no aggregate to get wrong.
//  - count-completeness: "never rank a store with 3 days of data against one with 90." Thin
//    rows are separated out (`thinRows`), not blended into the ranked list. The floor here is a
//    STRUCTURAL, scope-relative rule (half of the best-covered store's day-count in THIS
//    ranking) -- unlike visit-readiness.js's CHANNEL_YEAR_MIN_N, which is a break measured in a
//    real distribution, there is no equivalent distribution to measure for an arbitrary
//    metric/window/scope combination, so this is documented as a floor, not a finding.
import { metricSeries, metricDirection, rankableMetricKeys } from './metric-source.js';

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
];

// Pure ranking. `locs` is the already-scope-resolved store list (caller's job, via
// locationSelectorLocs); `range` is {s,e}. Returns:
//   { direction: 'lower'|'higher'|null, rows: [{loc,n,value,thin}] sorted best-first,
//     thinRows: same shape, unsorted, held out of the ranked competition }
// A metric with no resolved direction returns direction:null and empty rows/thinRows --
// the caller must not fall back to a guessed order.
export function rankPerformers(ds, { metricKey, locs, range }) {
  const direction = metricDirection(metricKey);
  if (!direction) return { direction: null, rows: [], thinRows: [] };

  const all = (locs || []).map(loc => {
    const series = metricSeries(ds, loc, range, metricKey);
    const vals = Object.values(series).filter(v => v != null);
    const n = vals.length;
    const value = n ? vals.reduce((a, b) => a + b, 0) / n : null;
    return { loc: String(loc), n, value };
  }).filter(r => r.value != null && r.n > 0);

  const maxN = all.reduce((m, r) => Math.max(m, r.n), 0);
  const floor = Math.max(1, maxN * THIN_RELATIVE_FLOOR);

  const rows = [], thinRows = [];
  for (const r of all) {
    if (r.n < floor) thinRows.push({ ...r, thin: true });
    else rows.push({ ...r, thin: false });
  }

  rows.sort((a, b) => direction === 'lower' ? a.value - b.value : b.value - a.value);
  thinRows.sort((a, b) => b.n - a.n);

  return { direction, rows, thinRows, maxN };
}
