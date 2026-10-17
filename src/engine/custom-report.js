// @ts-nocheck
// ── Custom Report Builder engine (Reports redesign Phase 4, 2026-10-16) ──────────────────────
// Owner's ask, verbatim (memory/project-reports-redesign.md): "select the various metrics we
// have available and where they appropriately line up with one another... side-by-side to be
// able to build a custom report and save it out." This is the compute half: given any set of
// metric keys from the Phase 1 reconciled catalog (signal-registry.js's METRIC_CATEGORIES),
// resolve each one per-store over a date range through the SAME metricValueForRange() primitive
// Loss Prevention Summary (Phase 2's proof report) already uses -- not a second resolution path.
import { metricValueForRange, METRIC_CATEGORIES, findMetric } from './signal-registry.js';
import { STORE_NAMES } from '../constants.js';
import { addD, dKey, weekStartOf } from '../utils/date.js';

/**
 * The metric catalog as the picker should offer it: grouped by category (same shape/order as
 * METRIC_CATEGORIES), restricted to metrics that actually support a date-RANGE report --
 * `granularity` must include 'daily' (metricRowsForRange always resolves at daily granularity
 * under the hood; a monthly-only metric like fobPct has nothing to return through it). `can` is
 * App's perm(key) helper -- filters out any metric that declares a `perm` key the caller lacks.
 * No metric in the catalog sets `perm` today (none needs it), but the field and this filter
 * exist so a future tightly-scoped metric (the owner's own Phase 4 requirement: "must hide
 * payroll.view-gated metrics... from a builder who lacks that permission") is excluded the
 * moment one is added, with zero change needed here.
 */
export function customReportCatalog(can) {
  return METRIC_CATEGORIES.map(cat => ({
    key: cat.key, label: cat.label, color: cat.color,
    metrics: cat.metrics.filter(m =>
      m.granularity?.includes('daily') && (!m.perm || (can && can(m.perm)))),
  })).filter(cat => cat.metrics.length);
}

/**
 * Pure: split [s, e] (ISO date strings) into sub-periods for the "view as" grouping (owner ask,
 * 2026-10-17: "if [I] have 28 day[s] selected, let me ch[oo]se how to view [the] report" --
 * decouple the picked data WINDOW from how it's broken out). 'range' (or anything else
 * unrecognized) is the original, ungrouped behavior -- one period covering the whole window.
 * 'daily' is one period per calendar day. 'weekly'/'monthly' periods are clipped to [s, e] at
 * both ends, so a range that starts or ends mid-week/mid-month doesn't pull in days outside what
 * was actually picked -- each period's own {s,e} is always a subset of the requested range, not
 * the full calendar week/month it falls in. Uses the shared weekStartOf() (utils/date.js) for the
 * org's configured week-start day rather than assuming Sunday/Monday.
 */
export function splitRangeByGranularity(s, e, granularity) {
  if (!s || !e) return [];
  if (granularity !== 'daily' && granularity !== 'weekly' && granularity !== 'monthly') return [{ s, e }];
  const start = new Date(s + 'T00:00:00');
  const end = new Date(e + 'T00:00:00');
  const out = [];
  if (granularity === 'daily') {
    for (let d = start; d <= end; d = addD(d, 1)) out.push({ s: dKey(d), e: dKey(d) });
    return out;
  }
  if (granularity === 'weekly') {
    let periodStart = weekStartOf(start);
    while (periodStart <= end) {
      const periodEnd = addD(periodStart, 6);
      out.push({
        s: dKey(periodStart < start ? start : periodStart),
        e: dKey(periodEnd > end ? end : periodEnd),
      });
      periodStart = addD(periodStart, 7);
    }
    return out;
  }
  // monthly
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    out.push({
      s: dKey(cursor < start ? start : cursor),
      e: dKey(monthEnd > end ? end : monthEnd),
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return out;
}

/**
 * One row per store in `locs` (or one row per store PER PERIOD when `groupBy` is 'daily'/
 * 'weekly'/'monthly' -- see splitRangeByGranularity), each of `metricKeys` resolved via
 * metricValueForRange (sum-vs-mean per metric already handled there, same rollup rule every
 * other report/rollup in the app uses). A metric key with no real findMetric() entry is
 * skipped, not thrown on -- a stale key in an old saved definition (the metric catalog can grow
 * or a key can be renamed) degrades to a missing column, not a broken report.
 *
 * `groupBy` defaults to 'range' -- the original, ungrouped shape (one row per store, no `period*`
 * fields) is unchanged so every existing caller/saved definition behaves exactly as before.
 */
export function buildCustomReportRows(ds, { locs, range, metricKeys, groupBy = 'range' } = {}) {
  if (!range?.s || !range?.e || !metricKeys?.length) return [];
  const targetLocs = (locs && locs.length) ? locs : (ds?.storeIds || []);
  const keys = metricKeys.filter(k => findMetric(k));
  const periods = splitRangeByGranularity(range.s, range.e, groupBy);

  if (periods.length <= 1) {
    return targetLocs.map(loc => {
      const row = { loc, name: STORE_NAMES[loc] || loc };
      for (const key of keys) {
        row[key] = metricValueForRange(key, ds, { loc, start: range.s, end: range.e });
      }
      return row;
    });
  }

  const rows = [];
  for (const loc of targetLocs) {
    for (const p of periods) {
      const row = { loc, name: STORE_NAMES[loc] || loc, periodStart: p.s, periodEnd: p.e };
      for (const key of keys) {
        row[key] = metricValueForRange(key, ds, { loc, start: p.s, end: p.e });
      }
      rows.push(row);
    }
  }
  return rows;
}

/** Display label + unit for a metric key, for a header or a formatted cell -- a thin wrapper
 *  over findMetric() so callers don't need to import signal-registry.js's own flat index too. */
export function customReportMetricMeta(key) {
  const m = findMetric(key);
  return m ? { label: m.label, unit: m.unit } : { label: key, unit: null };
}
