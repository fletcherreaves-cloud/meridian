// @ts-nocheck
// db/index.js's idbDateKey/coverageFromLoadedRows had zero test coverage despite being live and
// already exported -- App.js imports and calls both (idbPutRows uses idbDateKey internally;
// coverageFromLoadedRows is called directly at App.js:1112 and :2873 to compute per-stream
// row-count/date-range coverage from in-memory loaded data). db.test.js already covers this
// module's idbPutRows/idbGetAllRows/idbGetMeta/idbSetMeta/idbClearAll but never these two.
import { describe, it, expect } from 'vitest';
import { idbDateKey, coverageFromLoadedRows } from '../db/index.js';

describe('idbDateKey', () => {
  it('returns the null-safe placeholder for a falsy input', () => {
    expect(idbDateKey(null)).toBe('0000-00-00');
    expect(idbDateKey(undefined)).toBe('0000-00-00');
    expect(idbDateKey('')).toBe('0000-00-00');
  });

  it('formats a Date instance as YYYY-MM-DD via ISO slice', () => {
    const d = new Date('2026-06-15T12:00:00.000Z');
    expect(idbDateKey(d)).toBe('2026-06-15');
  });

  it('slices a string input to its first 10 characters without re-parsing', () => {
    expect(idbDateKey('2026-06-15T00:00:00.000Z')).toBe('2026-06-15');
    expect(idbDateKey('2026-06-15')).toBe('2026-06-15');
  });
});

describe('coverageFromLoadedRows', () => {
  it('returns {count:0} for an empty/missing row array, per stream', () => {
    const cov = coverageFromLoadedRows([], null, undefined, [], [], [], [], []);
    expect(cov.laborRows).toEqual({ count: 0 });
    expect(cov.opsRows).toEqual({ count: 0 });
  });

  it('computes count and the min/max date range from Date-object rows', () => {
    const labor = [
      { date: new Date(2026, 5, 10) },
      { date: new Date(2026, 5, 1) },
      { date: new Date(2026, 5, 20) },
    ];
    const cov = coverageFromLoadedRows(labor, [], [], [], [], [], [], []);
    expect(cov.laborRows).toEqual({ count: 3, from: '2026-06-01', to: '2026-06-20' });
  });

  it('prefers a row\'s own _d field over re-deriving from .date when both are present', () => {
    const ops = [{ _d: '2099-01-01', date: new Date(2026, 5, 1) }];
    const cov = coverageFromLoadedRows([], ops, [], [], [], [], [], []);
    expect(cov.opsRows).toEqual({ count: 1, from: '2099-01-01', to: '2099-01-01' });
  });

  it('accepts string dates and filters out rows with an invalid/missing date from the range calc', () => {
    const ctrl = [{ date: '2026-06-05' }, { date: null }, { date: 'not-a-date' }];
    const cov = coverageFromLoadedRows([], [], ctrl, [], [], [], [], []);
    expect(cov.ctrlRows.count).toBe(3); // count includes all rows
    expect(cov.ctrlRows.from).toBe('2026-06-05'); // only the one valid date sorts in
    expect(cov.ctrlRows.to).toBe('2026-06-05');
  });

  it('always reports pmixRows as {count:0} -- not sourced from any of the passed-in arrays', () => {
    const cov = coverageFromLoadedRows([{ date: new Date() }], [], [], [], [], [], [], []);
    expect(cov.pmixRows).toEqual({ count: 0 });
  });
});
