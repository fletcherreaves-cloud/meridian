// @ts-nocheck
// ── Price Change Impact report (Reports redesign Phase 5, 2026-10-16) ───────────────────────
// price-events.js's confirmed-step detector (dispatch20, 14/14-flat-window validated against
// real repricing rounds) already feeds the Pricing Engine's live Price Impact SIMULATOR and
// Signal Lab's correlation group — but there has never been a report answering the plain,
// retrospective question: "after we actually raised prices on this date, what happened to
// volume and sales in the following N days." This reuses priceChangeEvents() directly, the
// same confirmed-event list the simulator and Signal Lab already trust — not a second
// detector.
import { priceChangeEvents } from './price-events.js';
import { metricRowsForRange } from './signal-registry.js';
import { STORE_NAMES } from '../constants.js';

export const DEFAULT_WINDOW_DAYS = 14;

function shiftDate(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

function avgOf(rows) {
  const vals = rows.map(r => r.value).filter(v => v != null);
  return { avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, n: vals.length };
}

function pctDelta(after, before) { return (after != null && before != null && before !== 0) ? ((after - before) / Math.abs(before)) * 100 : null; }

/**
 * One row per confirmed repricing event (priceChangeEvents) whose date falls in [range.s,
 * range.e] and whose store is in `locs` (or every store with an event, if `locs` is empty).
 * For each event, compares the `windowDays`-day average sales/GC immediately BEFORE the
 * change (exclusive of the change day) against the `windowDays`-day average immediately AFTER
 * (inclusive of the change day, since the new price applies from that day forward). A window
 * with fewer observed days than requested still averages what IS there — beforeDaysObserved/
 * afterDaysObserved on each row says how many, so a thin window reads as thin, not hidden.
 */
export function buildPriceChangeImpactReport(ds, { locs, range, windowDays = DEFAULT_WINDOW_DAYS } = {}) {
  if (!range?.s || !range?.e) return [];
  const wantLocs = (locs && locs.length) ? new Set(locs.map(String)) : null;
  const events = priceChangeEvents(ds?.pmixRows || []);
  const inRange = events.filter(e => e.date >= range.s && e.date <= range.e && (!wantLocs || wantLocs.has(e.loc)));

  return inRange.map(e => {
    const beforeStart = shiftDate(e.date, -windowDays);
    const beforeEnd = shiftDate(e.date, -1);
    const afterStart = e.date;
    const afterEnd = shiftDate(e.date, windowDays - 1);

    const before = avgOf(metricRowsForRange('sales', ds, { loc: e.loc, start: beforeStart, end: beforeEnd }));
    const after = avgOf(metricRowsForRange('sales', ds, { loc: e.loc, start: afterStart, end: afterEnd }));
    const beforeGC = avgOf(metricRowsForRange('gc', ds, { loc: e.loc, start: beforeStart, end: beforeEnd }));
    const afterGC = avgOf(metricRowsForRange('gc', ds, { loc: e.loc, start: afterStart, end: afterEnd }));

    return {
      loc: e.loc, name: STORE_NAMES[e.loc] || e.loc, date: e.date,
      itemsChanged: e.itemsChanged, meanStepPct: e.meanStepPct,
      beforeSalesAvg: before.avg, afterSalesAvg: after.avg, salesDeltaPct: pctDelta(after.avg, before.avg),
      beforeGCAvg: beforeGC.avg, afterGCAvg: afterGC.avg, gcDeltaPct: pctDelta(afterGC.avg, beforeGC.avg),
      beforeDaysObserved: before.n, afterDaysObserved: after.n,
    };
  }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
