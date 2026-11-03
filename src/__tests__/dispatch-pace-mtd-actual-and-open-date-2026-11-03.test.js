// @vitest-environment happy-dom
// @ts-nocheck
// Owner-reported 2026-11-03, "🎯 Actuals vs Target" panel (CurrentMonthPaceSection, analytics.js):
//
// 1. MTD Actual was reading Net Sales, not Product Sales. The emailed sales_ledger leg
//    (all_net_sales) had the HIGHEST priority in the MTD-actual sourcing, ahead of
//    DAR/qsrActSummary's real product_sales-derived leg -- a 2026-10-06 "close enough" call
//    (~1% off) that is wrong for a panel comparing against a Product-Sales target (tProdSales).
//    Fixed by swapping the priority so the real product-sales leg wins when both cover a day.
// 2. New-store 44689 (Lindsay-standalone) showed up with a real sales target on the October
//    pace view, weeks before its planned November open. Fixed via settings.storeOpenDates +
//    isStoreNotYetOpenOn (constants.js) -- see dispatch-store-open-date-2026-11-03.test.js for
//    the pure-function coverage; this file covers the wiring into the rendered panel.
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

describe('CurrentMonthPaceSection — MTD Actual sources Product Sales, not Net Sales', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); loadSalesLedgerMock.mockClear(); loadQsrActSummaryMock.mockClear(); });

  it('when both legs cover the same day, the real product-sales leg (qsrActSummaryRows) wins over the net-sales leg (salesLedgerRows)', async () => {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    const ds = {
      // Net sales, ~1% above true product sales -- same relationship the 2026-10-06 fix measured.
      salesLedgerRows: [{ loc: A, date: new Date('2026-08-01T00:00:00'), sales: 10100 }],
      // Real product sales for the same (loc, date).
      qsrActSummaryRows: [{ loc: A, date: new Date('2026-08-01T00:00:00'), sales: 10000 }],
    };
    await act(async () => {
      root.render(React.createElement(CurrentMonthPaceSection, { ds, stores: STORES, settings: {}, mt: MT, locs: [A], period: { year: 2026, month: 8 } }));
      await Promise.resolve(); await Promise.resolve();
    });
    // Must show the product-sales figure (10,000), never the net-sales one (10,100).
    expect(container.textContent).toMatch(/\$10,000/);
    expect(container.textContent).not.toMatch(/\$10,100/);
  });

  it('still falls back to salesLedgerRows (net sales) for a day qsrActSummaryRows has no coverage for', async () => {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    const ds = {
      salesLedgerRows: [{ loc: A, date: new Date('2026-08-01T00:00:00'), sales: 25000 }],
      qsrActSummaryRows: [],
    };
    await act(async () => {
      root.render(React.createElement(CurrentMonthPaceSection, { ds, stores: STORES, settings: {}, mt: MT, locs: [A], period: { year: 2026, month: 8 } }));
      await Promise.resolve(); await Promise.resolve();
    });
    expect(container.textContent).toMatch(/\$25,000/);
  });
});

describe('CurrentMonthPaceSection — a not-yet-open store drops out of a pre-open month\'s roster', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); loadSalesLedgerMock.mockClear(); loadQsrActSummaryMock.mockClear(); });

  const NEW = '44689';
  const STORES2 = [{ loc: A, name: 'Ardmore-Broadway' }, { loc: NEW, name: 'Lindsay' }];
  const MT2 = { [A]: { tProdSales: 300000 }, [NEW]: { tProdSales: 160000 } };
  const settingsWithOpenDate = { storeOpenDates: { [NEW]: '2026-11-14' } };

  it('excludes the new store from October (before its open date) even though it has a real target', async () => {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    const ds = { salesLedgerRows: [{ loc: A, date: new Date('2026-10-01T00:00:00'), sales: 10000 }], qsrActSummaryRows: [] };
    await act(async () => {
      root.render(React.createElement(CurrentMonthPaceSection, { ds, stores: STORES2, settings: settingsWithOpenDate, mt: MT2, locs: [A, NEW], period: { year: 2026, month: 10 } }));
      await Promise.resolve(); await Promise.resolve();
    });
    expect(container.textContent).not.toMatch(/Lindsay/);
    expect(container.textContent).not.toMatch(/160,000/);
  });

  it('includes the new store once the viewed month reaches its open date', async () => {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    const ds = { salesLedgerRows: [{ loc: NEW, date: new Date('2026-11-01T00:00:00'), sales: 5000 }], qsrActSummaryRows: [] };
    await act(async () => {
      root.render(React.createElement(CurrentMonthPaceSection, { ds, stores: STORES2, settings: settingsWithOpenDate, mt: MT2, locs: [A, NEW], period: { year: 2026, month: 11 } }));
      await Promise.resolve(); await Promise.resolve();
    });
    expect(container.textContent).toMatch(/Lindsay/);
  });

  it('with no storeOpenDates set at all, behavior is unchanged (every store with a target shows)', async () => {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    const ds = { salesLedgerRows: [{ loc: A, date: new Date('2026-10-01T00:00:00'), sales: 10000 }], qsrActSummaryRows: [] };
    await act(async () => {
      root.render(React.createElement(CurrentMonthPaceSection, { ds, stores: STORES2, settings: {}, mt: MT2, locs: [A, NEW], period: { year: 2026, month: 10 } }));
      await Promise.resolve(); await Promise.resolve();
    });
    expect(container.textContent).toMatch(/Lindsay/);
  });
});
