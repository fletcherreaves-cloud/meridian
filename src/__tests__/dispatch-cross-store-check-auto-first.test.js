// @vitest-environment happy-dom
// @ts-nocheck
// why.js's crossStoreCheck() used to filter raw ds.laborRows directly (manual-upload-only, no
// auto fallback, unbounded history) to build each peer store's same-DOW baseline -- the same
// signature-2 data-integrity class already fixed in store-analytics.js/signals.js/analytics.js.
// A cloud-only store (qsrActSummaryRows populated, laborRows empty/absent) got NO cross-store
// correlation check at all -- diagnoseMiss's "district-wide event" cause could never fire for
// it. Fixed to route through metric-source.js's metricDaily/metricSeries (auto-first, same
// 'sales' resolver every other panel uses) with a bounded 98-day (~14 same-DOW weeks) lookback
// matching the EWMA DOW forecast model's own established convention, instead of an unbounded
// raw-row scan.
//
// Per "would this verification still pass if reverted?": this fixture carries ONLY
// qsrActSummaryRows -- explicitly no ds.laborRows anywhere -- so under the old code `peers`
// would always be [] (ds.laborRows undefined short-circuits the whole function to null) and
// this test would fail on a revert.
import { describe, it, expect } from 'vitest';
import { crossStoreCheck } from '../engine/why.js';

const d = s => new Date(s + 'T00:00:00');
const addDays = (date, n) => { const c = new Date(date); c.setDate(c.getDate() + n); return c; };

const LOC = '10422';        // the store under investigation -- excluded from its own peer scan
const OTHER_LOC = '03708';  // Ardmore-Broadway, real STORE_NAMES entry
const MISS_DATE = d('2026-09-14');

describe('crossStoreCheck -- auto-first, bounded lookback (cloud-only device, no laborRows)', () => {
  it('finds a same-day anomaly at a peer store from qsrActSummaryRows alone', () => {
    // 6 same-DOW baseline points (missDate minus 7,14,...,42 days), tight cluster ~8000,
    // plus a wildly anomalous actual on missDate itself (15000) -- a clear z-score outlier.
    const baselineDates = [7, 14, 21, 28, 35, 42].map(n => addDays(MISS_DATE, -n));
    const baselineSales = [7900, 8000, 8100, 7950, 8050, 8000];
    const qsrActSummaryRows = [
      ...baselineDates.map((date, i) => ({ loc: OTHER_LOC, date, sales: baselineSales[i] })),
      { loc: OTHER_LOC, date: MISS_DATE, sales: 15000 },
    ];
    const ds = { loaded: true, storeIds: [LOC, OTHER_LOC], qsrActSummaryRows };

    const result = crossStoreCheck(LOC, ds, MISS_DATE, 'under');
    expect(result).not.toBeNull();
    expect(result.total).toBe(1);
    expect(result.sameDir).toHaveLength(1);
    expect(result.sameDir[0].loc).toBe(OTHER_LOC);
    expect(result.sameDir[0].actual).toBe(15000);
    expect(Math.abs(result.sameDir[0].z)).toBeGreaterThanOrEqual(1.5);
  });

  it('a lookback-window date OUTSIDE 98 days is excluded from the peer baseline', () => {
    // 4 in-window peers (exactly at the peers.length<4 threshold, so this also confirms that
    // boundary still qualifies) plus one point 120 days back (outside the 98-day window) with a
    // value that would pull the mean sharply down if it leaked in.
    const inWindowDates = [7, 14, 21, 28].map(n => addDays(MISS_DATE, -n));
    const inWindowSales = [7900, 8000, 8100, 7950];
    const qsrActSummaryRows = [
      { loc: OTHER_LOC, date: addDays(MISS_DATE, -120), sales: 500 }, // outside window, same DOW
      ...inWindowDates.map((date, i) => ({ loc: OTHER_LOC, date, sales: inWindowSales[i] })),
      { loc: OTHER_LOC, date: MISS_DATE, sales: 15000 },
    ];
    const ds = { loaded: true, storeIds: [LOC, OTHER_LOC], qsrActSummaryRows };

    const result = crossStoreCheck(LOC, ds, MISS_DATE, 'under');
    expect(result.sameDir).toHaveLength(1);
    // Mean of just the 4 in-window points (7987.5) -- would be ~6490 if the 120-day-old 500
    // leaked in, a difference too large to attribute to rounding.
    expect(result.sameDir[0].mean).toBe(7988); // Math.round(7987.5)
  });

  it('returns null when ds is not loaded, and never throws on a missing laborRows field', () => {
    expect(crossStoreCheck(LOC, { loaded: false }, MISS_DATE, 'under')).toBeNull();
    expect(crossStoreCheck(LOC, null, MISS_DATE, 'under')).toBeNull();
    // loaded:true with genuinely no data anywhere -- must resolve to an empty-but-valid result,
    // not throw (the old code's `!ds.laborRows` short-circuit is gone; confirm nothing else
    // implicitly depended on that field existing).
    const empty = crossStoreCheck(LOC, { loaded: true, storeIds: [LOC, OTHER_LOC] }, MISS_DATE, 'under');
    expect(empty).toEqual({ all: [], sameDir: [], total: 1 });
  });
});
