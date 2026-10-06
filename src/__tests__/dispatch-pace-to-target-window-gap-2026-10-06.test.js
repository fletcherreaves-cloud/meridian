// @vitest-environment happy-dom
// @ts-nocheck
// Owner-reported (2026-10-06), Pace to Target screenshot: August 2026 showed every single store
// uniformly ~20-25% below target (District pace -24.91%), "as of Aug 31 · day 31 of 31". Verified
// against a real August Operations Report (attached): true district Product Sales $8,761,530 vs
// the panel's own $6,978,621 -- a genuine ~20% understatement, not real underperformance.
//
// Two compounding, independent bugs in CurrentMonthPaceSection (analytics.js):
//
// 1. The salesLedgerRows leg read r.prodSales, a field loadSalesLedger() (lib/supabase.js) never
//    actually sets -- it only sets .sales/.allNetSales from sales_ledger_daily's all_net_sales
//    column (confirmed live: that table has no separate "product sales" column at all). So this
//    entire priority-3 leg was silently a no-op for every row, every month, always.
// 2. ds.salesLedgerRows/qsrActSummaryRows are both loaded with a fixed 60-day trailing window
//    from TODAY (App.js's loadSalesLedger(60)/_stQsrsoftActSummary(60)) -- stepping back further
//    than that via the month stepper silently clips the viewed month's early days out of the
//    merged aggregate, while the header still shows "day 31 of 31" (the max date seen ANYWHERE
//    in the merged set, not per-store/per-day coverage). qsr_daily_activity_rollup itself was
//    confirmed complete and accurate for August (31/31 days, district total within $626 of the
//    real Operations Report) -- the data was never missing, only not loaded into this
//    component's fixed window.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const loadSalesLedgerMock = vi.fn(async () => []);
const loadQsrActSummaryMock = vi.fn(async () => []);
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadSalesLedger: (...args) => loadSalesLedgerMock(...args), loadQsrActSummary: (...args) => loadQsrActSummaryMock(...args) };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { CurrentMonthPaceSection } = await import('../views/analytics.js');

const A = '3708';
const STORES = [{ loc: A, name: 'Ardmore-Broadway' }];
const MT = { [A]: { tProdSales: 300000 } };

describe('CurrentMonthPaceSection — salesLedgerRows field-name fix', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); loadSalesLedgerMock.mockClear(); loadQsrActSummaryMock.mockClear(); });

  it('sums real sales from salesLedgerRows\' own .sales field (not the nonexistent .prodSales) when it alone covers the month', async () => {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    const ds = {
      salesLedgerRows: [
        { loc: A, date: new Date('2026-08-01T00:00:00'), sales: 10000 },
        { loc: A, date: new Date('2026-08-02T00:00:00'), sales: 11000 },
        { loc: A, date: new Date('2026-08-03T00:00:00'), sales: 12000 },
      ],
      qsrActSummaryRows: [],
    };
    await act(async () => {
      root.render(React.createElement(CurrentMonthPaceSection, { ds, stores: STORES, settings: {}, mt: MT, locs: [A], period: { year: 2026, month: 8 } }));
      await Promise.resolve(); await Promise.resolve();
    });
    // 10000+11000+12000 = 33000 -- would be $0/missing entirely under the old r.prodSales bug.
    expect(container.textContent).toMatch(/\$33,000/);
  });
});

describe('CurrentMonthPaceSection — on-demand fetch for a month outside the loaded 60-day window', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); loadSalesLedgerMock.mockClear(); loadQsrActSummaryMock.mockClear(); });

  it('fetches the viewed month directly when ds only covers recent (non-August) dates, and renders the fetched totals', async () => {
    loadSalesLedgerMock.mockResolvedValueOnce([]);
    loadQsrActSummaryMock.mockResolvedValueOnce([
      { loc: A, date: new Date('2026-08-01T00:00:00'), sales: 300000 },
    ]);
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    const ds = {
      // Only recent (September) coverage -- nothing reaching back to August 1st.
      salesLedgerRows: [{ loc: A, date: new Date('2026-09-28T00:00:00'), sales: 9000 }],
      qsrActSummaryRows: [{ loc: A, date: new Date('2026-09-28T00:00:00'), sales: 9000 }],
    };
    await act(async () => {
      root.render(React.createElement(CurrentMonthPaceSection, { ds, stores: STORES, settings: {}, mt: MT, locs: [A], period: { year: 2026, month: 8 } }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    expect(loadSalesLedgerMock).toHaveBeenCalled();
    expect(loadQsrActSummaryMock).toHaveBeenCalled();
    expect(container.textContent).toMatch(/\$300,000/);
  });

  it('does NOT fetch when ds already covers the viewed month\'s start (fast path, no unnecessary network call)', async () => {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    const ds = {
      salesLedgerRows: [{ loc: A, date: new Date('2026-08-01T00:00:00'), sales: 50000 }],
      qsrActSummaryRows: [],
    };
    await act(async () => {
      root.render(React.createElement(CurrentMonthPaceSection, { ds, stores: STORES, settings: {}, mt: MT, locs: [A], period: { year: 2026, month: 8 } }));
      await Promise.resolve(); await Promise.resolve();
    });
    expect(loadSalesLedgerMock).not.toHaveBeenCalled();
    expect(loadQsrActSummaryMock).not.toHaveBeenCalled();
  });
});
