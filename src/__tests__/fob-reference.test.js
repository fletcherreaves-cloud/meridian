// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { fobDailyDeltas, computeFobReferenceTable, FOB_REFERENCE_METRICS } from '../engine/fob-reference.js';

const LOC = '3708';
const d = (s) => s; // qsr_fob date column comes back as a plain "YYYY-MM-DD" string, per supabase.js

describe('fobDailyDeltas — reconstructing true daily $ activity from a cumulative MTD snapshot', () => {
  it('treats the first row of a month as that day\'s own activity (no prior cumulative to subtract)', () => {
    const ds = { qsrFobRows: [
      { loc: '0003708', date: d('2026-10-01'), prodSalesAmt: 10000, compWasteAmt: 50, rawWasteAmt: 30,
        condimentsAmt: 20, empMgrMealsAmt: 10, statVarianceAmt: 5, unexplainedAmt: 2, discountCouponsAmt: 15,
        totalBaseFood: 400 },
    ] };
    const deltas = fobDailyDeltas(ds);
    expect(deltas[LOC]).toHaveLength(1);
    expect(deltas[LOC][0].sales).toBe(10000);
    expect(deltas[LOC][0].legs.compWaste).toBe(50);
    expect(deltas[LOC][0].legs.baseFoodPct).toBe(400);
  });

  it('diffs consecutive same-month rows — a growing cumulative snapshot becomes real per-day deltas', () => {
    const ds = { qsrFobRows: [
      { loc: '0003708', date: d('2026-10-01'), prodSalesAmt: 10000, compWasteAmt: 50 },
      { loc: '0003708', date: d('2026-10-02'), prodSalesAmt: 22000, compWasteAmt: 90 }, // +12000 / +40
      { loc: '0003708', date: d('2026-10-03'), prodSalesAmt: 35000, compWasteAmt: 120 }, // +13000 / +30
    ] };
    const deltas = fobDailyDeltas(ds);
    expect(deltas[LOC].map(e => e.sales)).toEqual([10000, 12000, 13000]);
    expect(deltas[LOC].map(e => e.legs.compWaste)).toEqual([50, 40, 30]);
  });

  it('resets at a new calendar month instead of diffing against the prior month\'s final cumulative', () => {
    const ds = { qsrFobRows: [
      { loc: '0003708', date: d('2026-09-30'), prodSalesAmt: 300000, compWasteAmt: 900 }, // Sep month-end total
      { loc: '0003708', date: d('2026-10-01'), prodSalesAmt: 9500, compWasteAmt: 45 },     // Oct day 1 — own total, NOT 9500-300000
    ] };
    const deltas = fobDailyDeltas(ds);
    expect(deltas[LOC][1].sales).toBe(9500);
    expect(deltas[LOC][1].legs.compWaste).toBe(45);
  });

  it('normalizes zero-padded qsr_fob loc to the app\'s unpadded convention', () => {
    const ds = { qsrFobRows: [{ loc: '0005183', date: d('2026-10-01'), prodSalesAmt: 1000 }] };
    const deltas = fobDailyDeltas(ds);
    expect(deltas['5183']).toBeDefined();
    expect(deltas['0005183']).toBeUndefined();
  });
});

