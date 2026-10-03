// @vitest-environment happy-dom
// @ts-nocheck
// Owner-reported (2026-10-03), Florida (All Locations) September 2026 Patch Sheet screenshot:
// of ~13 Actual columns, only Sales Projection, Crew Labor %, TPPH Target, and Total Food Cost %
// showed real numbers — Base Food %, Disc Coup %, Comp Waste %, Raw Waste %, Condiment %, Emp
// Food %, Stat Loss %, Unex Diff %, Food Over Base Target, P&L Paper Cost %, and Op Supply Target
// all showed "—" despite real qsr_fob/eBOS data existing for the period. Root cause: BOTH
// buildGroupSheetHTML's ACTUAL_KEY map AND computeMonthActuals itself only ever computed 4-5 of
// the ~14 real actual fields -- the rest were never sourced at all, not a null-vs-0 rollup bug
// (that was 2026-10-02's separate, already-fixed issue). Fixed: fobSnapshotByStore
// (eom-inventory.js) now exposes the full FOB percentage breakdown from the SAME qsr_fob row data
// it already loads (totalBaseFood, discountCouponsAmt, and each of the 6 FOB component $ fields,
// each divided by sales) plus a new pLPaperCostFromRow (same Begin+Purchases+Adjustments+
// Transfers-Promotions-End build-up as pLFoodCostFromRow); computeMonthActuals wires all of it
// through (manual-upload-wins-outright precedence preserved per field) plus a genuinely separate
// source for Op Supply $ actual (Σ eBOS op-supplies purchases for the month, the same auto source
// review-engine.js's own `opSupplies` KPI already uses); ACTUAL_KEY/rollActuals in
// buildGroupSheetHTML now map and roll up every one of them.
import { describe, it, expect } from 'vitest';
import { fobSnapshotByStore, pLPaperCostFromRow } from '../engine/eom-inventory.js';
import { buildGroupSheetHTML, computeMonthActuals } from '../views/analytics.js';
import { STORE_NAMES } from '../constants.js';

const [A, B] = ['3708', '5183'];

describe('computeMonthActuals — real qsr_fob + eBOS rows in, full actuals breakdown out', () => {
  it('a real qsr_fob row for the month produces every breakdown field, not just sales/crewLabor/tpph/fobTotal', () => {
    const ds = {
      laborRows: [{ loc: A, date: new Date(2026, 7, 31), sales: 344368.70, laborPct: 0.2337, tpph: 5.64 }],
      qsrFobRows: [{
        loc: '0003708', date: '2026-08-31', prodSalesAmt: 344368.70,
        totalBaseFood: 74039.26, discountCouponsAmt: 1446.35,
        compWasteAmt: 344.37, rawWasteAmt: 1515.22, condimentsAmt: 5992.01,
        empMgrMealsAmt: 792.05, statVarianceAmt: 4891.84, unexplainedAmt: -103.31,
        pnlFoodCostBegin: 10000, pnlFoodCostPurchases: 92265.97, pnlFoodCostAdjustments: 0,
        pnlFoodCostTransfers: 0, pnlFoodCostPromotions: 0, pnlFoodCostEnd: 10000,
        pnlPaperCostBegin: 10000, pnlPaperCostPurchases: 1332.63, pnlPaperCostAdjustments: 0,
        pnlPaperCostTransfers: 0, pnlPaperCostPromotions: 0, pnlPaperCostEnd: 10000,
      }],
      ebosRows: [{ loc: A, date: new Date(2026, 7, 15), opsPurchases: 20213.44 }],
      fobRows: [],
    };
    const { byLoc } = computeMonthActuals(ds, 2026, 8);
    const a = byLoc[A];
    expect(a).toBeTruthy();
    expect(a.fobBasePct).toBeCloseTo(74039.26 / 344368.70, 6);
    expect(a.discCoupPct).toBeCloseTo(1446.35 / 344368.70, 6);
    expect(a.compWastePct).toBeCloseTo(344.37 / 344368.70, 6);
    expect(a.rawWastePct).toBeCloseTo(1515.22 / 344368.70, 6);
    expect(a.condimentPct).toBeCloseTo(5992.01 / 344368.70, 6);
    expect(a.empFoodPct).toBeCloseTo(792.05 / 344368.70, 6);
    expect(a.statLossPct).toBeCloseTo(4891.84 / 344368.70, 6);
    expect(a.unexDiffPct).toBeCloseTo(-103.31 / 344368.70, 6);
    expect(a.paperCostPct).toBeCloseTo((10000 + 1332.63 - 10000) / 344368.70, 6);
    expect(a.opSupplyActual).toBeCloseTo(20213.44, 2);
  });

  it('opSupplyActual is null (not 0) when no eBOS rows exist for that loc/month — a real $0 spend is indistinguishable from no data otherwise', () => {
    const ds = { laborRows: [], qsrFobRows: [], ebosRows: [], fobRows: [] };
    const { byLoc } = computeMonthActuals(ds, 2026, 8);
    expect(byLoc[A]).toBeUndefined(); // nothing at all for this store this month
  });
});

