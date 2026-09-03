// @ts-nocheck
// features/smart-targets.js's trimmedMean/bestSustained4wk/trendSlope/roundTarget are pure
// numeric helpers that feed every value computeSmartTargets produces (App.js imports
// computeSmartTargets/SmartTargetPanel from this file). The only existing test touching this
// file (dispatch-167-tpph-scheduled-target.test.js) supplies laborRows:[]/opsRows:[]/ctrlRows:[]
// and only exercises a separate scheduled-TPPH code path, so these four helpers have never run
// on real data in a test.
//
// Note: src/__tests__/smart-targets.test.js also imports a function called `trendSlope`, but
// from a DIFFERENT module (engine/smart-targets.js) with a different implementation (raw OLS
// slope, min length 3) -- this file's trendSlope (min length 4, normalized to a per-4-period
// fraction of the series mean) is a separate function and was genuinely untested.
import { describe, it, expect } from 'vitest';
import { trimmedMean, bestSustained4wk, trendSlope, roundTarget } from '../features/smart-targets.js';

describe('trimmedMean', () => {
  it('returns null for empty/missing input', () => {
    expect(trimmedMean([])).toBeNull();
    expect(trimmedMean(null)).toBeNull();
  });

  it('trims the top/bottom 10% (floored, min 1) before averaging', () => {
    // len=10 -> cut=max(1,floor(1))=1 -> trims 1 from each end -> mean of [2..9]
    expect(trimmedMean([5, 1, 9, 3, 7, 2, 8, 4, 6, 10])).toBeCloseTo(5.5, 6);
    // len=20 -> cut=max(1,floor(2))=2 -> trims 2 from each end -> mean of [3..18]
    const vals20 = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(trimmedMean(vals20)).toBeCloseTo(10.5, 6);
  });

  it('returns null when trimming a tiny array (1 or 2 elements) leaves nothing', () => {
    // cut is always >=1 (Math.max(1,...)), so a 1- or 2-element array trims to empty.
    expect(trimmedMean([42])).toBeNull();
    expect(trimmedMean([1, 2])).toBeNull();
  });

  it('averages the single middle element of a 3-element array', () => {
    expect(trimmedMean([10, 5, 20])).toBe(10); // sorted [5,10,20], trim 1 each end -> [10]
  });
});

describe('bestSustained4wk', () => {
  it('returns null with fewer than 4 values', () => {
    expect(bestSustained4wk([1, 2, 3], 'higher')).toBeNull();
  });

  it('picks the highest 4-value rolling average for a "higher is better" metric', () => {
    expect(bestSustained4wk([10, 20, 30, 40, 50, 60], 'higher')).toBeCloseTo(45, 6); // [30,40,50,60]
  });

  it('picks the lowest 4-value rolling average for a "lower is better" metric', () => {
    expect(bestSustained4wk([10, 20, 30, 40, 50, 60], 'lower')).toBeCloseTo(25, 6); // [10,20,30,40]
  });
});

describe('trendSlope (features/smart-targets.js version)', () => {
  it('returns 0 with fewer than 4 values', () => {
    expect(trendSlope([1, 2, 3])).toBe(0);
  });

  it('computes a positive normalized trend for a rising linear series', () => {
    // OLS slope=10, mean=25 -> 10/25*4 = 1.6
    expect(trendSlope([10, 20, 30, 40])).toBeCloseTo(1.6, 6);
  });

  it('returns 0 for a flat series', () => {
    expect(trendSlope([5, 5, 5, 5])).toBe(0);
  });

  it('returns 0 when the series mean is 0, even with a real slope (division guard)', () => {
    expect(trendSlope([-10, -5, 5, 10])).toBe(0);
  });
});

describe('roundTarget', () => {
  it('returns null for a falsy, non-zero value (null/undefined)', () => {
    expect(roundTarget(null, 'tOepe')).toBeNull();
    expect(roundTarget(undefined, 'tLabor')).toBeNull();
  });

  it('treats 0 as a real value, not "missing"', () => {
    expect(roundTarget(0, 'tLabor')).toBe(0);
  });

  it('rounds tOepe to the nearest 5', () => {
    expect(roundTarget(242, 'tOepe')).toBe(240);
    expect(roundTarget(243, 'tOepe')).toBe(245);
  });

  it('rounds the 4-decimal-precision target keys to 4 decimal places', () => {
    expect(roundTarget(0.2534567, 'tLabor')).toBeCloseTo(0.2535, 6);
    expect(roundTarget(0.1119999, 'tTpph')).toBeCloseTo(0.112, 6);
  });

  it('rounds every other target key to 2 decimal places', () => {
    expect(roundTarget(5.6789, 'tAvgCheck')).toBeCloseTo(5.68, 6);
  });
});
