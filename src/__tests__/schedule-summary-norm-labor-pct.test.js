// @ts-nocheck
// schedule-summary.js's normLaborPct had zero direct test coverage despite being live:
// called internally by rollup() (schedule-summary.js) and twice more in src/views/scheduling.js
// to normalize a daily labor% reading (which can arrive as a fraction or a percent, and can be
// wildly out of band on a partial/future day) before it's dollar-weighted into a weekly average.
// scheduling-formula-348.test.js only references it in a comment; it's never invoked there.
import { describe, it, expect } from 'vitest';
import { normLaborPct } from '../engine/schedule-summary.js';

describe('normLaborPct', () => {
  it('returns null for null, undefined, and non-finite values', () => {
    expect(normLaborPct(null)).toBeNull();
    expect(normLaborPct(undefined)).toBeNull();
    expect(normLaborPct(NaN)).toBeNull();
    expect(normLaborPct(Infinity)).toBeNull();
  });

  it('accepts a fraction (<=1.5 abs) and scales it to a percent', () => {
    expect(normLaborPct(0.245)).toBeCloseTo(24.5, 6);
  });

  it('accepts a value already on the percent scale (>1.5 abs) unchanged', () => {
    expect(normLaborPct(24.5)).toBe(24.5);
  });

  it('keeps the minimum band boundary (3%) inclusive', () => {
    expect(normLaborPct(0.03)).toBeCloseTo(3, 6);
  });

  it('drops a percent-scale reading below the 3% floor (garbage/near-zero day)', () => {
    expect(normLaborPct(2)).toBeNull();
  });

  it('drops a percent-scale reading above the 70% ceiling (partial-day accrual spike)', () => {
    expect(normLaborPct(75)).toBeNull();
  });

  it('drops a fraction reading that scales above the 70% ceiling (e.g. 0.80 -> 80%)', () => {
    expect(normLaborPct(0.80)).toBeNull();
  });

  it('drops a negative reading (fraction scale multiplies the sign through, still out of band)', () => {
    expect(normLaborPct(-0.245)).toBeNull();
  });
});
