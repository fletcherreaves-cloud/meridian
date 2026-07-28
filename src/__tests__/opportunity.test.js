// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { percentile, bestInClass, computeOpportunity, annualize, rankByOpportunity } from '../engine/opportunity.js';

describe('percentile / bestInClass', () => {
  it('interpolates percentiles', () => {
    expect(percentile([10, 20, 30, 40], 0)).toBe(10);
    expect(percentile([10, 20, 30, 40], 1)).toBe(40);
    expect(percentile([10, 20, 30, 40], 0.5)).toBeCloseTo(25, 6);
  });
  it('best-in-class picks the low tail for cost, high tail for GC', () => {
    const vals = [0.20, 0.22, 0.24, 0.26];
    expect(bestInClass(vals, { higherIsBetter: false, frac: 0 })).toBe(0.20); // lowest cost
    expect(bestInClass(vals, { higherIsBetter: true, frac: 0 })).toBe(0.26);  // highest GC
  });
  it('handles empty / single', () => {
    expect(percentile([], 0.5)).toBe(null);
    expect(percentile([5], 0.9)).toBe(5);
  });
});

describe('computeOpportunity — target mode', () => {
  const stores = [
    // Over target on labor + FOB; GC below its (BIC) benchmark.
    { loc: 'A', netSales: 100000, prodSales: 100000, days: 30, avgCheck: 10,
      laborPctActual: 0.24, laborPctTarget: 0.22, fobPctActual: 0.045, fobPctTarget: 0.040, gcPerDayActual: 300 },
    // Beats target on labor (should floor to $0), on-target FOB.
    { loc: 'B', netSales: 200000, prodSales: 200000, days: 30, avgCheck: 12,
      laborPctActual: 0.20, laborPctTarget: 0.22, fobPctActual: 0.038, fobPctTarget: 0.038, gcPerDayActual: 500 },
  ];

  it('dollarizes labor + food gaps vs each store\'s own target', () => {
    const { perStore } = computeOpportunity(stores, { mode: 'target' });
    const a = perStore.find(p => p.loc === 'A');
    expect(a.labor$).toBeCloseTo((0.24 - 0.22) * 100000, 4); // 2000
    expect(a.food$).toBeCloseTo((0.045 - 0.040) * 100000, 4); // 500
  });

  it('floors a beat-the-target store at $0 (no negative credit)', () => {
    const { perStore } = computeOpportunity(stores, { mode: 'target' });
    const b = perStore.find(p => p.loc === 'B');
    expect(b.labor$).toBe(0);
    expect(b.food$).toBe(0);
  });

  it('rolls the district up by summation (dollar-weighted)', () => {
    const { district } = computeOpportunity(stores, { mode: 'target' });
    expect(district.labor$).toBeCloseTo(2000, 4);
    expect(district.food$).toBeCloseTo(500, 4);
    expect(district.total$).toBeCloseTo(district.labor$ + district.food$ + district.gc$, 6);
  });

  it('GC pillar = shortfall vs BIC × avg check × days', () => {
    // BIC GC/day (frac 0.1, higher better) across [300,500] ≈ 480; A is 300 → shortfall 180.
    const { perStore, benchmarks } = computeOpportunity(stores, { mode: 'target' });
    const a = perStore.find(p => p.loc === 'A');
    expect(a.gc$).toBeCloseTo((benchmarks.gcPerDay - 300) * 10 * 30, 4);
    const b = perStore.find(p => p.loc === 'B');
    expect(b.gc$).toBe(0); // B is the best → no shortfall
  });
});

describe('computeOpportunity — bic mode', () => {
  it('benchmarks every store against the single district best-in-class rate', () => {
    const stores = [
      { loc: 'A', netSales: 100000, prodSales: 100000, days: 30, avgCheck: 10, laborPctActual: 0.24, fobPctActual: 0.045, gcPerDayActual: 300 },
      { loc: 'B', netSales: 100000, prodSales: 100000, days: 30, avgCheck: 10, laborPctActual: 0.20, fobPctActual: 0.038, gcPerDayActual: 500 },
    ];
    const { perStore, benchmarks } = computeOpportunity(stores, { mode: 'bic', bicFrac: 0 });
    // frac 0 → BIC labor = min (0.20), BIC fob = min (0.038).
    expect(benchmarks.laborPct).toBe(0.20);
    const a = perStore.find(p => p.loc === 'A');
    expect(a.labor$).toBeCloseTo((0.24 - 0.20) * 100000, 4); // 4000 vs the best store
    const b = perStore.find(p => p.loc === 'B');
    expect(b.labor$).toBe(0); // B IS the best → $0
  });
});

describe('annualize / rank', () => {
  it('annualizes per-period dollars', () => {
    expect(annualize(1000, 12)).toBe(12000);
    expect(annualize(500, 52)).toBe(26000);
    expect(annualize(null)).toBe(0);
  });
  it('ranks stores by total opportunity, biggest first', () => {
    const { perStore } = computeOpportunity([
      { loc: 'A', netSales: 100000, days: 30, avgCheck: 10, laborPctActual: 0.24, laborPctTarget: 0.22, fobPctActual: 0.04, fobPctTarget: 0.04, gcPerDayActual: 300 },
      { loc: 'B', netSales: 100000, days: 30, avgCheck: 10, laborPctActual: 0.30, laborPctTarget: 0.22, fobPctActual: 0.04, fobPctTarget: 0.04, gcPerDayActual: 300 },
    ], { mode: 'target' });
    const ranked = rankByOpportunity(perStore);
    expect(ranked[0].loc).toBe('B'); // bigger labor gap
  });
});
