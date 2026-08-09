import { describe, it, expect } from 'vitest';
import { distStats, districtHourlyRatios, perStoreHourlyRatios, hourLabel, hourlyBiasTable } from '../engine/projection-accuracy.js';

describe('distStats', () => {
  it('returns null for an empty/all-invalid input', () => {
    expect(distStats([])).toBeNull();
    expect(distStats([null, undefined, NaN])).toBeNull();
  });
  it('computes percentiles and IQR', () => {
    const st = distStats([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(st.n).toBe(10);
    expect(st.median).toBeCloseTo(55, 5);
    expect(st.iqr).toBeCloseTo(st.p75 - st.p25, 8);
  });
});

describe('districtHourlyRatios', () => {
  it('sums every store together per (date, hour) before taking the ratio', () => {
    const rows = [
      { dt: '2026-08-01', hour_slot: '6', loc: '3708', actual_sales: 100, proj_sales: 200 },
      { dt: '2026-08-01', hour_slot: '6', loc: '5183', actual_sales: 300, proj_sales: 300 },
    ];
    const out = districtHourlyRatios(rows);
    expect(out).toHaveLength(1); // one (date, hour) sample, not one per store
    expect(out[0].ratio).toBeCloseTo((100 + 300) / (200 + 300) * 100, 5); // 80%, not avg(50%,100%)=75%
  });

  it('excludes a (date, hour) with zero total projection', () => {
    const rows = [{ dt: '2026-08-01', hour_slot: '4', loc: '3708', actual_sales: 0, proj_sales: 0 }];
    expect(districtHourlyRatios(rows)).toEqual([]);
  });

  it('supports the gc metric independently of sales', () => {
    const rows = [{ dt: '2026-08-01', hour_slot: '6', loc: '3708', actual_sales: 999, proj_sales: 999, actual_gc: 5, proj_gc: 10 }];
    expect(districtHourlyRatios(rows, { metric: 'gc' })[0].ratio).toBeCloseTo(50, 5);
  });
});

describe('perStoreHourlyRatios', () => {
  it('keeps each store separate — no cross-store summing', () => {
    const rows = [
      { dt: '2026-08-01', hour_slot: '6', loc: '3708', actual_sales: 100, proj_sales: 200 },
      { dt: '2026-08-01', hour_slot: '6', loc: '5183', actual_sales: 300, proj_sales: 300 },
    ];
    const out = perStoreHourlyRatios(rows);
    expect(out).toHaveLength(2);
    expect(out.find(r => r.loc === '3708').ratio).toBeCloseTo(50, 5);
    expect(out.find(r => r.loc === '5183').ratio).toBeCloseTo(100, 5);
  });
});

describe('hourLabel', () => {
  it('formats an hour_slot as the ending hour block', () => {
    expect(hourLabel('6')).toBe('5a-6a');
    expect(hourLabel('12')).toBe('11a-12p');
    expect(hourLabel('13')).toBe('12p-1p');
    expect(hourLabel('24')).toBe('11p-12a');
  });
});

describe('hourlyBiasTable', () => {
  it('groups by hour, computes bias vs baseline, sorted by hour-of-day', () => {
    const samples = [
      { hourSlot: '13', ratio: 90 }, { hourSlot: '13', ratio: 110 },
      { hourSlot: '6', ratio: 50 },
    ];
    const table = hourlyBiasTable(samples);
    expect(table.map(r => r.hourSlot)).toEqual(['6', '13']); // sorted by hour, not insertion order
    const h13 = table.find(r => r.hourSlot === '13');
    expect(h13.median).toBeCloseTo(100, 5);
    expect(h13.bias).toBeCloseTo(0, 5); // at the 100 baseline
    const h6 = table.find(r => r.hourSlot === '6');
    expect(h6.bias).toBeCloseTo(-50, 5); // 50% median vs 100 baseline
  });

  it('a persistent negative bias across many samples at one hour is visible directly', () => {
    // Reproduces the shape found live 2026-08-09: afternoon hours consistently ~10% under plan.
    const samples = Array.from({ length: 8 }, () => ({ hourSlot: '16', ratio: 88 + Math.random() * 4 }));
    const [row] = hourlyBiasTable(samples);
    expect(row.bias).toBeLessThan(-5);
    expect(row.n).toBe(8);
  });
});
