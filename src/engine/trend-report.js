// @ts-nocheck
// Performance Trends report (owner request, 2026-09-14): "Current MTD / Last complete month /
// Two months back" side by side, one table for All locations combined plus OK/FL breakouts,
// sortable by Top 25%/Top 50%/Bottom 50%/Bottom 25%, reusable for Labor %, FOB % and every other
// primary metric -- not a one-off build per metric.
//
// Deliberately a THIN registry over engine/metric-source.js's own METRIC_SOURCES (direction,
// auto-first sourcing) rather than a fourth parallel metric registry -- see
// memory/dispatch-trend-report-2026-09-14.md for why (this repo already has metric-source.js,
// signal-registry.js's METRIC_FLAT, and smart-targets.js's METRICS; the "measure it" standing
// rule against introducing yet another one applies here). metricRate/metricSeries are the same
// primitives Trend Explorer, Signals and the At-A-Glance tiles already read for these fields.
import { metricRate, metricSeries, metricDirection } from './metric-source.js';
import { matchedVsLY } from './vs-ly.js';
import { lastClosedBusinessDay } from '../utils/date.js';

const _iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

function monthRange(y, m) {
  const s = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const e = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { s, e };
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthLabel(y, m) { return `${MONTH_NAMES[m - 1]} ${y}`; }

// Primary-metrics registry: label/unit/fmt for display, `agg` says how to roll many stores (or
// many days) into one number -- 'sum' for a real volume total (sales, guest count), 'rate' for
// everything metricRate already knows how to Sum/Sum (falling back to a mean-of-daily only when
// no ratio legs resolve -- see metric-source.js's own ROLLUP CAVEAT). Every key here already
// exists in METRIC_SOURCES with a real `direction`, so "higher/lower is better" is never
// re-decided here.
export const TREND_REPORT_METRICS = [
  { key: 'sales', label: 'Sales', unit: '$', agg: 'sum' },
  { key: 'gc', label: 'Guest Count', unit: '#', agg: 'sum' },
  { key: 'laborPct', label: 'Labor %', unit: 'pct', agg: 'rate' },
  { key: 'fobPct', label: 'FOB %', unit: 'pct', agg: 'rate' },
  { key: 'tpph', label: 'TPPH', unit: 'num', agg: 'rate' },
  { key: 'oepe', label: 'OEPE', unit: 'sec', agg: 'rate' },
  { key: 'r2p', label: 'R2P', unit: 'sec', agg: 'rate' },
  { key: 'avgCheck', label: 'Avg Check', unit: '$', agg: 'rate' },
  { key: 'cashOSPct', label: 'Cash O/S %', unit: 'pct', agg: 'rate' },
  { key: 'discPct', label: 'Disc %', unit: 'pct', agg: 'rate' },
].map(m => ({ ...m, direction: metricDirection(m.key) }));

export function findTrendMetric(key) {
  return TREND_REPORT_METRICS.find(m => m.key === key) || null;
}

export function fmtTrendValue(v, unit) {
  if (v == null || isNaN(v)) return '—';
  if (unit === 'pct') return (v * 100).toFixed(1) + '%';
  if (unit === '$') return '$' + Math.round(v).toLocaleString();
  if (unit === 'sec') return Math.round(v) + 's';
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

// The three stacked report periods, anchored on `asOf` (defaults to the last CLOSED business
// day -- never a naive "today", which would count a still-filling day as complete). Current MTD
// deliberately ends at asOf, not the calendar month end -- "completed days only" per the owner's
// exact wording.
export function trendReportPeriods(asOf = lastClosedBusinessDay()) {
  const d = new Date(asOf);
  const y = d.getFullYear(), m = d.getMonth() + 1;
  const mtd = { key: 'mtd', label: `Current MTD (thru ${MONTH_NAMES[m - 1]} ${d.getDate()})`, s: `${y}-${String(m).padStart(2, '0')}-01`, e: _iso(d) };
  let ly = y, lm = m - 1; if (lm === 0) { lm = 12; ly -= 1; }
  const lastMonth = { key: 'lastMonth', label: monthLabel(ly, lm), ...monthRange(ly, lm) };
  let l2y = ly, l2m = lm - 1; if (l2m === 0) { l2m = 12; l2y -= 1; }
  const twoBack = { key: 'twoBack', label: monthLabel(l2y, l2m), ...monthRange(l2y, l2m) };
  return [mtd, lastMonth, twoBack];
}

function periodValue(ds, locs, range, metric) {
  const list = Array.isArray(locs) ? locs : [locs];
  if (metric.agg === 'sum') {
    let sum = 0, has = false;
    for (const loc of list) {
      const series = metricSeries(ds, loc, range, metric.key);
      for (const k in series) { if (series[k] != null) { sum += series[k]; has = true; } }
    }
    return has ? sum : null;
  }
  return metricRate(ds, list, range, metric.key);
}

// Best store first (rank 1), worst last. `pct` is a 0-100 percentile where 100 = best --
// used by rankFilterRows below so "top"/"bottom" always means "best"/"worst" regardless of
// whether higher or lower is good for this metric.
function withRanks(rows, direction) {
  const sorted = [...rows].sort((a, b) => (direction === 'lower' ? a.value - b.value : b.value - a.value));
  const n = sorted.length;
  return sorted.map((r, i) => ({ ...r, rank: i + 1, pct: n > 1 ? Math.round((1 - i / (n - 1)) * 100) : 100 }));
}

// mode: 'all' | 'top25' | 'top50' | 'bottom50' | 'bottom25' -- "any other option" the owner
// asked for: bottom cuts, for finding who needs the most help, are the natural mirror of a
// top cut and cost nothing extra to add.
export const RANK_MODES = [
  { id: 'all', label: 'All Locations' },
  { id: 'top25', label: 'Top 25%' },
  { id: 'top50', label: 'Top 50%' },
  { id: 'bottom50', label: 'Bottom 50%' },
  { id: 'bottom25', label: 'Bottom 25%' },
];

export function rankFilterRows(rankedRows, mode) {
  if (mode === 'top25') return rankedRows.filter(r => r.pct >= 75);
  if (mode === 'top50') return rankedRows.filter(r => r.pct >= 50);
  if (mode === 'bottom50') return rankedRows.filter(r => r.pct <= 50);
  if (mode === 'bottom25') return rankedRows.filter(r => r.pct <= 25);
  return rankedRows;
}

// For each period: {..period, combined: value|null, rows: [{loc, value, rank, pct}], n}.
// `locs` never fabricates a row for a store with no data that period -- absence is honest,
// matching the standing rule the Smart Targets backtest already established.
export function computeTrendReport(ds, metric, locs, periods) {
  return periods.map(period => {
    const range = { s: period.s, e: period.e };
    const combined = periodValue(ds, locs, range, metric);
    const raw = locs
      .map(loc => ({ loc, value: periodValue(ds, [loc], range, metric) }))
      .filter(r => r.value != null);
    const rows = metric.direction ? withRanks(raw, metric.direction) : raw.map((r, i) => ({ ...r, rank: i + 1, pct: null }));
    return { ...period, combined, rows, n: rows.length };
  });
}

// ── Scope Summary -- the owner's own email table (2026-09-14: "for the first project, I also
// send this out in the same email") ────────────────────────────────────────────────────────
// A compact Month x [Sales/GC/Labor/FOB] scorecard, one per scope (Combined/OK/FL), covering the
// last 3 COMPLETE calendar months plus current MTD -- a different period shape than the
// per-metric drill-down above (which follows the original "MTD/last month/two-back" 3-section
// spec), because it reproduces the owner's actual reference table exactly rather than reusing
// the drill-down's periods for convenience.
//
// Sales/GC are vs-LY comps, NOT raw totals -- computed via engine/vs-ly.js's matchedVsLY (the
// standing shared auto-first + matched-day helper CLAUDE.md's "source data through the shared
// helpers" rule requires), never a hand-rolled comp calc. Labor/FOB are true period Σ÷Σ rates via
// the same periodValue used above.
export function trailingCompleteMonths(n, asOf = lastClosedBusinessDay()) {
  const d = new Date(asOf);
  const y = d.getFullYear(), m = d.getMonth() + 1;
  const out = [];
  for (let i = n; i >= 1; i--) {
    let my = y, mm = m - i;
    while (mm <= 0) { mm += 12; my -= 1; }
    out.push({ key: `m-${my}-${String(mm).padStart(2, '0')}`, label: monthLabel(my, mm), ...monthRange(my, mm) });
  }
  return out;
}

export function currentMtdPeriod(asOf = lastClosedBusinessDay()) {
  const d = new Date(asOf);
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  return {
    key: 'mtd', label: `${MONTH_NAMES[m - 1]} (MTD - ${day} Day${day === 1 ? '' : 's'})`,
    s: `${y}-${String(m).padStart(2, '0')}-01`, e: _iso(d),
  };
}

// Default period set for the scope summary: 3 trailing complete months, then current MTD --
// matching the owner's reference table's row order exactly (oldest first, MTD last).
export function scopeSummaryPeriods(asOf = lastClosedBusinessDay()) {
  return [...trailingCompleteMonths(3, asOf), currentMtdPeriod(asOf)];
}

export function computeScopeSummary(ds, locs, periods) {
  const laborMetric = findTrendMetric('laborPct');
  const fobMetric = findTrendMetric('fobPct');
  return periods.map(period => {
    const range = { s: period.s, e: period.e };
    const salesComp = matchedVsLY(ds, locs, range, 'sales');
    const gcComp = matchedVsLY(ds, locs, range, 'gc');
    return {
      ...period,
      salesPct: salesComp.pct,
      gcPct: gcComp.pct,
      laborPct: periodValue(ds, locs, range, laborMetric),
      fobPct: periodValue(ds, locs, range, fobMetric),
    };
  });
}
