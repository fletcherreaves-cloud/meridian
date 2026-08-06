import { describe, it, expect } from 'vitest';
import { plainMean, weightedMean, ratioOfSums, ratioOfSumsDerived } from '../engine/weighted.js';

// A light day and a heavy day — the shape that exposes average-of-averages.
const ROWS = [
  { sales: 2000,  laborPct: 30, gc: 200,  tpph: 4,  hrs: 50 },   // labor $600
  { sales: 20000, laborPct: 19, gc: 2000, tpph: 10, hrs: 200 },  // labor $3800
];

describe('plainMean', () => {
  it('averages positive values and ignores zero/blank', () => {
    expect(plainMean(ROWS, r => r.laborPct)).toBeCloseTo(24.5, 6);
    expect(plainMean([{ v: 10 }, { v: 0 }, { v: 20 }], r => r.v)).toBeCloseTo(15, 6);
  });

  it('returns 0 rather than NaN on empty or missing input', () => {
    expect(plainMean([], r => r.v)).toBe(0);
    expect(plainMean(null, r => r.v)).toBe(0);
  });
});

describe('weightedMean', () => {
  it('weights by the denominator instead of averaging ratios', () => {
    // (30*2000 + 19*20000) / 22000 = 20 — i.e. Σlabor$/Σsales
    expect(weightedMean(ROWS, r => r.laborPct, r => r.sales)).toBeCloseTo(20, 6);
  });

  it('materially differs from the plain mean — the reason it exists', () => {
    expect(plainMean(ROWS, r => r.laborPct)).toBeCloseTo(24.5, 6);
    expect(weightedMean(ROWS, r => r.laborPct, r => r.sales)).toBeCloseTo(20, 6);
  });

  it('collapses to the simple mean when weights are equal', () => {
    const even = [{ v: 20, w: 5000 }, { v: 30, w: 5000 }];
    expect(weightedMean(even, r => r.v, r => r.w)).toBeCloseTo(25, 6);
  });

  it('falls back to the plain mean when no row carries a weight', () => {
    // Forward-looking schedule: percentages exist, actual sales do not.
    const future = [{ v: 22, w: 0 }, { v: 26, w: 0 }];
    expect(weightedMean(future, r => r.v, r => r.w)).toBeCloseTo(24, 6);
  });

  it('skips rows missing either part rather than dragging toward zero', () => {
    const mixed = [{ v: 20, w: 10000 }, { v: 0, w: 5000 }, { v: 40, w: 0 }];
    expect(weightedMean(mixed, r => r.v, r => r.w)).toBeCloseTo(20, 6);
  });
});

describe('ratioOfSums', () => {
  it('computes average check as total sales over total guests', () => {
    // 22000 / 2200 = 10
    expect(ratioOfSums(ROWS, r => r.sales, r => r.gc)).toBeCloseTo(10, 6);
  });

  it('differs from the mean of per-day ratios', () => {
    // per-day checks are 10.0 and 10.0 here, so use a skewed case
    const skew = [{ s: 100, g: 20 }, { s: 900, g: 60 }]; // 5.0 and 15.0
    expect(plainMean(skew, r => r.s / r.g)).toBeCloseTo(10, 6);
    expect(ratioOfSums(skew, r => r.s, r => r.g)).toBeCloseTo(12.5, 6);
  });

  it('uses the fallback accessor when no denominator is present', () => {
    const noDen = [{ s: 0, g: 0, pre: 8 }, { s: 0, g: 0, pre: 12 }];
    expect(ratioOfSums(noDen, r => r.s, r => r.g, r => r.pre)).toBeCloseTo(10, 6);
  });

  it('returns 0 when there is no denominator and no fallback given', () => {
    expect(ratioOfSums([{ s: 0, g: 0 }], r => r.s, r => r.g)).toBe(0);
    expect(ratioOfSums([], r => r.s, r => r.g)).toBe(0);
  });
});

describe('ratioOfSumsDerived', () => {
  it('recovers the denominator from each row own ratio', () => {
    // hours: 200/4 = 50, 2000/10 = 200 → 2200/250 = 8.8
    expect(ratioOfSumsDerived(ROWS, r => r.gc, r => r.tpph)).toBeCloseTo(8.8, 6);
  });

  it('matches an explicit denominator when the stored one agrees', () => {
    // ROWS.hrs was chosen to equal gc/tpph, so both routes must agree.
    expect(ratioOfSumsDerived(ROWS, r => r.gc, r => r.tpph))
      .toBeCloseTo(ratioOfSums(ROWS, r => r.gc, r => r.hrs), 6);
  });

  it('round-trips a uniform rate regardless of volume', () => {
    const uniform = [{ n: 100, ratio: 5 }, { n: 900, ratio: 5 }];
    expect(ratioOfSumsDerived(uniform, r => r.n, r => r.ratio)).toBeCloseTo(5, 6);
  });

  it('differs from the mean of ratios when volumes are skewed', () => {
    expect(plainMean(ROWS, r => r.tpph)).toBeCloseTo(7, 6);
    expect(ratioOfSumsDerived(ROWS, r => r.gc, r => r.tpph)).toBeCloseTo(8.8, 6);
  });

  it('falls back to the plain mean of the ratio when numerators are absent', () => {
    const noNum = [{ n: 0, ratio: 6 }, { n: 0, ratio: 8 }];
    expect(ratioOfSumsDerived(noNum, r => r.n, r => r.ratio)).toBeCloseTo(7, 6);
  });

  it('never divides by zero', () => {
    expect(ratioOfSumsDerived([], r => r.n, r => r.ratio)).toBe(0);
    expect(ratioOfSumsDerived([{ n: 0, ratio: 0 }], r => r.n, r => r.ratio)).toBe(0);
  });
});