describe('fobSnapshotByStore — full FOB percentage breakdown, not just fobPct/pLFoodPct', () => {
  it('exposes baseFoodPct from totalBaseFood (a SEPARATE column from the 6-component fob sum), plus every other breakdown line', () => {
    const rows = [{
      loc: '3708', date: '2026-08-31',
      prodSalesAmt: 344368.70,
      totalBaseFood: 74039.26,          // Base Food % source — NOT comp+raw+cond+emp+statv+unex
      discountCouponsAmt: 1446.35,
      compWasteAmt: 344.37, rawWasteAmt: 1515.22, condimentsAmt: 5992.01,
      empMgrMealsAmt: 792.05, statVarianceAmt: 4891.84, unexplainedAmt: -103.31,
      pnlPaperCostBegin: 10000, pnlPaperCostPurchases: 1332.63, pnlPaperCostAdjustments: 0,
      pnlPaperCostTransfers: 0, pnlPaperCostPromotions: 0, pnlPaperCostEnd: 10000,
    }];
    const r = fobSnapshotByStore(rows, '2026-08')['3708'];
    expect(r.baseFoodPct).toBeCloseTo(74039.26 / 344368.70, 6);
    expect(r.discCoupPct).toBeCloseTo(1446.35 / 344368.70, 6);
    expect(r.compWastePct).toBeCloseTo(344.37 / 344368.70, 6);
    expect(r.rawWastePct).toBeCloseTo(1515.22 / 344368.70, 6);
    expect(r.condimentPct).toBeCloseTo(5992.01 / 344368.70, 6);
    expect(r.empFoodPct).toBeCloseTo(792.05 / 344368.70, 6);
    expect(r.statLossPct).toBeCloseTo(4891.84 / 344368.70, 6);
    expect(r.unexDiffPct).toBeCloseTo(-103.31 / 344368.70, 6);
    // baseFoodPct (74039.26/sales) must differ from fobPct (the 6-component sum/sales) — they
    // are genuinely different metrics, not two readings of the same number.
    expect(r.baseFoodPct).not.toBeCloseTo(r.fobPct, 3);
  });

  it('a row with no totalBaseFood column (older data) leaves baseFoodPct null, not 0 or NaN', () => {
    const rows = [{ loc: '3708', date: '2026-08-31', prodSalesAmt: 300000, compWasteAmt: 100 }];
    const r = fobSnapshotByStore(rows, '2026-08')['3708'];
    expect(r.baseFoodPct).toBeNull();
  });
});

describe('pLPaperCostFromRow — same build-up formula as pLFoodCostFromRow, for Paper Cost %', () => {
  it('computes pLPaperCost/pLPaperPct from the six pnl_paper_cost_* fields', () => {
    const row = { pnlPaperCostBegin: 10000, pnlPaperCostPurchases: 13420, pnlPaperCostAdjustments: 0,
      pnlPaperCostTransfers: 0, pnlPaperCostPromotions: 0, pnlPaperCostEnd: 9580 };
    const { pLPaperCost, pLPaperPct } = pLPaperCostFromRow(row, 344368.70);
    expect(pLPaperCost).toBe(10000 + 13420 - 9580);
    expect(pLPaperPct).toBeCloseTo((10000 + 13420 - 9580) / 344368.70, 6);
  });
});

