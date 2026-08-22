// @ts-nocheck
// Dispatch #72 B3 -- src/engine/why.js:113's weather-description ternary chain fell through to
// `wind>30?'high winds ('+wind+'mph)':''` -- `wind` was never declared; the weather row's field
// is `wmax` (confirmed by this same file's own line 39: 'wind '+(wRow.wmax||0)+'mph'). Short-
// circuit-guarded by the preceding rain/tmax ternary arms, so this only threw when a day had
// low rain, moderate temperature, AND high wind -- exactly the case that should describe wind
// as the cause.
//
// diagnoseMiss is a pure function, already exported -- this calls it directly with a fixture
// that reaches the wind branch (rain<=0.25, 35<=tmax<=100, wmax>30) and asserts the real wind
// speed appears in the weather cause text, not just that it doesn't throw.
import { describe, it, expect } from 'vitest';
import { diagnoseMiss } from '../engine/why.js';

describe('diagnoseMiss wind description (dispatch #72 B3)', () => {
  it('describes high winds using wRow.wmax when rain/temp both fall through', () => {
    const date = new Date('2026-03-10T12:00:00');
    const dk = '2026-03-10';
    const ds = { wxByDate: { [dk]: { rain: 0.1, tmax: 60, wmax: 42 } } };
    const r = { date, actual: 1000, forecast: 900, varPct: 0.1, wAdj: 0.05, opsFactor: 1 };

    let causes;
    expect(() => { causes = diagnoseMiss('10422', ds, {}, r); }).not.toThrow();

    const wx = causes.find(c => c.icon === '🌦');
    expect(wx).toBeTruthy();
    expect(wx.text).toContain('high winds (42mph)');
  });
});
