// @ts-nocheck
// engine/correlation-stats.js's spearman/pValueFromR/benjaminiHochberg already have direct
// coverage via signal-scanner.test.js (imported through signal-registry.js's re-export of these
// SAME functions, per this file's own header comment: "byte-identical math, only relocated").
// pearson() and linearRegression() had none — not the same as engine/csat-signals.js's own
// separate pearson() (deliberately different n>=3 floor for thin CSAT data; see that file's
// header comment), and views/signals.js's merged Correlations tab imports this file's pearson
// directly (dispatch #195). Covers this file's own documented n>=5 / zero-variance guardrails.
import { describe, it, expect } from 'vitest';
import { pearson, linearRegression } from '../engine/correlation-stats.js';

describe('pearson', () => {
  it('returns null under 5 points (this file\'s own floor, stricter than csat-signals.js\'s n>=3)', () => {
    expect(pearson([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 4 }])).toBeNull();
  });

  it('is +1 for a perfect positive linear relation at n=5', () => {
    const pairs = [1, 2, 3, 4, 5].map(i => ({ x: i, y: i * 2 }));
    expect(pearson(pairs)).toBeCloseTo(1, 6);
  });

  it('is -1 for a perfect negative linear relation', () => {
    const pairs = [1, 2, 3, 4, 5].map(i => ({ x: i, y: 10 - i }));
    expect(pearson(pairs)).toBeCloseTo(-1, 6);
  });

  it('returns null when one axis has zero variance (a constant series)', () => {
    const pairs = [1, 2, 3, 4, 5].map(i => ({ x: i, y: 7 }));
    expect(pearson(pairs)).toBeNull();
  });

  it('clamps to [-1, 1] against floating-point overshoot', () => {
    const pairs = [1, 2, 3, 4, 5].map(i => ({ x: i, y: i }));
    const r = pearson(pairs);
    expect(r).toBeLessThanOrEqual(1);
    expect(r).toBeGreaterThanOrEqual(-1);
  });
});

describe('linearRegression', () => {
  it('returns null under 5 points', () => {
    expect(linearRegression([{ x: 1, y: 1 }, { x: 2, y: 2 }])).toBeNull();
  });

  it('fits an exact line (y = 2x + 1) with slope/intercept recovered precisely', () => {
    const pairs = [1, 2, 3, 4, 5].map(x => ({ x, y: 2 * x + 1 }));
    const fit = linearRegression(pairs);
    expect(fit.slope).toBeCloseTo(2, 6);
    expect(fit.intercept).toBeCloseTo(1, 6);
  });

  it('returns the mean of x and y alongside the fit', () => {
    const pairs = [1, 2, 3, 4, 5].map(x => ({ x, y: x }));
    const fit = linearRegression(pairs);
    expect(fit.mx).toBeCloseTo(3, 6);
    expect(fit.my).toBeCloseTo(3, 6);
  });

  it('returns null when x has zero variance (a vertical line has no slope)', () => {
    const pairs = [1, 2, 3, 4, 5].map(y => ({ x: 7, y }));
    expect(linearRegression(pairs)).toBeNull();
  });
});