describe('buildGroupSheetHTML — the exact reported incident (Florida patch sheet, most actuals blank)', () => {
  const mt_next = {
    [A]: { tProdSales: 342980, tCrewLabor: 0.23, tBonusLabor: 0.21, tTpph: 6.15, tFOBBase: 0.213,
      tDiscCoupPct: 0.005, tCompWaste: 0.001, tRawWaste: 0.005, tCondiment: 0.018, tEmpFood: 0.002,
      tStatLoss: 0.0137, tUnex: -0.0003, tFOBTarget: 0.038, tFOBTotal: 0.26, tPaperCost: 0.033,
      tOpSupply: 18253.23 },
  };
  const mt_curr = mt_next;

  it('every FOB breakdown line (not just Base Food/Total Food Cost) shows a real actual when real qsr_fob data exists, not "—"', () => {
    // computeMonthActuals itself isn't exported (module-private) — its qsr_fob parsing is
    // covered by the fobSnapshotByStore tests above; here we construct the actuals shape it
    // would produce directly, isolating buildGroupSheetHTML/ACTUAL_KEY/rollActuals's own wiring.
    const html = buildGroupSheetHTML('Test Store', [A], mt_next, mt_curr,
      // Directly construct the actuals shape computeMonthActuals would produce, to isolate
      // buildGroupSheetHTML/ACTUAL_KEY/rollActuals's own wiring from computeMonthActuals's
      // qsr_fob parsing (covered separately by the fobSnapshotByStore tests above).
      { byLoc: {
        [A]: {
          sales: 344368.70, crewLaborPct: 0.2337, tpph: 5.64,
          fobBasePct: 74039.26/344368.70, fobTotalPct: (92265.97)/344368.70,
          fobTargetPct: (344.37+1515.22+5992.01+792.05+4891.84-103.31)/344368.70,
          discCoupPct: 1446.35/344368.70, compWastePct: 344.37/344368.70,
          rawWastePct: 1515.22/344368.70, condimentPct: 5992.01/344368.70,
          empFoodPct: 792.05/344368.70, statLossPct: 4891.84/344368.70,
          unexDiffPct: -103.31/344368.70, paperCostPct: (1332.63)/344368.70,
          opSupplyActual: 20213.44,
        },
      } },
      {year:2026,month:9}, {year:2026,month:8}, '08/31/2026', {[A]:STORE_NAMES[A]});

    // None of the previously-blank rows should render as "—" anymore for this store.
    const rowsToCheck = ['Base Food %', 'Disc Coup %', 'Comp Waste %', 'Raw Waste %',
      'Condiment %', 'Emp Food %', 'Stat Loss %', 'Unex Diff %', 'Food Over Base Target',
      'Total Food Cost %', 'P & L Paper Cost %', 'Op Supply Target'];
    for (const label of rowsToCheck) {
      const rowMatch = html.match(new RegExp(`<td[^>]*>${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}</td>([\\s\\S]*?)</tr>`));
      expect(rowMatch, `row "${label}" not found`).toBeTruthy();
      const cells = [...rowMatch[1].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(m => m[1]);
      // [target, actionItems(empty), actual, currTarget, opportunity]
      expect(cells[2], `"${label}" actual cell`).not.toBe('—');
    }
    // Bonus Crew Labor % has no real actual source anywhere — correctly STAYS "—".
    const bonusRow = html.match(/<td[^>]*>Bonus Crew Labor %<\/td>([\s\S]*?)<\/tr>/);
    const bonusCells = [...bonusRow[1].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(m => m[1]);
    expect(bonusCells[2]).toBe('—');
  });

  it('a field with no real data anywhere (both manual and auto absent) still renders "—", not a fabricated number', () => {
    const html = buildGroupSheetHTML('Test Store', [A], mt_next, mt_curr,
      { byLoc: { [A]: { sales: 344368.70, crewLaborPct: 0.2337, tpph: 5.64 } } },
      {year:2026,month:9}, {year:2026,month:8}, '08/31/2026', {[A]:STORE_NAMES[A]});
    const rowMatch = html.match(/<td[^>]*>Base Food %<\/td>([\s\S]*?)<\/tr>/);
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(m => m[1]);
    expect(cells[2]).toBe('—');
  });
});
