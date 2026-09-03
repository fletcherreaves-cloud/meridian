// @ts-nocheck
// why.js's computeForecastComposition had zero direct test coverage despite being live: called
// internally by runWhyEngineScan, which src/views/analytics.js, src/engine/coaching.js, and
// src/features/lifelenz.js all call to power the "why did we miss" forecast breakdown.
import { describe, it, expect } from 'vitest';
import { computeForecastComposition } from '../engine/why.js';

describe('computeForecastComposition', () => {
  it('returns null when there is no forecast result or a zero/falsy forecast', () => {
    expect(computeForecastComposition(null)).toBeNull();
    expect(computeForecastComposition({})).toBeNull();
    expect(computeForecastComposition({ forecast: 0 })).toBeNull();
  });

  it('attributes zero to every factor when none of the adjustment fields are present', () => {
    const r = computeForecastComposition({ forecast: 500 });
    expect(r.base).toBe(500);
    expect(r.weatherDollars).toBe(0);
    expect(r.opsDollars).toBe(0);
    expect(r.trendDollars).toBe(0);
    expect(r.eventDollars).toBe(0);
    expect(r.weatherPct).toBe(0);
  });

  it('decomposes a forecast with all four factors present into dollar contributions that sum back to the forecast', () => {
    const r = computeForecastComposition({ forecast: 1000, wAdj: 0.1, opsFactor: 1.2, trendFactor: 0.05, _evFactor: -0.02 });
    expect(r.weatherDollars).toBeCloseTo(90.909091, 4);
    expect(r.opsDollars).toBeCloseTo(166.666667, 4);
    expect(r.trendDollars).toBeCloseTo(47.619048, 4);
    expect(r.eventDollars).toBeCloseTo(-20.408163, 4);
    // The whole point of the decomposition: base + all factors reconstructs the forecast exactly.
    expect(r.base + r.weatherDollars + r.opsDollars + r.trendDollars + r.eventDollars).toBeCloseTo(1000, 6);
  });

  it('expresses each dollar factor as a percent of the forecast', () => {
    const r = computeForecastComposition({ forecast: 1000, wAdj: 0.1 });
    expect(r.weatherPct).toBeCloseTo(r.weatherDollars / 1000 * 100, 6);
  });

  it('floors opsFactor at 0.01 in its denominator to avoid a divide-by-zero blowup', () => {
    const r = computeForecastComposition({ forecast: 1000, opsFactor: 0 });
    expect(r.opsDollars).toBeCloseTo(1000 * ((0 - 1) / 0.01), 4);
    expect(Number.isFinite(r.opsDollars)).toBe(true);
  });
});
