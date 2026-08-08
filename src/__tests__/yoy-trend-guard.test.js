// @ts-nocheck
// Notes 62: the 6-Week Performance chart plotted a y-axis of 200,000%-1,200,000%.
//
// getDOWTrend averages same-DOW year-over-year growth points, (cur - ly) / ly, guarded only by
// `ly > 0`. A closure day has sales just above zero and sails through as a DENOMINATOR. Real
// rows in labor_rows: $8.98 (2026-01-25), $9.38 (Christmas 2024), $30.07 (2025-01-22 ice storm).
// An $8.98 last-year value against a $10k day is +111,300%, and one such point in the mean
// destroys the trend the chart exists to show.
//
// The bound is measured: across 40,000 store-days in 26 stores, 39,357 (98.4%) sit at or above
// 70% of their own store's median day and only 76 fall below 25%. A day at 25% of median is
// exactly +300% growth, so ±300% is where the real distribution ends.
//
// These tests drive getDOWTrend through its real index rather than testing the helper directly,
// so they fail if the guard is removed from either call site.

import { describe, it, expect } from 'vitest';
import { getDOWTrend } from '../engine/forecast.js';
import { dKey, addD } from '../utils/date.js';

const LOC = '3708';
// getDOWTrend walks back from eDt collecting one same-DOW point per week in [wkS..wkE].
const END = new Date('2026-08-05T00:00:00');   // a Wednesday

// Build an index of normal $10k days for every day in a wide window, then let callers poison
// specific last-year days to imitate a closure.
function buildIdx({ closures = {}, lyValue = 10000 } = {}) {
  const idx = {};
  for (let i = 0; i < 900; i++) {
    const d = addD(END, -i);
    const k = LOC + '_' + dKey(d);
    const override = closures[dKey(d)];
    idx[k] = [{ loc: LOC, date: d, sales: override !== undefined ? override : lyValue }];
  }
  return idx;
}

describe('getDOWTrend — closure days cannot poison the YOY mean', () => {
  it('flat history yields ~0% growth', () => {
    const t = getDOWTrend(buildIdx(), LOC, END, END, 1, 6);
    expect(t).toBeCloseTo(0, 5);
  });

  it('a near-zero last-year day is DROPPED, not turned into a 100,000% surge', () => {
    // Poison every last-year same-DOW day in range with a closure-sized value.
    const closures = {};
    for (let i = 0; i < 900; i++) {
      const d = addD(END, -i);
      if (d.getDay() === END.getDay() && i > 300) closures[dKey(d)] = 8.98;  // the real 2026-01-25 value
    }
    const t = getDOWTrend(buildIdx({ closures }), LOC, END, END, 1, 6);

    // Unguarded this is (10000-8.98)/8.98 ≈ 1112 → the chart's 111,300%.
    expect(Math.abs(t)).toBeLessThanOrEqual(3.0);
    expect(t).toBe(0);   // every point dropped → no trend claimed, rather than a fake one
  });

  it('never returns a value outside the measured ±300% / -75% band', () => {
    for (const ly of [0.01, 1, 8.98, 30.07, 500, 10000, 50000, 250000]) {
      const closures = {};
      for (let i = 0; i < 900; i++) {
        const d = addD(END, -i);
        if (d.getDay() === END.getDay() && i > 300) closures[dKey(d)] = ly;
      }
      const t = getDOWTrend(buildIdx({ closures }), LOC, END, END, 1, 6);
      expect(t, `ly=${ly} produced ${t}`).toBeLessThanOrEqual(3.0);
      expect(t, `ly=${ly} produced ${t}`).toBeGreaterThanOrEqual(-0.75);
    }
  });

  it('a LEGITIMATE strong year is still reported, not flattened', () => {
    // +50% is real growth and must survive the guard untouched.
    const closures = {};
    for (let i = 0; i < 900; i++) {
      const d = addD(END, -i);
      if (d.getDay() === END.getDay() && i > 300) closures[dKey(d)] = 10000 / 1.5;
    }
    const t = getDOWTrend(buildIdx({ closures }), LOC, END, END, 1, 6);
    expect(t).toBeCloseTo(0.5, 2);
  });

  it('a real decline is still reported', () => {
    const closures = {};
    for (let i = 0; i < 900; i++) {
      const d = addD(END, -i);
      if (d.getDay() === END.getDay() && i > 300) closures[dKey(d)] = 10000 / 0.7;  // -30%
    }
    const t = getDOWTrend(buildIdx({ closures }), LOC, END, END, 1, 6);
    expect(t).toBeCloseTo(-0.3, 2);
  });
});
