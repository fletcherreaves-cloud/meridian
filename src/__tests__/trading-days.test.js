import { describe, it, expect } from 'vitest';
import { rangeDays, isWholeWeeks, needsTradingAlignment, weekdayCounts, shiftDays, priorYearRange, comparableRange } from '../engine/trading-days.js';

const dow = (d) => new Date(d + 'T00:00:00').getDay();

describe('trading-days foundation', () => {
  it('rangeDays is inclusive', () => {
    expect(rangeDays('2026-08-01', '2026-08-10')).toBe(10);
    expect(rangeDays('2026-08-01', '2026-08-01')).toBe(1);
    expect(rangeDays('2026-08-01', '2026-08-07')).toBe(7);
  });

  it('isWholeWeeks / needsTradingAlignment split on the 7-day boundary', () => {
    expect(isWholeWeeks('2026-08-01', '2026-08-07')).toBe(true);   // 7
    expect(isWholeWeeks('2026-08-01', '2026-08-28')).toBe(true);   // 28
    expect(isWholeWeeks('2026-08-01', '2026-08-10')).toBe(false);  // 10 (partial)
    expect(needsTradingAlignment('2026-08-01', '2026-08-10')).toBe(true);
    expect(needsTradingAlignment('2026-08-01', '2026-08-14')).toBe(false); // 14 balanced
  });

  it('weekdayCounts sums to the range length', () => {
    const c = weekdayCounts('2026-08-01', '2026-08-10');
    expect(c.reduce((a, b) => a + b, 0)).toBe(10);
    // a whole-week range has every weekday exactly once per week
    const w = weekdayCounts('2026-08-03', '2026-08-16'); // 14 days
    expect(w.every(n => n === 2)).toBe(true);
  });

  it('priorYearRange shifts exactly 364 days and PRESERVES day-of-week', () => {
    const cur = { start: '2026-08-01', end: '2026-08-10' };
    const ly = priorYearRange(cur.start, cur.end);
    // 364-day shift, not 365 → the calendar date moves, but the weekday is identical.
    expect(dow(ly.start)).toBe(dow(cur.start));
    expect(dow(ly.end)).toBe(dow(cur.end));
    expect(shiftDays(cur.start, -364)).toBe(ly.start);
    // 2026-08-01 minus 364 days = 2025-08-02 (one calendar day earlier, same weekday).
    expect(ly.start).toBe('2025-08-02');
    expect(ly.end).toBe('2025-08-11');
  });

  it('2 years back preserves weekday too (728-day shift)', () => {
    const ly2 = priorYearRange('2026-08-10', '2026-08-10', 2);
    expect(dow(ly2.start)).toBe(dow('2026-08-10'));
  });

  it('comparableRange flags trading vs calendar-ok correctly', () => {
    const partial = comparableRange('2026-08-01', '2026-08-10', { basis: 'ly' });
    expect(partial.method).toBe('trading');
    expect(dow(partial.start)).toBe(dow('2026-08-01'));   // weekday-aligned
    expect(partial.note).toMatch(/364-day/);

    const whole = comparableRange('2026-08-01', '2026-08-28', { basis: 'ly' });
    expect(whole.method).toBe('calendar-ok');
    expect(dow(whole.start)).toBe(dow('2026-08-01'));      // still aligned, just wasn't required
  });
});
