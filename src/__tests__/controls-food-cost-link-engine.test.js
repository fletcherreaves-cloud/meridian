// Reports redesign Phase 5 -- engine/controls-food-cost-link.js
import { describe, it, expect } from 'vitest';
import { monthsInRange, buildControlsFoodCostReport, FOOD_COST_METRICS, CONTROLS_LINK_METRICS } from '../engine/controls-food-cost-link.js';

describe('monthsInRange', () => {
  it('returns [] when either bound is missing', () => {
    expect(monthsInRange(null, '2026-10-31')).toEqual([]);
    expect(monthsInRange('2026-10-01', null)).toEqual([]);
  });

  it('returns a single month when the range sits inside one calendar month', () => {
    expect(monthsInRange('2026-10-05', '2026-10-20')).toEqual(['2026-10']);
  });

  it('returns every month the range spans, inclusive, across a year boundary', () => {
    expect(monthsInRange('2026-11-15', '2027-01-10')).toEqual(['2026-11', '2026-12', '2027-01']);
  });
});

describe('buildControlsFoodCostReport', () => {
  const ds = {
    fobRows: [
      { loc: '3708', date: new Date(2026, 9, 31), fobPct: 0.28, compWaste: 0.004, rawWaste: 0.003, condiment: 0.02, empMeal: 0.009, statVar: 0.01, unexplained: 0.0 },
    ],
    ctrlRows: [
      { loc: '3708', date: new Date(2026, 9, 5), depositAmt: 100, discPct: 0.02, discAmt: 40 },
      { loc: '3708', date: new Date(2026, 9, 20), depositAmt: 150, discPct: 0.03, discAmt: 60 },
    ],
    glimpseRows: [
      { loc: '3708', date: new Date(2026, 9, 5), empMealAmt: 30, empMealCnt: 4, mgrMealAmt: 10, mgrMealCnt: 1 },
      { loc: '3708', date: new Date(2026, 9, 20), empMealAmt: 45, empMealCnt: 6, mgrMealAmt: 15, mgrMealCnt: 2 },
    ],
    storeIds: ['3708'],
  };
  const range = { s: '2026-10-01', e: '2026-10-31' };

  it('returns [] when range is missing', () => {
    expect(buildControlsFoodCostReport(ds, { locs: ['3708'], range: null })).toEqual([]);
  });

  it('resolves one row per (store, month covering the range), carrying both the FOB and Controls metric families', () => {
    const rows = buildControlsFoodCostReport(ds, { locs: ['3708'], range });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.loc).toBe('3708');
    expect(r.name).toBe('Ardmore-Broadway');
    expect(r.month).toBe('2026-10');
    // compWaste/empMeal (FOB-reported %) both read straight off ds.fobRows via metric-source.js's
    // own srcs:[['fobRows', field]] chain. fobPct itself is deliberately NOT asserted here -- its
    // METRIC_SOURCES entry has no `srcs` at all (pure derive from fobTotalAmt/prodSalesAmt, which
    // in turn need ds.qsrFobRows), so a plain ds.fobRows fixture correctly resolves it to null;
    // that's metric-source.js's real behavior, not a bug in this report's own resolution.
    expect(r.compWaste).toBeCloseTo(0.004);
    expect(r.empMeal).toBeCloseTo(0.009); // FOB-reported Emp Meal %, distinct key from empMealAmt below
    expect(r.depositAmt).toBe(250); // 100 + 150, summed (aggregate:'sum')
    expect(r.empMealAmt).toBe(75); // 30 + 45
    expect(r.empMealCnt).toBe(10); // 4 + 6
  });

  it('spans multiple months when the range crosses a month boundary, one row per store-month', () => {
    const rows = buildControlsFoodCostReport(ds, { locs: ['3708'], range: { s: '2026-10-01', e: '2026-11-15' } });
    expect(rows.map(r => r.month)).toEqual(['2026-10', '2026-11']);
  });

  it('falls back to ds.storeIds when no locs given, and resolves null (not 0) for a metric with no data in that month', () => {
    const rows = buildControlsFoodCostReport(ds, { locs: [], range });
    expect(rows.map(r => r.loc)).toEqual(['3708']);
    const novRows = buildControlsFoodCostReport(ds, { locs: ['3708'], range: { s: '2027-01-01', e: '2027-01-31' } });
    expect(novRows[0].compWaste).toBeNull();
    expect(novRows[0].empMealAmt).toBeNull();
  });

  it('every metric in both families appears as a real key on each row', () => {
    const rows = buildControlsFoodCostReport(ds, { locs: ['3708'], range });
    for (const m of [...FOOD_COST_METRICS, ...CONTROLS_LINK_METRICS]) {
      expect(rows[0]).toHaveProperty(m.key);
    }
  });
});
