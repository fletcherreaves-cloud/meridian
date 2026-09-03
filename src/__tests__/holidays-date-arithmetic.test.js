// @ts-nocheck
// utils/holidays.js's getEaster/getNthDow/getLastDow had zero direct test coverage despite being
// live -- buildHolidays() (feeding HOLIDAY_MAP, used throughout the forecast/backtest engine) and
// engine/retail-events.js's own getNthDow import both depend on these. The only existing test
// touching this area (dispatch-122-events-calendar.test.js) checks that holiday NAMES appear in a
// UI list, never that the computed DATES are correct -- an off-by-one here would silently mis-date
// Easter, Mother's/Father's Day, Memorial/Labor Day, MLK/Presidents Day. Verified against
// well-known real calendar dates, not re-derived from the same formula.
import { describe, it, expect } from 'vitest';
import { getEaster, getNthDow, getLastDow } from '../utils/holidays.js';

describe('getEaster', () => {
  it('computes known real Easter Sundays across several years', () => {
    const cases = [
      [2024, 3, 31],
      [2025, 4, 20],
      [2026, 4, 5],
      [2027, 3, 28],
      [2000, 4, 23],
    ];
    for (const [year, month, day] of cases) {
      const d = getEaster(year);
      expect(d.getFullYear()).toBe(year);
      expect(d.getMonth() + 1).toBe(month);
      expect(d.getDate()).toBe(day);
      expect(d.getDay()).toBe(0); // Easter is always a Sunday
    }
  });
});

describe('getNthDow', () => {
  it('computes Thanksgiving 2026 (4th Thursday of November) correctly', () => {
    const d = getNthDow(2026, 10, 4, 4); // month is 0-indexed (10=Nov), dow 4=Thu
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(10);
    expect(d.getDate()).toBe(26);
    expect(d.getDay()).toBe(4);
  });

  it('computes Labor Day 2026 (1st Monday of September) correctly', () => {
    const d = getNthDow(2026, 8, 1, 1); // 8=Sep, dow 1=Mon
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(7);
  });

  it('computes MLK Day 2026 (3rd Monday of January) correctly', () => {
    const d = getNthDow(2026, 0, 3, 1);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(19);
  });
});

describe('getLastDow', () => {
  it('computes Memorial Day 2026 (last Monday of May) correctly', () => {
    const d = getLastDow(2026, 4, 1); // 4=May, dow 1=Mon
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(25);
    expect(d.getDay()).toBe(1);
  });

  it('handles a month where the last day already IS the target dow (zero offset)', () => {
    // Aug 2026 ends on a Monday (Aug 31, 2026) -- exercise the offset==0 branch.
    const lastOfMonth = new Date(2026, 8, 0);
    expect(lastOfMonth.getDay()).toBe(1); // sanity: confirms the fixture's premise
    const d = getLastDow(2026, 7, 1);
    expect(d.getDate()).toBe(31);
  });
});
