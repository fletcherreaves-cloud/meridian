import { describe, it, expect } from 'vitest';
import { fobSnapshotByStore } from '../engine/eom-inventory.js';

// The FOB 30× guard: qsr_fob has ~30 daily rows per store, each a period-to-date snapshot. The
// period figure MUST be the latest row, never the sum (summing = 30× while FOB% survives).
describe('fobSnapshotByStore — latest snapshot, never a 30× sum', () => {
  it('returns the LATEST daily row, not the sum of the month', () => {
    // 30 daily rows, each carrying the SAME full-month snapshot ($13,252 FOB on $307,503 sales).
    const rows = [];
    for (let d = 1; d <= 30; d++) {
      rows.push({ loc: '3708', date: `2026-07-${String(d).padStart(2, '0')}`,
        prodSalesAmt: 307503, condimentsAmt: 6477, statVarianceAmt: 4324, compWasteAmt: 945,
        rawWasteAmt: 879, empMgrMealsAmt: 650, unexplainedAmt: -23 });
    }
    const r = fobSnapshotByStore(rows, '2026-07')['3708'];
    // Latest snapshot ≈ $13,252 (one row), NOT 30× ($397k).
    expect(Math.round(r.fob)).toBe(13252);
    expect(Math.round(r.sales)).toBe(307503);
    expect(r.fobPct).toBeCloseTo(0.0431, 3);
    expect(r.asOf).toBe('2026-07-30');
  });
  it('picks the newest date even when rows are out of order + ignores other periods', () => {
    const rows = [
      { loc: '5183', date: '2026-07-15', prodSalesAmt: 200000, condimentsAmt: 5000 },
      { loc: '5183', date: '2026-07-29', prodSalesAmt: 430762, condimentsAmt: 9056 }, // newest in-period
      { loc: '5183', date: '2026-06-30', prodSalesAmt: 999999, condimentsAmt: 9999 }, // other month — ignored
    ];
    const r = fobSnapshotByStore(rows, '2026-07')['5183'];
    expect(Math.round(r.sales)).toBe(430762);
    expect(Math.round(r.fob)).toBe(9056);
  });

  // pLFoodPct (Total P&L Food Cost %, EOM Supervisor's "Total Food Cost" — 2026-08-03 #52) is a
  // DIFFERENT, broader metric than FOB (Food Over Base) above — Begin+Purchases+Adjustments+
  // Transfers-Promotions-End, the same build-up analytics.js's fobAuto/fobAgg already use.
  it('pLFoodPct uses the Begin+Purchases+Adjustments+Transfers-Promotions-End build-up, latest snapshot only', () => {
    const rows = [
      { loc: '3708', date: '2026-07-15', prodSalesAmt: 150000,
        pnlFoodCostBegin: 10000, pnlFoodCostPurchases: 5000, pnlFoodCostAdjustments: 100,
        pnlFoodCostTransfers: 50, pnlFoodCostPromotions: 200, pnlFoodCostEnd: 8000 },
      { loc: '3708', date: '2026-07-31', prodSalesAmt: 307503,
        pnlFoodCostBegin: 10000, pnlFoodCostPurchases: 84252, pnlFoodCostAdjustments: 0,
        pnlFoodCostTransfers: 0, pnlFoodCostPromotions: 0, pnlFoodCostEnd: 10000 }, // latest → 84252/307503
    ];
    const r = fobSnapshotByStore(rows, '2026-07')['3708'];
    expect(r.pLFoodCost).toBe(84252);
    expect(r.pLFoodPct).toBeCloseTo(84252 / 307503, 6);
  });
});
