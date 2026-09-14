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
  { key: 'avgCheck', label: 'Avg Check', unit: '$$', agg: 'rate' },
  { key: 'cashOSPct', label: 'Cash O/S %', unit: 'pct', agg: 'rate' },
  { key: 'discPct', label: 'Disc %', unit: 'pct', agg: 'rate' },
].map(m => ({ ...m, direction: metricDirection(m.key) }));

export function findTrendMetric(key) {
  return TREND_REPORT_METRICS.find(m => m.key === key) || null;
}

export function fmtTrendValue(v, unit) {
  if (v == null || isNaN(v)) return '—';
  if (unit === 'pct') return (v * 100).toFixed(2) + '%';
  // '$$' -- a per-transaction dollar figure (Avg Check) where cents matter; '$' -- a period
  // total (Sales), where cents are noise on a number already in the thousands+.
  if (unit === '$$') return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
// Sales/GC are vs-LY comps, computed as two INDEPENDENT calendar-range sums (this period's raw
// total vs. the exact same month/day range one year earlier), never engine/vs-ly.js's
// matchedVsLY. That's a deliberate reversal of the first version of this feature (owner-caught
// bug, 2026-09-14): matchedVsLY sums each DAY against ITS OWN 364-day-back/matched-weekday
// value (qsr_daily_activity_rollup's `ly_product_sales`/`ly_transactions` shadow fields) --
// correct for a week-shaped window, but wrong for a calendar MONTH, because the set of "last
// year" days it lands on is weekday-shifted, not the actual prior-year calendar month. This is
// the EXACT bug class scripts/refresh-projections-workbook.py's own docstring already documents
// and fixes for its own monthly comps ("Monthly comps use genuine calendar-to-calendar sums, not
// the `ly_` shadow fields" -- up to +5.2pp off on a real measured case); this file repeats that
// fix, generalized to any {s,e} range (so a partial-month MTD row compares against the SAME
// partial-month range last year, not a full prior month). Labor/FOB are unchanged -- true period
// Σ÷Σ rates via the same periodValue used above; the owner did not report those as wrong, and
// nothing here suggests their underlying sourcing is.
const _parseISODate = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return { y, m, d }; };

// Exact calendar-year-back date string, no Date-object arithmetic (no DST/timezone risk on a
// pure calendar date) -- Feb 29 shifted onto a non-leap year simply never matches a real row,
// which is the correct "absence is honest" degradation, not a crash or a silently wrong date.
export function shiftYearBack(dateISO) {
  const { y, m, d } = _parseISODate(dateISO);
  return `${y - 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function sumFieldInRange(rows, locs, range, field) {
  const locSet = new Set(locs.map(String));
  let sum = 0, n = 0;
  for (const r of (rows || [])) {
    if (!r || r[field] == null || !locSet.has(String(r.loc)) || !r.date) continue;
    const dISO = r.date instanceof Date ? _iso(r.date) : String(r.date).slice(0, 10);
    if (dISO >= range.s && dISO <= range.e) { sum += r[field]; n++; }
  }
  return { sum, n };
}

// A genuine calendar-year-over-year comparison: `range`'s own total vs. the exact same
// month/day span shifted back one year, both summed independently from real per-day rows
// (never a `ly_*` shadow field). Absence is honest: null when either side has no data at all,
// or the LY side sums to <= 0 (nothing to divide by) -- never a fabricated 0%.
export function periodRealComp(rows, locs, range, field) {
  const lyRange = { s: shiftYearBack(range.s), e: shiftYearBack(range.e) };
  const cur = sumFieldInRange(rows, locs, range, field);
  const ly = sumFieldInRange(rows, locs, lyRange, field);
  if (!cur.n || !ly.n || ly.sum <= 0) return null;
  return { cur: cur.sum, ly: ly.sum, pct: (cur.sum - ly.sum) / ly.sum };
}

// How many days of qsr_daily_activity_rollup history (via loadQsrActSummary(daysBack)) the
// Email Summary view needs fetched to cover every period's LY leg, not just whatever the app's
// already-loaded `ds` happens to hold -- the app's default load window is 60 days (App.js's
// `_stQsrsoftActSummary`), nowhere near enough to reach a full calendar year back from the
// OLDEST of the 3 trailing months. +7 buffers month-length/leap-day edges.
export function scopeSummaryFetchDaysBack(asOf = lastClosedBusinessDay()) {
  const oldestStart = trailingCompleteMonths(3, asOf)[0].s;
  const lyStart = shiftYearBack(oldestStart);
  const days = Math.ceil((new Date(asOf) - new Date(lyStart + 'T00:00:00')) / 86400000);
  return days + 7;
}

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

// `actRows`: real per-day {loc, date, sales, gc} rows -- deliberately NOT read from `ds`, which
// (per App.js's own default load) only carries a 60-day trailing window, nowhere near the ~1
// year of history a real calendar-YoY comp needs for the OLDEST of the 3 trailing months. The
// view fetches its own broader window (scopeSummaryFetchDaysBack) once, on entering this mode,
// and passes the result in here.
export function computeScopeSummary(ds, actRows, locs, periods) {
  const laborMetric = findTrendMetric('laborPct');
  const fobMetric = findTrendMetric('fobPct');
  return periods.map(period => {
    const range = { s: period.s, e: period.e };
    const salesComp = periodRealComp(actRows, locs, range, 'sales');
    const gcComp = periodRealComp(actRows, locs, range, 'gc');
    return {
      ...period,
      salesPct: salesComp ? salesComp.pct : null,
      gcPct: gcComp ? gcComp.pct : null,
      laborPct: periodValue(ds, locs, range, laborMetric),
      fobPct: periodValue(ds, locs, range, fobMetric),
    };
  });
}
