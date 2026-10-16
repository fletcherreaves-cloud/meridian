// Reports redesign Phase 5 -- engine/weather-impact.js
import { describe, it, expect } from 'vitest';
import { buildWeatherImpactReport } from '../engine/weather-impact.js';

const D = (d) => new Date(2026, 9, d); // October 2026, local time

describe('buildWeatherImpactReport', () => {
  const ds = {
    laborRows: [
      { loc: '3708', date: D(1), sales: 1000, gc: 100 },
      { loc: '3708', date: D(2), sales: 1050, gc: 105 },
      { loc: '3708', date: D(3), sales: 900, gc: 90 },
      { loc: '3708', date: D(4), sales: 850, gc: 85 },
      { loc: '3708', date: D(5), sales: 800, gc: 80 },
      { loc: '3708', date: D(6), sales: 1500, gc: 150 },
    ],
    weatherRows: [
      { loc: '3708', date: D(1), tmax: 60, rain: 0 },
      { loc: '3708', date: D(2), tmax: 65, rain: 0 },
      { loc: '3708', date: D(3), tmax: 70, rain: 0.5 },
      { loc: '3708', date: D(4), tmax: 85, rain: 0.2 },
      { loc: '3708', date: D(5), tmax: 90, rain: 0.8 },
      { loc: '3708', date: D(6), tmax: 95, rain: 0 },
    ],
    storeIds: ['3708'],
  };
  const range = { s: '2026-10-01', e: '2026-10-06' };

  it('returns [] when range is missing', () => {
    expect(buildWeatherImpactReport(ds, { locs: ['3708'], range: null })).toEqual([]);
  });

  it('splits days into rainy/dry and hot/cool (median split) and computes real sales/GC deltas', () => {
    const rows = buildWeatherImpactReport(ds, { locs: ['3708'], range });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.name).toBe('Ardmore-Broadway');
    // rainy = days 3,4,5 (rain>0): sales 900,850,800 -> avg 850. dry = days 1,2,6: 1000,1050,1500 -> avg 1183.33
    expect(r.rainyDays).toBe(3);
    expect(r.dryDays).toBe(3);
    expect(r.rainySalesAvg).toBeCloseTo(850, 1);
    expect(r.drySalesAvg).toBeCloseTo(1183.33, 1);
    expect(r.rainSalesDeltaPct).toBeCloseTo(-28.17, 1);
    // hot = tmax>=median(85): days 4,5,6 (850,800,1500 -> avg 1050). cool = days 1,2,3 (1000,1050,900 -> avg 983.33)
    expect(r.hotDays).toBe(3);
    expect(r.coolDays).toBe(3);
    expect(r.hotSalesAvg).toBeCloseTo(1050, 1);
    expect(r.coolSalesAvg).toBeCloseTo(983.33, 1);
    expect(r.heatSalesDeltaPct).toBeCloseTo(6.78, 1);
    // GC follows the same split, independently resolved
    expect(r.rainyGCAvg).toBeCloseTo(85, 1);
    expect(r.dryGCAvg).toBeCloseTo(118.33, 1);
  });

  it('falls back to ds.storeIds when no locs given', () => {
    const rows = buildWeatherImpactReport(ds, { locs: [], range });
    expect(rows.map(r => r.loc)).toEqual(['3708']);
  });

  it('reports a null average (not a noisy 1-2 day average) for a group under the minimum day count', () => {
    const thinDs = {
      laborRows: [
        { loc: '3708', date: D(1), sales: 1000, gc: 100 },
        { loc: '3708', date: D(2), sales: 1100, gc: 110 },
      ],
      weatherRows: [
        { loc: '3708', date: D(1), tmax: 60, rain: 0 },
        { loc: '3708', date: D(2), tmax: 60, rain: 1 }, // only 1 rainy day -- under MIN_DAYS_PER_GROUP
      ],
      storeIds: ['3708'],
    };
    const rows = buildWeatherImpactReport(thinDs, { locs: ['3708'], range: { s: '2026-10-01', e: '2026-10-02' } });
    expect(rows[0].rainyDays).toBe(1);
    expect(rows[0].rainySalesAvg).toBeNull();
  });
});
