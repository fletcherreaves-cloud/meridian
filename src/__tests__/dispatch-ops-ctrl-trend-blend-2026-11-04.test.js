// @ts-nocheck
// Owner-requested 2026-11-04 ("Go ahead and build the trend-blend piece"), design doc:
// memory/plan-ops-ctrl-score-redesign-2026-11-04.md. Adds computeTrendBlendedScore(baseScore,
// trendDelta, sc) to pipeline.js -- blends the existing flat actual-vs-target opsScore/ctrlScore
// with a damped, capped contribution from the store's own score trend (vel.opsScore/
// vel.ctrlScore, buildStore's pre-existing "2wk score minus 4wk score" delta), so a store
// improving reads higher than an identically-positioned flat store and a declining store reads
// lower -- without opsScore/ctrlScore themselves changing for the many existing sort/rollup/
// coaching-threshold consumers that read them.
import { describe, it, expect } from 'vitest';
import { DEF_SETTINGS } from '../constants.js';

// pipeline.js transitively imports morning-brief.js, which assigns `window.onerror` at module
// top level -- stub it before the dynamic import, same pattern pipeline-ctrl-score.test.js uses.
globalThis.window = globalThis.window || {};
const { computeTrendBlendedScore } = await import('../engine/pipeline.js');

const sc = DEF_SETTINGS.scoring; // trendDamp:0.5, trendCap:8

describe('computeTrendBlendedScore — damped/capped trend blended on top of the flat base score', () => {
  it('returns the base score unchanged when there is no trend signal (null vel, e.g. too little history)', () => {
    expect(computeTrendBlendedScore(72, null, sc)).toBe(72);
  });

  it('returns the base score unchanged when the base score itself is null/undefined (nothing to blend into)', () => {
    expect(computeTrendBlendedScore(null, 10, sc)).toBeNull();
    expect(computeTrendBlendedScore(undefined, 10, sc)).toBeUndefined();
  });

  it('a positive trend (improving: recent 2wk score above the prior 4wk score) raises the blended score above the base', () => {
    // trendDelta=+6, damp=0.5 -> contribution = +3, within the +/-8 cap (not clamped)
    const blended = computeTrendBlendedScore(72, 6, sc);
    expect(blended).toBeCloseTo(75, 5);
    expect(blended).toBeGreaterThan(72);
  });

  it('a negative trend (declining) lowers the blended score below the base, symmetrically', () => {
    const blended = computeTrendBlendedScore(72, -6, sc);
    expect(blended).toBeCloseTo(69, 5);
    expect(blended).toBeLessThan(72);
  });

  it('caps the trend contribution at +trendCap even for a very large positive delta (one great 2-week stretch cannot dominate)', () => {
    // trendDelta=+40, damp=0.5 -> raw contribution=+20, clamped to the +8 cap
    const blended = computeTrendBlendedScore(60, 40, sc);
    expect(blended).toBeCloseTo(68, 5);
  });

  it('caps the trend contribution at -trendCap symmetrically for a very large negative delta', () => {
    const blended = computeTrendBlendedScore(60, -40, sc);
    expect(blended).toBeCloseTo(52, 5);
  });

  it('never exceeds 100 even when a high base score and a strong positive trend would otherwise push past it', () => {
    const blended = computeTrendBlendedScore(96, 40, sc); // base 96 + capped +8 = 104, must clamp
    expect(blended).toBe(100);
  });

  it('never drops below 0 even when a low base score and a strong negative trend would otherwise push past it', () => {
    const blended = computeTrendBlendedScore(4, -40, sc); // base 4 - capped 8 = -4, must clamp
    expect(blended).toBe(0);
  });

  it('a flat trend (delta=0) leaves the base score exactly unchanged', () => {
    expect(computeTrendBlendedScore(72, 0, sc)).toBe(72);
  });

  it('respects custom damp/cap params, not just the DEF_SETTINGS defaults (a future retune changes behavior without a code change)', () => {
    const looseSc = { trendDamp: 1, trendCap: 50 };
    expect(computeTrendBlendedScore(50, 10, looseSc)).toBe(60); // full weight, no clamp needed
  });
});
