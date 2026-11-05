// @vitest-environment happy-dom
// @ts-nocheck
// Owner-reported live (2026-11-05): the Monthly Projections page's own month dropdown said
// "Oct 2026" while the "🎯 Actuals vs Target" widget beneath it said "November 2026" -- two
// different pace-tracking numbers on the SAME page, for two different months, with no visible
// explanation. Root cause: CurrentMonthPaceSection (analytics.js) renders its own independent
// ‹ monthLbl › stepper (local `offset` state) alongside the page-level period dropdown that sets
// its `period` PROP -- a prior click on THIS widget's own stepper left `offset` non-zero, and
// that offset then kept compounding additively with `base` (period = base + offset) on every
// later page-dropdown change instead of resetting, so the widget silently drifted to a different
// month than the rest of the page. "Changing the dropdown seems to resolve it" (owner's own
// words) was a coincidence of the exact click sequence, not guaranteed behavior -- this test
// proves the fix makes it guaranteed: the page-level period prop is now the ground truth this
// widget's stepper always resyncs to the moment that prop's value actually changes.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadSalesLedger: async () => [], loadQsrActSummary: async () => [], loadMonthlyTargets: async () => ({}) };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { CurrentMonthPaceSection } = await import('../views/analytics.js');

const A = '3708';
const STORES = [{ loc: A, name: 'Ardmore-Broadway' }];
const mtFor = (year, month) => ({ [A]: { tProdSales: 300000, _year: year, _month: month } });
const ds = { salesLedgerRows: [{ loc: A, date: new Date('2026-10-05T00:00:00'), sales: 10000 }], qsrActSummaryRows: [] };

describe('CurrentMonthPaceSection — stepper no longer drifts from the page-level period prop (2026-11-05)', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });

  it('a prior ‹/› click resets back to the page dropdown\'s month, not an additive offset from it', async () => {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(CurrentMonthPaceSection, {
        ds, stores: STORES, settings: {}, mt: mtFor(2026, 10), locs: [A], period: { year: 2026, month: 10 },
      }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain('October 2026');

    // Click this widget's OWN "next month" stepper -- a separate control from the page's
    // dropdown. offset becomes 1; base(Oct) + 1 = November.
    const nextBtn = [...container.querySelectorAll('button')].find(b => b.title === 'Next month');
    expect(nextBtn, 'next-month stepper button not found').toBeTruthy();
    await act(async () => { nextBtn.click(); });
    expect(container.textContent).toContain('November 2026');

    // The page-level dropdown now moves to September (a real, different month -- same
    // component instance, new `period` prop, exactly what happens when the parent's own
    // <select> changes). Before the fix: period = new base(Sep) + stale offset(1) = October --
    // the widget would show a month the page dropdown was never set to. After the fix: offset
    // resets to 0 the moment the prop's value changes, so period = base exactly = September.
    await act(async () => {
      root.render(React.createElement(CurrentMonthPaceSection, {
        ds, stores: STORES, settings: {}, mt: mtFor(2026, 9), locs: [A], period: { year: 2026, month: 9 },
      }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain('September 2026');
    expect(container.textContent).not.toContain('October 2026');
  });
});
