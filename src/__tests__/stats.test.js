import { describe, it, expect } from 'vitest';
import { mean, median, mad, robustBaseline, percentile, bestQuartile, dollarWeightedRatio, stepToward } from '../utils/stats.js';

describe('stats — central tendency', () => {
  it('mean ignores non-numbers, null on empty', () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(mean([2, null, undefined, NaN, 6])).toBe(4);
    expect(mean([])).toBeNull();
  });
  it('median handles odd/even/empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it('mad is the median absolute deviation', () => {
    // median=3; deviations |1-3|,|2-3|,|3-3|,|4-3|,|5-3| = 2,1,0,1,2 → median 1
    expect(mad([1, 2, 3, 4, 5])).toBe(1);
  });
});

describe('stats — robustBaseline rejects anomalies', () => {
  it('excludes a wild outlier and reports the count', () => {
    // 20 tight points around 100, plus one broken day at 10000
    const xs = [];
    for (let i = 0; i < 20; i++) xs.push(100 + (i % 5) - 2); // 98..102
    xs.push(10000);
    const r = robustBaseline(xs, 3);
    expect(r.excluded).toBe(1);
    expect(r.value).toBeGreaterThan(95);
    expect(r.value).toBeLessThan(105);
  });
  it('keeps everything when there is no spread', () => {
    const r = robustBaseline([5, 5, 5, 5]);
    expect(r.value).toBe(5);
    expect(r.excluded).toBe(0);
  });
  it('null value on empty input', () => {
    expect(robustBaseline([]).value).toBeNull();
  });
});

describe('stats — percentile & best-quartile', () => {
  it('percentile interpolates', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([10], 90)).toBe(10);
  });
  it('bestQuartile picks the good tail by direction', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9]; // 25th=3, 75th=7
    expect(bestQuartile(xs, true)).toBe(3);   // lower better → 25th
    expect(bestQuartile(xs, false)).toBe(7);  // higher better → 75th
  });
});

describe('stats — dollar-weighting (never average averages)', () => {
  it('weights by base, differing from a naive mean of ratios', () => {
    // Store A: 5% of $100 = $5 waste. Store B: 15% of $1000 = $150 waste.
    // True combined = 155/1100 = 14.09%. Mean of ratios = (5+15)/2 = 10% (WRONG).
    const pairs = [{ num: 5, den: 100 }, { num: 150, den: 1000 }];
    const weighted = dollarWeightedRatio(pairs);
    expect(weighted).toBeCloseTo(155 / 1100, 10);
    expect(weighted).not.toBeCloseTo(0.10, 3);
  });
  it('null when total base is zero', () => {
    expect(dollarWeightedRatio([{ num: 0, den: 0 }])).toBeNull();
  });
});

describe('stats — stepToward', () => {
  it('moves a fraction of the gap', () => {
    expect(stepToward(100, 80, 0.25)).toBe(95); // 25% of the -20 gap
  });
  it('respects the cap', () => {
    expect(stepToward(100, 0, 0.25, 5)).toBe(95); // uncapped would be 75; cap 5 → 95
  });
  it('never overshoots the anchor beyond the fraction', () => {
    expect(stepToward(10, 20, 0.5)).toBe(15);
  });
  it('passes through when either side is null', () => {
    expect(stepToward(null, 20, 0.5)).toBeNull();
    expect(stepToward(10, null, 0.5)).toBe(10);
  });
});
