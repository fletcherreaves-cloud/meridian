// @ts-nocheck
// Pure helpers for the Trend Explorer panel (src/views/trends.js) — metric bucketing across
// daily/weekly/monthly/yearly frequency, a day-of-week diagnostic breakdown, and a thin filter
// over Signals' existing Scanner correlation output. Kept separate from the React component so
// the aggregation math (the part most likely to be wrong) is directly unit-testable.
//
// Deliberately SINGLE-STORE only for v1 (memory/project-trends-panel.md's own open design
// question, settled here): a `metric.aggregate:'sum'` metric could correctly sum across stores,
// but most metrics in signal-registry.js's METRIC_CATEGORIES are rate/percentage values with no
// aggregate flag, and this repo's own standing "never average averages" rule means a
// district-wide rollup for those would need per-metric volume weighting the registry doesn't
// generically expose. Bucketing ONE store's own daily values into a wider period has no such
// problem — there's only one entity, so a plain sum or mean is correct either way. A proper
// multi-store rollup is a real follow-on, not something to fake here.
import { dKey, weekKeyOf } from '../utils/date.js';

function _asDate(d) { return d instanceof Date ? d : new Date(String(d)); }
function _monthKey(d) { const x = _asDate(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); }
function _yearKey(d) { return String(_asDate(d).getFullYear()); }

export const TREND_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

const _KEY_FN = { daily: dKey, weekly: weekKeyOf, monthly: _monthKey, yearly: _yearKey };

// Buckets a raw {loc,date,value}[] series (the shape extractMetricValues() already returns) into
// periods at the given frequency. `aggregate` should be 'sum' for count/dollar metrics
// (signal-registry's own metric.aggregate flag) or anything else for rate/percentage metrics —
// matching extractMetricValues' own sum-vs-mean convention (`meta.aggregate === 'sum' ? b.sum :
// b.sum / b.n`) exactly, so a metric buckets the same way here as it does everywhere else in the
// app.
export function bucketMetricSeries(rawValues, frequency, aggregate = 'avg') {
  const keyFn = _KEY_FN[frequency] || dKey;
  const buckets = new Map();
  for (const r of rawValues || []) {
    if (r == null || r.value == null || isNaN(r.value)) continue;
    const key = keyFn(r.date);
    const b = buckets.get(key) || { period: key, sum: 0, n: 0 };
    b.sum += r.value; b.n += 1;
    buckets.set(key, b);
  }
  return [...buckets.values()]
    .map(b => ({ period: b.period, value: aggregate === 'sum' ? b.sum : b.sum / b.n, n: b.n }))
    .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
}

// Filters a raw {loc,date,value}[] series to a [s,e] ISO date-string range (inclusive), applied
// BEFORE bucketing — so a week/month/year bucket straddling the range boundary only aggregates
// the in-range days, rather than an all-or-nothing bucket-inclusion rule.
export function filterSeriesToRange(rawValues, s, e) {
  if (!s || !e) return rawValues || [];
  return (rawValues || []).filter(r => {
    if (r == null) return false;
    const key = dKey(r.date);
    return key >= s && key <= e;
  });
}

const _DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// The direct answer to "labor is generally controlled on xx days but struggles on xx days" —
// a per-weekday average (or sum, for count/dollar metrics) of the raw daily series, always
// available with no correlation/FDR machinery needed. `dow: 0` = Sunday, matching Date#getDay().
export function dayOfWeekBreakdown(rawValues, aggregate = 'avg') {
  const buckets = new Map();
  for (const r of rawValues || []) {
    if (r == null || r.value == null || isNaN(r.value)) continue;
    const dow = _asDate(r.date).getDay();
    const b = buckets.get(dow) || { dow, sum: 0, n: 0 };
    b.sum += r.value; b.n += 1;
    buckets.set(dow, b);
  }
  return _DOW_LABELS.map((label, dow) => {
    const b = buckets.get(dow);
    return b
      ? { dow, label, value: aggregate === 'sum' ? b.sum : b.sum / b.n, n: b.n }
      : { dow, label, value: null, n: 0 };
  });
}

// Given Signals' own scanAllPairs() results (already computed for a granularity/scope), pulls
// out only the pairs involving the currently-selected metric — reusing Scanner's exact
// correlation math and "move together" framing (never causation) rather than a second
// implementation. This is the "cross-verify the impact" half of the diagnostic bonus: e.g. if
// the selected metric correlates with a Calendar day-of-week flag or another operational metric,
// it surfaces here as Scanner already computed it.
export function correlatedMetricsFor(scanResults, metricKey, limit = 5) {
  return (scanResults || [])
    .filter(row => row && (row.xKey === metricKey || row.yKey === metricKey))
    .map(row => ({
      ...row,
      other: row.xKey === metricKey
        ? { key: row.yKey, label: row.yLabel, category: row.yCat }
        : { key: row.xKey, label: row.xLabel, category: row.xCat },
    }))
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    .slice(0, limit);
}
