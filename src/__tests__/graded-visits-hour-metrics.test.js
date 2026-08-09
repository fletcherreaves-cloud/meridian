import { describe, it, expect } from 'vitest';
import { hourMetrics, MIN_LY_TXN_FOR_COMP, MIN_LY_SALES_FOR_COMP } from '../views/graded-visits.js';

// v4.930 — measured floor (memory/plan-data-integrity-sweep.md, "session part 2"): a single-digit
// ly_transactions/ly_product_sales produces a near-meaningless hourly comp% (IQR 1000 at count=1,
// stabilizing to ~23-24 only at count>=40 txns / >=$800 sales). Below the floor the cell shows "—"
// instead of a wild swing.
describe('hourMetrics — LY comp% floor', () => {
  const base = {
    hour_slot: '13', dt_untilserve: 0, dt_trans_cnt: 0, fc_untilserve: 0, fc_untilclosedrawer: 0,
    fc_trans_cnt: 0, mfy1_untilserve: 0, mfy1_trans_cnt: 0, mfy2_untilserve: 0, mfy2_trans_cnt: 0,
    bev_untilserve: 0, bev_trans_cnt: 0, healthy_count: 0, unhealthy_count: 0, dt_carsheld: 0,
    prod_sales_scrubbed: 0, actual_punched_dollars: 0,
  };

  it('suppresses stwGcCompPct below the measured transaction floor', () => {
    const below = hourMetrics({ ...base, transactions: 3, ly_transactions: MIN_LY_TXN_FOR_COMP - 1 }, null);
    expect(below.stwGcCompPct).toBeNull();
    expect(below.stwGc).toBe(3); // the raw count itself still shows — only the comp% is suppressed
  });

  it('computes stwGcCompPct at and above the floor', () => {
    const at = hourMetrics({ ...base, transactions: 44, ly_transactions: MIN_LY_TXN_FOR_COMP }, null);
    expect(at.stwGcCompPct).toBeCloseTo(10, 5); // (44-40)/40*100
  });

  it('suppresses prodSalesCompPct below the measured sales floor', () => {
    const below = hourMetrics({ ...base, product_sales: 500, ly_product_sales: MIN_LY_SALES_FOR_COMP - 1 }, null);
    expect(below.prodSalesCompPct).toBeNull();
    expect(below.prodSales).toBe(500);
  });

  it('computes prodSalesCompPct at and above the sales floor', () => {
    const at = hourMetrics({ ...base, product_sales: 880, ly_product_sales: MIN_LY_SALES_FOR_COMP }, null);
    expect(at.prodSalesCompPct).toBeCloseTo(10, 5); // (880-800)/800*100
  });

  it('a zero LY denominator (no LY data at all) still shows "—", not a false 0%', () => {
    const noLy = hourMetrics({ ...base, transactions: 5, ly_transactions: 0, product_sales: 100, ly_product_sales: 0 }, null);
    expect(noLy.stwGcCompPct).toBeNull();
    expect(noLy.prodSalesCompPct).toBeNull();
  });
});
