// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { aggregateLifelenzDarDaily } from '../engine/lifelenz-dar-daily.js';

describe('aggregateLifelenzDarDaily', () => {
  it('sums hourly rows into one row per (loc, dt)', () => {
    const rows = [
      { loc: '0003708', dt: '2026-11-16', netSales: 100, transactions: 10, actualPunchHours: 2 },
      { loc: '0003708', dt: '2026-11-16', netSales: 50, transactions: 5, actualPunchHours: 1 },
      { loc: '0003708', dt: '2026-11-17', netSales: 10, transactions: 1, actualPunchHours: 0.5 },
      { loc: '0005183', dt: '2026-11-16', netSales: 200, transactions: 20, actualPunchHours: 4 },
    ];
    const out = aggregateLifelenzDarDaily(rows);
    expect(out).toHaveLength(3);
    const a = out.find(r => r.loc === '0003708' && r.dt === '2026-11-16');
    expect(a.netSales).toBe(150);
    expect(a.transactions).toBe(15);
    expect(a.actualPunchHours).toBe(3);
    const b = out.find(r => r.loc === '0005183');
    expect(b.netSales).toBe(200);
  });

  it('treats null/missing numeric fields as 0, not NaN', () => {
    const rows = [
      { loc: '0003708', dt: '2026-11-16', netSales: null, transactions: null, actualPunchHours: null },
      { loc: '0003708', dt: '2026-11-16', netSales: 25, transactions: 3, actualPunchHours: 1 },
    ];
    const out = aggregateLifelenzDarDaily(rows);
    expect(out).toHaveLength(1);
    expect(out[0].netSales).toBe(25);
    expect(out[0].transactions).toBe(3);
  });

  it('returns [] for empty/missing input, skips rows with no loc or dt', () => {
    expect(aggregateLifelenzDarDaily([])).toEqual([]);
    expect(aggregateLifelenzDarDaily(null)).toEqual([]);
    expect(aggregateLifelenzDarDaily([{ loc: '0003708', netSales: 5 }, { dt: '2026-11-16', netSales: 5 }])).toEqual([]);
  });

  it('weights service-time averages by transactions, not a naive mean of hours', () => {
    const rows = [
      // Low-volume hour with a long time, high-volume hour with a short time -- a naive
      // (168+30)/2=99 mean would be wrong; the transaction-weighted true average is ~34.8.
      { loc: '0003708', dt: '2026-11-16', netSales: 0, transactions: 2, avgDtServiceTime: 168 },
      { loc: '0003708', dt: '2026-11-16', netSales: 0, transactions: 100, avgDtServiceTime: 30 },
    ];
    const out = aggregateLifelenzDarDaily(rows);
    const expected = (168 * 2 + 30 * 100) / (2 + 100);
    expect(out[0].avgDtServiceTime).toBeCloseTo(expected, 5);
    expect(expected).toBeLessThan(99); // sanity: weighting pulls it toward the high-volume hour
  });

  it('ignores a null service-time reading instead of treating it as 0', () => {
    const rows = [
      { loc: '0003708', dt: '2026-11-16', transactions: 10, avgDtServiceTime: null },
      { loc: '0003708', dt: '2026-11-16', transactions: 10, avgDtServiceTime: 40 },
    ];
    const out = aggregateLifelenzDarDaily(rows);
    expect(out[0].avgDtServiceTime).toBe(40); // not (0+40)/2=20
  });

  it('is null for a service-time field when no hour has a usable reading', () => {
    const out = aggregateLifelenzDarDaily([{ loc: '0003708', dt: '2026-11-16', transactions: 10 }]);
    expect(out[0].avgDtServiceTime).toBeNull();
    expect(out[0].avgFcServiceTime).toBeNull();
    expect(out[0].avgMfyServiceTime).toBeNull();
    expect(out[0].labourPercentageOfSales).toBeNull();
  });

  it('labourPercentageOfSales: sales-weighted average, converted from percent (45.5) to fraction (0.455)', () => {
    const rows = [
      { loc: '0003708', dt: '2026-11-16', netSales: 100, labourPercentageOfSales: 20 },  // $20 labor
      { loc: '0003708', dt: '2026-11-16', netSales: 300, labourPercentageOfSales: 40 },  // $120 labor
    ];
    const out = aggregateLifelenzDarDaily(rows);
    // True daily ratio: (20 + 120) / (100 + 300) = 0.35, as a FRACTION not a percent.
    expect(out[0].labourPercentageOfSales).toBeCloseTo(0.35, 10);
  });
});
