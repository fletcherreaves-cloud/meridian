// @ts-nocheck
// utils/holidays.js's getHolidayAdj() had zero test coverage despite being live -- it's called
// from engine/backtest.js (lines ~537-538, 751-752) and engine/forecast.js (lines ~1688-1689) to
// apply the actual forecast holiday adjustment multiplier. This is real business logic (not a
// pure lookup): full-closure/generic-multiplier branches, plus a same-store same-holiday
// prior-year sales-ratio computation for partial-closure holidays, with a fallback chain.
import { describe, it, expect } from 'vitest';
import { getHolidayAdj, getNthDow } from '../utils/holidays.js';

const LOC = '3708';
const thanksgiving = y => getNthDow(y, 10, 4, 4); // 4th Thursday of November

describe('getHolidayAdj', () => {
  it('returns 1.0 for a non-holiday date', () => {
    expect(getHolidayAdj(new Date(2026, 5, 15, 12), LOC, [])).toBe(1.0);
  });

  it('returns 0.02 for a full-closure holiday (Christmas Day) regardless of loc/laborRows', () => {
    expect(getHolidayAdj(new Date(2026, 11, 25, 12), LOC, [])).toBe(0.02);
  });

  it('returns the generic multiplier for a non-closure holiday by impact tier', () => {
    expect(getHolidayAdj(new Date(2026, 0, 1, 12), null, null)).toBe(0.50);   // New Year Day, major
    expect(getHolidayAdj(new Date(2026, 6, 4, 12), null, null)).toBe(0.80);   // Independence Day, moderate
    expect(getHolidayAdj(new Date(2026, 1, 14, 12), null, null)).toBe(0.95);  // Valentines Day, minor
  });

  it('returns 1.0 for a "qsr-normal" impact holiday (Memorial Day / Labor Day)', () => {
    expect(getHolidayAdj(new Date(2026, 8, 7, 12), null, null)).toBe(1.0); // Labor Day 2026
  });

  it('falls back to the generic multiplier for a partial-closure holiday when loc/laborRows are missing', () => {
    // Thanksgiving is partialClosure + impact 'major' -- with no loc/laborRows the store-history
    // branch is skipped entirely and it falls to the generic {major:0.50} lookup.
    expect(getHolidayAdj(thanksgiving(2026), null, null)).toBe(0.50);
  });

  it('falls back to the generic multiplier for a partial-closure holiday with no matching prior-year data', () => {
    expect(getHolidayAdj(thanksgiving(2026), LOC, [{ loc: LOC, date: new Date(2020, 0, 1), sales: 999 }])).toBe(0.50);
  });

  it('computes the store\'s own prior-year holiday-vs-surrounding-week sales ratio when one prior year matches', () => {
    const priorTg = thanksgiving(2025);
    const rows = [
      { loc: LOC, date: priorTg, sales: 500 }, // reduced early-close Thanksgiving sales
    ];
    // Surrounding non-holiday week (offsets used internally: -7..-3, 3..7 days), all at 1000.
    for (const off of [-7, -6, -5, -4, -3, 3, 4, 5, 6, 7]) {
      rows.push({ loc: LOC, date: new Date(priorTg.getTime() + off * 86400000), sales: 1000 });
    }
    const adj = getHolidayAdj(thanksgiving(2026), LOC, rows);
    expect(adj).toBeCloseTo(0.5, 6); // 500 / avg(1000...1000)
  });

  it('averages the ratio across up to 3 prior years when all three have matching data', () => {
    const rows = [];
    const ratioByYear = { 2025: 0.5, 2024: 0.6, 2023: 0.4 };
    for (const [yr, ratio] of Object.entries(ratioByYear)) {
      const priorTg = thanksgiving(Number(yr));
      const surroundSales = 1000;
      rows.push({ loc: LOC, date: priorTg, sales: ratio * surroundSales });
      for (const off of [-7, -6, -5, -4, -3, 3, 4, 5, 6, 7]) {
        rows.push({ loc: LOC, date: new Date(priorTg.getTime() + off * 86400000), sales: surroundSales });
      }
    }
    const adj = getHolidayAdj(thanksgiving(2026), LOC, rows);
    expect(adj).toBeCloseTo((0.5 + 0.6 + 0.4) / 3, 6);
  });

  it('ignores a matching-date row for a different store (loc-scoped lookup)', () => {
    const priorTg = thanksgiving(2025);
    const rows = [{ loc: 'other-store', date: priorTg, sales: 500 }];
    // No data for LOC at all -> falls through to the generic multiplier.
    expect(getHolidayAdj(thanksgiving(2026), LOC, rows)).toBe(0.50);
  });
});
