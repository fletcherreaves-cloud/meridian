// @ts-nocheck
// ── Loss Prevention Summary report (Reports redesign Phase 2 proof-of-concept, 2026-10-15) ────
// First report built on the new ReportShell + report-export.js chrome, and the proof vehicle
// Phase 2 needed. Deliberately reuses exactly the 16 metric-source.js keys Phase 1 just gave a
// real, agreed-upon direction to (discount/promo/cash-over-short/refunds/overrides/T-Reds, $ and
// counts) -- the Controls category's loss-prevention metrics, per CLAUDE.md's own framing of
// them. Every value is resolved through signal-registry.js's metricValueForRange(), the one
// genuinely new primitive Phase 1 added -- not a new resolution path.
import { metricValueForRange } from './signal-registry.js';
import { STORE_NAMES } from '../constants.js';

// {key, label, unit: 'pct'|'$'|'count'} -- unit drives both this report's own display
// formatting and its export headers. Order matches the Controls category's own grouping in
// signal-registry.js (% then its $/count siblings) so the table reads the same way the rest of
// the app already presents these metrics.
export const LOSS_PREVENTION_METRICS = [
  { key: 'discPct', label: 'Discount %', unit: 'pct' },
  { key: 'discAmt', label: 'Discount $', unit: '$' },
  { key: 'discCnt', label: 'Discount (count)', unit: 'count' },
  { key: 'promoPct', label: 'Promo %', unit: 'pct' },
  { key: 'promoAmt', label: 'Promo $', unit: '$' },
  { key: 'promoCnt', label: 'Promo (count)', unit: 'count' },
  { key: 'cashOSPct', label: 'Cash O/S %', unit: 'pct' },
  { key: 'cashOSAmt', label: 'Cash O/S $', unit: '$' },
  { key: 'drawerOpens', label: 'Drawer Opens', unit: 'count' },
  { key: 'posOverCnt', label: 'POS Override (count)', unit: 'count' },
  { key: 'posOverAmt', label: 'POS Override $', unit: '$' },
  { key: 'cashRefCnt', label: 'Cash Refund (count)', unit: 'count' },
  { key: 'cashRefAmt', label: 'Cash Refund $', unit: '$' },
  { key: 'cashlessRefCnt', label: 'Cashless Refund (count)', unit: 'count' },
  { key: 'cashlessRefAmt', label: 'Cashless Refund $', unit: '$' },
  { key: 'tRedBPct', label: 'T-Reds Before %', unit: 'pct' },
  { key: 'tRedBCnt', label: 'T-Reds Before (count)', unit: 'count' },
  { key: 'tRedAPct', label: 'T-Reds After %', unit: 'pct' },
  { key: 'tRedACnt', label: 'T-Reds After (count)', unit: 'count' },
  { key: 'manualRefAmt', label: 'Manual Refund $', unit: '$' },
];

/**
 * One row per store in `locs`, each metric resolved over [range.s, range.e] via
 * metricValueForRange (sum-vs-mean per metric already handled there -- a count/$ metric sums
 * across the range, a %/rate metric means, same rule the rest of the app's rollups use).
 * Returns [] rather than throwing when the range is incomplete -- a report with no criteria
 * run yet has nothing to show, not an error.
 */
export function buildLossPreventionReport(ds, { locs, range } = {}) {
  if (!range?.s || !range?.e) return [];
  const targetLocs = (locs && locs.length) ? locs : (ds?.storeIds || []);
  return targetLocs.map(loc => {
    const row = { loc, name: STORE_NAMES[loc] || loc };
    for (const m of LOSS_PREVENTION_METRICS) {
      row[m.key] = metricValueForRange(m.key, ds, { loc, start: range.s, end: range.e });
    }
    return row;
  });
}
