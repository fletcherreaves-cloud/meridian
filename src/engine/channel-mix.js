// @ts-nocheck
// ── Channel Mix report (Reports redesign Phase 5, 2026-10-16) ───────────────────────────────
// Sales Ledger's channel-% fields (DT/Delivery-3PO/Mobile-Order-Pickup/Kiosk/Front-Counter, all
// % of sales) have been auto-pulled since the email pipeline shipped, but have only ever been
// readable one metric at a time through the Custom Report Builder / Signal Lab — never a
// dedicated "how is this store's channel mix trending" report. Every period average goes
// through metricValueForRange(), same primitive every other report here uses; the trend split
// is this report's own (first-half-vs-second-half-of-range, in PERCENTAGE POINTS since each
// channel metric is itself already a % of sales — a point delta reads far more plainly than a
// relative-% change of a percentage).
import { metricValueForRange, metricRowsForRange } from './signal-registry.js';
import { STORE_NAMES } from '../constants.js';

export const CHANNEL_MIX_METRICS = [
  { key: 'slDtPct', label: 'Drive-Thru %' },
  { key: 'slDelivPct', label: 'Delivery (3PO) %' },
  { key: 'slMopPct', label: 'Mobile Order Pickup %' },
  { key: 'slKioskPct', label: 'Kiosk %' },
  { key: 'slFcPct', label: 'Front Counter %' },
];

function dayKey(d) {
  if (d == null) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return null;
}
function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }

/** First-half-vs-second-half-of-range mean delta, in percentage POINTS (not a relative %). */
function trendPts(key, ds, loc, range) {
  const rows = metricRowsForRange(key, ds, { loc, start: range.s, end: range.e });
  if (!rows.length) return null;
  const midKey = dayKey(new Date((new Date(range.s).getTime() + new Date(range.e).getTime()) / 2));
  const first = rows.filter(r => dayKey(r.date) <= midKey).map(r => r.value);
  const second = rows.filter(r => dayKey(r.date) > midKey).map(r => r.value);
  const fMean = mean(first), sMean = mean(second);
  return (fMean != null && sMean != null) ? (sMean - fMean) * 100 : null;
}

/** One row per store: period-average % for each channel, plus its percentage-point trend. */
export function buildChannelMixReport(ds, { locs, range } = {}) {
  if (!range?.s || !range?.e) return [];
  const targetLocs = (locs && locs.length) ? locs : (ds?.storeIds || []);
  return targetLocs.map(loc => {
    const row = { loc, name: STORE_NAMES[loc] || loc };
    for (const m of CHANNEL_MIX_METRICS) {
      row[m.key] = metricValueForRange(m.key, ds, { loc, start: range.s, end: range.e });
      row[m.key + 'TrendPts'] = trendPts(m.key, ds, loc, range);
    }
    return row;
  });
}
