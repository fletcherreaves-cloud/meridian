// @ts-nocheck
// Owner req (2026-11-05): "On Forecast Table tab, lets add lifelenz forecast line as well like we
// did on Overview [the Sales Trend overlay, dispatch-lifelenz-sales-trend-overlay-2026-11-01].
// Could clarify in most accurate and biggest miss which one it is using. Maybe implement a
// toggle, defaulted to Lifelenz forecast since that is what is officially driving the schedule."
//
// Covers the two pure functions ForecastTable (src/views/store-dash.js) now uses to grade either
// forecast source off ONE math path instead of two hand-duplicated copies:
//   - computeBacktestStats(rows)      — generalized out of the old inline IIFE, unchanged formulas
//   - lifeLenzBacktestRows(rows, tol, todayBiz) — same actual>0/forecast>0/not-today filter as the
//     engineered backtest, but reads `.lfzForecast` (zipped on via lifeLenzSeries, same ds.schedRows
//     convention as the Overview tab's overlay — see dispatch-lifelenz-sales-trend-overlay-2026-11-01
//     .test.js) and RECOMPUTES varPct/pass against that number so diagnoseMiss/passRate grade the
//     same forecast the stats are built from, not a stale engineered-model varPct.
import { describe, it, expect } from 'vitest';
import { computeBacktestStats, lifeLenzBacktestRows } from '../views/store-dash.js';

function d(dateStr) { return new Date(dateStr + 'T12:00:00'); }

describe('computeBacktestStats', () => {
  it('returns null with fewer than 2 rows', () => {
    expect(computeBacktestStats([])).toBeNull();
    expect(computeBacktestStats([{ date: d('2026-10-20'), actual: 9000, forecast: 9000, pass: true }])).toBeNull();
  });

  it('computes mape/bias/passRate/accuracy and picks best/worst by absolute dollar error', () => {
    const rows = [
      { date: d('2026-10-20'), actual: 10000, forecast: 10100, pass: true },  // 1% off — best
      { date: d('2026-10-21'), actual: 10000, forecast: 8000,  pass: false }, // 20% off — worst
    ];
    const bt = computeBacktestStats(rows);
    expect(bt.n).toBe(2);
    expect(bt.mape).toBeCloseTo(10.5, 5); // (1%+20%)/2
    expect(bt.passRate).toBe(50);
    expect(bt.best.actual).toBe(10000);
    expect(bt.best.forecast).toBe(10100);
    expect(bt.worst.forecast).toBe(8000);
    expect(bt.accuracy).toBeCloseTo(100 - bt.mape, 5);
  });

  it('bias is signed mean (forecast-actual)/actual — positive means the model skews high', () => {
    const rows = [
      { date: d('2026-10-20'), actual: 10000, forecast: 11000, pass: false },
      { date: d('2026-10-21'), actual: 10000, forecast: 11000, pass: false },
    ];
    const bt = computeBacktestStats(rows);
    expect(bt.bias).toBeCloseTo(10, 5);
  });
});

describe('lifeLenzBacktestRows', () => {
  it('drops rows with no LifeLenz value, no actual, or that are the current business day', () => {
    const rows = [
      { date: d('2026-10-20'), actual: 10000, forecast: 9800, lfzForecast: 9700 },
      { date: d('2026-10-21'), actual: 10000, forecast: 9800, lfzForecast: null },   // no LFZ match
      { date: d('2026-10-22'), actual: 0,     forecast: 9800, lfzForecast: 9700 },   // no actual yet
      { date: d('2026-10-23'), actual: 10000, forecast: 9800, lfzForecast: 9700 },   // today — excluded
    ];
    const out = lifeLenzBacktestRows(rows, 0.05, '2026-10-23');
    expect(out.map(r => r.date.toISOString().slice(0, 10))).toEqual(['2026-10-20']);
  });

  it('swaps .forecast to the LifeLenz number, keeps the engineered value on .engForecast, and recomputes varPct/pass against LifeLenz', () => {
    const rows = [
      // actual 10000, engineered forecast 11000 (10% over — would FAIL a 5% tolerance),
      // LifeLenz forecast 10200 (2% over — PASSES a 5% tolerance). The two sources disagree on
      // whether this day was a miss, which is exactly why pass/varPct must be recomputed per
      // source rather than reused from the engineered row.
      { date: d('2026-10-20'), actual: 10000, forecast: 11000, lfzForecast: 10200, varPct: -0.1, pass: false },
    ];
    const out = lifeLenzBacktestRows(rows, 0.05, '2099-01-01');
    expect(out).toHaveLength(1);
    const r = out[0];
    expect(r.forecast).toBe(10200);
    expect(r.engForecast).toBe(11000);
    expect(r.varPct).toBeCloseTo((10000 - 10200) / 10000, 5);
    expect(r.pass).toBe(true); // 2% <= 5% tolerance, even though the engineered row above says false
  });

  it('returns an empty array when no row carries a usable LifeLenz value', () => {
    const rows = [{ date: d('2026-10-20'), actual: 10000, forecast: 9800, lfzForecast: 0 }];
    expect(lifeLenzBacktestRows(rows, 0.05, '2099-01-01')).toEqual([]);
  });
});

describe('computeBacktestStats + lifeLenzBacktestRows wired together (ForecastTable toggle)', () => {
  it('the same day set can grade differently depending on which source drives the stats', () => {
    // Engineered model consistently runs ~10% high; LifeLenz consistently runs ~2% high.
    const rows = [
      { date: d('2026-10-20'), actual: 10000, forecast: 11000, lfzForecast: 10200 },
      { date: d('2026-10-21'), actual: 12000, forecast: 13200, lfzForecast: 12240 },
      { date: d('2026-10-22'), actual: 9000,  forecast: 9900,  lfzForecast: 9180 },
    ];
    const tolerance = 0.05;
    const engRows = rows.map(r => ({ ...r, pass: Math.abs((r.actual - r.forecast) / r.actual) <= tolerance }));
    const lfzRows = lifeLenzBacktestRows(rows, tolerance, '2099-01-01');

    const engBt = computeBacktestStats(engRows);
    const lfzBt = computeBacktestStats(lfzRows);

    expect(engBt.passRate).toBe(0);    // every day misses a 5% tolerance at ~10% high
    expect(lfzBt.passRate).toBe(100);  // every day passes a 5% tolerance at ~2% high
    expect(lfzBt.mape).toBeLessThan(engBt.mape);
  });
});
