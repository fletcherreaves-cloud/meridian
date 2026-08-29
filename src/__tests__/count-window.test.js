// @ts-nocheck
// Dispatch #210 -- scripts/lib/count-window.mjs is the extracted EOM count-window gate
// (previously duplicated only inside qsrsoft-onhand-pull.mjs; qsrsoft-variance-pull.mjs
// now reuses the same functions rather than reimplementing them). Pure functions, so
// this is a real behavioral test against fixed instants, not a source-text regex.
import { describe, it, expect } from 'vitest';
import { inCountWindow, centralHour, inCtBusinessHours } from '../../scripts/lib/count-window.mjs';

describe('inCountWindow — last 3 calendar days of the month (UTC)', () => {
  it('true on the last day of a 31-day month', () => {
    expect(inCountWindow(new Date(Date.UTC(2026, 7, 31, 12)))).toBe(true); // Aug 31
  });
  it('true on the 3rd-to-last day (Aug 29 of a 31-day month)', () => {
    expect(inCountWindow(new Date(Date.UTC(2026, 7, 29, 0)))).toBe(true);
  });
  it('false on the 4th-to-last day (Aug 28)', () => {
    expect(inCountWindow(new Date(Date.UTC(2026, 7, 28, 23, 59)))).toBe(false);
  });
  it('handles a 28-day February correctly (last 3 days = 26/27/28)', () => {
    expect(inCountWindow(new Date(Date.UTC(2026, 1, 26, 0)))).toBe(true);
    expect(inCountWindow(new Date(Date.UTC(2026, 1, 25, 23, 59)))).toBe(false);
  });
  it('handles a 30-day month (April) correctly', () => {
    expect(inCountWindow(new Date(Date.UTC(2026, 3, 28, 0)))).toBe(true);
    expect(inCountWindow(new Date(Date.UTC(2026, 3, 27, 23, 59)))).toBe(false);
  });
  it('early in the month is false', () => {
    expect(inCountWindow(new Date(Date.UTC(2026, 7, 1, 12)))).toBe(false);
  });
});

describe('centralHour — DST-safe America/Chicago hour, pinned hourCycle h23', () => {
  it('resolves a known UTC instant to the correct CDT (summer, UTC-5) hour', () => {
    // 2026-08-29 15:00 UTC == 10:00 CDT
    expect(centralHour(new Date('2026-08-29T15:00:00Z'))).toBe(10);
  });
  it('resolves a known UTC instant to the correct CST (winter, UTC-6) hour', () => {
    // 2026-01-15 15:00 UTC == 09:00 CST
    expect(centralHour(new Date('2026-01-15T15:00:00Z'))).toBe(9);
  });
  it('midnight renders as 0, not 24 (hourCycle h23 pinned, dispatch #60)', () => {
    // 2026-08-29 05:00 UTC == 00:00 CDT
    expect(centralHour(new Date('2026-08-29T05:00:00Z'))).toBe(0);
  });
});

describe('inCtBusinessHours — [start, end) Central time', () => {
  it('true inside the window', () => {
    // 2026-08-29 15:00 UTC == 10:00 CDT
    expect(inCtBusinessHours(new Date('2026-08-29T15:00:00Z'), 8, 18)).toBe(true);
  });
  it('false before the window (7am CDT)', () => {
    expect(inCtBusinessHours(new Date('2026-08-29T12:00:00Z'), 8, 18)).toBe(false);
  });
  it('false at/after the end boundary (6pm CDT, half-open)', () => {
    expect(inCtBusinessHours(new Date('2026-08-29T23:00:00Z'), 8, 18)).toBe(false);
  });
  it('true right at the start boundary (8am CDT)', () => {
    expect(inCtBusinessHours(new Date('2026-08-29T13:00:00Z'), 8, 18)).toBe(true);
  });
});
