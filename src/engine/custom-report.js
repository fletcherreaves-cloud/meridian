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
 * One row per store in `locs`, each of `metricKeys` resolved over [range.s, range.e] via
 * metricValueForRange (sum-vs-mean per metric already handled there, same rollup rule every
 * other report/rollup in the app uses). A metric key with no real findMetric() entry is
 * skipped, not thrown on -- a stale key in an old saved definition (the metric catalog can grow
 * or a key can be renamed) degrades to a missing column, not a broken report.
 */
export function buildCustomReportRows(ds, { locs, range, metricKeys } = {}) {
  if (!range?.s || !range?.e || !metricKeys?.length) return [];
  const targetLocs = (locs && locs.length) ? locs : (ds?.storeIds || []);
  const keys = metricKeys.filter(k => findMetric(k));
  return targetLocs.map(loc => {
    const row = { loc, name: STORE_NAMES[loc] || loc };
    for (const key of keys) {
      row[key] = metricValueForRange(key, ds, { loc, start: range.s, end: range.e });
    }
    return row;
  });
}

/** Display label + unit for a metric key, for a header or a formatted cell -- a thin wrapper
 *  over findMetric() so callers don't need to import signal-registry.js's own flat index too. */
export function customReportMetricMeta(key) {
  const m = findMetric(key);
  return m ? { label: m.label, unit: m.unit } : { label: key, unit: null };
}
