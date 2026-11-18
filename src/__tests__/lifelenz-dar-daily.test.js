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
});