describe('computeFobReferenceTable — per-store Loc/L3M/L6W/LM/MTD/Projected/Trend', () => {
  // asOf = Oct 15, 2026 → MTD = Oct 1-15, LM = Sep (full), L3M = Jul+Aug+Sep, L6W = Sep 4 - Oct 15.
  const asOf = new Date(2026, 9, 15);

  function fobRow(dateStr, overrides = {}) {
    return { loc: '0003708', date: dateStr, prodSalesAmt: 10000, compWasteAmt: 150, rawWasteAmt: 100,
      condimentsAmt: 80, empMgrMealsAmt: 40, statVarianceAmt: 60, unexplainedAmt: 10,
      discountCouponsAmt: 120, totalBaseFood: 4000,
      pnlFoodCostBegin: 0, pnlFoodCostPurchases: 2800, pnlFoodCostAdjustments: 0,
      pnlFoodCostTransfers: 0, pnlFoodCostPromotions: 0, pnlFoodCostEnd: 0,
      pnlPaperCostBegin: 0, pnlPaperCostPurchases: 350, pnlPaperCostAdjustments: 0,
      pnlPaperCostTransfers: 0, pnlPaperCostPromotions: 0, pnlPaperCostEnd: 0,
      ...overrides };
  }

  // One qsr_fob row per day for Jul 1 → Oct 15, each day's cumulative = (day-of-month × per-day
  // leg), so every reconstructed daily delta is identical and the ratio is stable across windows
  // — makes the expected ratio trivial to hand-compute: compWaste/sales = 150/10000 = 1.5% always.
  function buildMonthRows(year, month, throughDay) {
    const rows = [];
    for (let day = 1; day <= throughDay; day++) {
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      rows.push(fobRow(iso, {
        prodSalesAmt: 10000 * day, compWasteAmt: 150 * day, rawWasteAmt: 100 * day,
        condimentsAmt: 80 * day, empMgrMealsAmt: 40 * day, statVarianceAmt: 60 * day,
        unexplainedAmt: 10 * day, discountCouponsAmt: 120 * day, totalBaseFood: 4000 * day,
        pnlFoodCostPurchases: 2800 * day, pnlPaperCostPurchases: 350 * day,
      }));
    }
    return rows;
  }

  const qsrFobRows = [
    ...buildMonthRows(2026, 7, 31),
    ...buildMonthRows(2026, 8, 31),
    ...buildMonthRows(2026, 9, 30),
    ...buildMonthRows(2026, 10, 15),
  ];

  const laborRows = qsrFobRows.map(r => ({
    loc: '3708', date: new Date(r.date + 'T00:00:00'), sales: r.prodSalesAmt, gc: Math.round(r.prodSalesAmt / 10),
    tpph: 5.5,
  }));
  const opsLaborRows = qsrFobRows.map(r => ({
    loc: '3708', date: new Date(r.date + 'T00:00:00'), laborDollar: r.prodSalesAmt * 0.21,
  }));
  const ebosRows = qsrFobRows.map(r => ({
    loc: '3708', date: new Date(r.date + 'T00:00:00'), opsPurchases: 80,
  }));

  const ds = { qsrFobRows, laborRows, opsLaborRows, ebosRows, storeIds: ['3708'] };

  it('resolves a FOB-leg metric (Comp Waste %) to the true dollar-weighted ratio, not an average-of-cumulative', () => {
    const [row] = computeFobReferenceTable(ds, LOC, asOf);
    const compWaste = row.metrics.compWastePct;
    // Every reconstructed day has compWaste/sales = 150/10000 = 1.5% exactly, in every window.
    expect(compWaste.mtd).toBeCloseTo(0.015, 6);
    expect(compWaste.lm).toBeCloseTo(0.015, 6);
    expect(compWaste.l3m).toBeCloseTo(0.015, 6);
    expect(compWaste.l6w).toBeCloseTo(0.015, 6);
    expect(compWaste.projected).toBeCloseTo(0.015, 6);
  });

  it('crew labor % (laborPct chain) sum-ratios opsLaborRows.laborDollar over laborRows.sales', () => {
    const [row] = computeFobReferenceTable(ds, LOC, asOf);
    // laborDollar is set to a constant 21% of sales on every day → Σ/Σ = 0.21 regardless of window.
    expect(row.metrics.crewLaborPct.mtd).toBeCloseTo(0.21, 6);
    expect(row.metrics.crewLaborPct.lm).toBeCloseTo(0.21, 6);
  });

  it('sales projection sums real daily sales over the window (auto-first total)', () => {
    const [row] = computeFobReferenceTable(ds, LOC, asOf);
    // September: Σ(10000*day) for day=1..30 = 10000 * (30*31/2) = 4,650,000
    expect(row.metrics.salesProjection.lm).toBeCloseTo(4650000, 0);
  });

  it('op supply target sums ebosRows.opsPurchases over the window', () => {
    const [row] = computeFobReferenceTable(ds, LOC, asOf);
    expect(row.metrics.opSupplyTarget.lm).toBeCloseTo(80 * 30, 2); // Sep = 30 days * $80
    expect(row.metrics.opSupplyTarget.mtd).toBeCloseTo(80 * 15, 2); // Oct 1-15
  });

  it('every registered metric produces a well-formed row (no throws, keys present)', () => {
    const [row] = computeFobReferenceTable(ds, LOC, asOf);
    for (const m of FOB_REFERENCE_METRICS) {
      const cell = row.metrics[m.key];
      expect(cell).toBeDefined();
      expect(['l3m', 'l6w', 'lm', 'mtd', 'projected']).toEqual(expect.arrayContaining(Object.keys(cell).filter(k => ['l3m','l6w','lm','mtd','projected'].includes(k))));
      expect(['up', 'down', 'flat']).toContain(cell.trend);
    }
  });

  it('flat compWaste% (constant ratio every month) reports a flat trend, not a spurious direction', () => {
    const [row] = computeFobReferenceTable(ds, LOC, asOf);
    expect(row.metrics.compWastePct.trend).toBe('flat');
  });

  it('a store with no data anywhere returns nulls, not throws', () => {
    const [row] = computeFobReferenceTable({ qsrFobRows: [] }, '9999', asOf);
    expect(row.metrics.compWastePct.mtd).toBeNull();
    expect(row.metrics.salesProjection.mtd).toBeNull();
    expect(row.metrics.compWastePct.trend).toBe('flat');
  });
});
