// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch 2026-10-09 — Shift Manager Store Report.
//
// Owner, after the Shift Manager review attribution landed (PR #1411/#1412): "I would like to
// be able to pull this as a report separately" + "all managers per location are on one page."
// buildShiftManagerStoreReportHtml() is a standalone printable report builder, reading straight
// from ds.shiftManagerRows (the same source NewReviewForm's manager dropdown already uses) --
// no dependency on any formal Review record existing. One page per store, one card per manager,
// transaction-weighted across the selected month range (same weighting basis the Shift Manager
// pull itself uses to combine days into a month -- this just extends it across months).
import { describe, it, expect, vi } from 'vitest';
import { buildShiftManagerStoreReportHtml, ShiftManagerReportForm } from '../views/performance-reviews.js';

const stores = [{ loc: '3708' }, { loc: '5985' }];

function row(overrides) {
  return {
    loc: '3708', month: '2026-04', geid: 100, name: 'Jane Smith',
    transactions: 100, oepe: 150, oepeNoPark: 130, kvs: 40, r2p: 100, healthyUsePct: 0.5,
    ...overrides,
  };
}

describe('buildShiftManagerStoreReportHtml', () => {
  it('transaction-weights a manager\'s metrics across multiple months in range', () => {
    const ds = {
      shiftManagerRows: [
        row({ month: '2026-04', transactions: 100, oepe: 100 }),
        row({ month: '2026-05', transactions: 300, oepe: 300 }),
      ],
      targets: {}, allMonthlyTargets: {}, monthlyTargets: {},
    };
    const html = buildShiftManagerStoreReportHtml(ds, stores, { locs: ['3708'], startMonth: '2026-04', endMonth: '2026-05' });
    // weighted avg = (100*100 + 300*300) / (100+300) = 100000/400 = 250
    expect(html).toContain('250s');
    expect(html).toContain('Jane Smith');
  });

  it('a month OUTSIDE the requested range is excluded from the average', () => {
    const ds = {
      shiftManagerRows: [
        row({ month: '2026-04', transactions: 100, oepe: 100 }),
        row({ month: '2026-09', transactions: 999, oepe: 999 }), // out of range, must not pull the average toward it
      ],
      targets: {}, allMonthlyTargets: {}, monthlyTargets: {},
    };
    const html = buildShiftManagerStoreReportHtml(ds, stores, { locs: ['3708'], startMonth: '2026-04', endMonth: '2026-04' });
    expect(html).toContain('100s');
    expect(html).not.toContain('999s');
  });

  it('every store with data in range gets its own page (page-break-after except the last)', () => {
    const ds = {
      shiftManagerRows: [
        row({ loc: '3708', month: '2026-04', name: 'Store A Manager' }),
        row({ loc: '5985', geid: 200, month: '2026-04', name: 'Store B Manager' }),
      ],
      targets: {}, allMonthlyTargets: {}, monthlyTargets: {},
    };
    const html = buildShiftManagerStoreReportHtml(ds, stores, { locs: null, startMonth: '2026-04', endMonth: '2026-04' });
    expect(html).toContain('Store A Manager');
    expect(html).toContain('Store B Manager');
    const pageBreaks = html.match(/page-break-after:always/g) || [];
    // 2 stores -> exactly 1 internal break (the last page never gets one)
    expect(pageBreaks.length).toBe(1);
  });

  it('a store with zero managers in range still gets a page, with an explicit empty state (not a blank page)', () => {
    const ds = { shiftManagerRows: [], targets: {}, allMonthlyTargets: {}, monthlyTargets: {} };
    const html = buildShiftManagerStoreReportHtml(ds, stores, { locs: ['3708'], startMonth: '2026-04', endMonth: '2026-04' });
    expect(html).toContain('No shift-manager data for this store in this period.');
  });

  it('zero stores matched at all (no explicit store requested, nothing anywhere in range) renders an explicit top-level empty state, never a silently blank body -- found live: generating "All Stores" with no data loaded produced an empty <body>', () => {
    const ds = { shiftManagerRows: [], targets: {}, allMonthlyTargets: {}, monthlyTargets: {} };
    const html = buildShiftManagerStoreReportHtml(ds, stores, { locs: null, startMonth: '2026-04', endMonth: '2026-04' });
    expect(html).toContain('No shift-manager data found for any store in this period.');
    expect(html.match(/<body>\s*<\/body>/)).toBeNull();
  });

  it('a manager missing from one month (e.g. hired mid-range) is still weighted only over the months they actually have', () => {
    const ds = {
      shiftManagerRows: [
        row({ month: '2026-04', transactions: 200, oepe: 200 }),
        // geid 100 has no May row at all -- must not be treated as oepe:0
      ],
      targets: {}, allMonthlyTargets: {}, monthlyTargets: {},
    };
    const html = buildShiftManagerStoreReportHtml(ds, stores, { locs: ['3708'], startMonth: '2026-04', endMonth: '2026-05' });
    expect(html).toContain('200s'); // not dragged toward 0 by a missing month
  });

  it('Healthy Usage is always labeled reference-only, never given a Met/Missed verdict', () => {
    const ds = {
      shiftManagerRows: [row({ healthyUsePct: 0.9 })],
      targets: {}, allMonthlyTargets: {}, monthlyTargets: {},
    };
    const html = buildShiftManagerStoreReportHtml(ds, stores, { locs: ['3708'], startMonth: '2026-04', endMonth: '2026-04' });
    expect(html).toContain('90%');
    expect(html).toContain('reference only — not scored');
  });

  it('respects the stores array\'s own order when multiple stores are included', () => {
    const orderedStores = [{ loc: '5985' }, { loc: '3708' }]; // 5985 listed first
    const ds = {
      shiftManagerRows: [
        row({ loc: '3708', month: '2026-04', name: 'Alice Anderson' }),
        row({ loc: '5985', geid: 200, month: '2026-04', name: 'Bob Barnes' }),
      ],
      targets: {}, allMonthlyTargets: {}, monthlyTargets: {},
    };
    const html = buildShiftManagerStoreReportHtml(ds, orderedStores, { locs: null, startMonth: '2026-04', endMonth: '2026-04' });
    expect(html.indexOf('Bob Barnes')).toBeLessThan(html.indexOf('Alice Anderson'));
  });
});

describe('buildShiftManagerStoreReportHtml geid filter (owner, 2026-10-09: "populate shift managers from data we already pull")', () => {
  it('narrows the report to one manager when geid is given, from the same live shiftManagerRows -- no other manager appears', () => {
    const ds = {
      shiftManagerRows: [
        row({ geid: 100, name: 'Jane Smith' }),
        row({ geid: 200, name: 'Other Manager' }),
      ],
      targets: {}, allMonthlyTargets: {}, monthlyTargets: {},
    };
    const html = buildShiftManagerStoreReportHtml(ds, stores, { locs: null, geid: 100, startMonth: '2026-04', endMonth: '2026-04' });
    expect(html).toContain('Jane Smith');
    expect(html).not.toContain('Other Manager');
  });

  it('a geid with zero matching rows in range falls through to the top-level empty state', () => {
    const ds = { shiftManagerRows: [row({ geid: 100, name: 'Jane Smith' })], targets: {}, allMonthlyTargets: {}, monthlyTargets: {} };
    const html = buildShiftManagerStoreReportHtml(ds, stores, { locs: null, geid: 999, startMonth: '2026-04', endMonth: '2026-04' });
    expect(html).not.toContain('Jane Smith');
    expect(html).toContain('No shift-manager data found for any store in this period.');
  });
});

describe('ShiftManagerReportForm', () => {
  it('Generate Report calls printHtml with a built report for the selected store/range', async () => {
    vi.resetModules();
    const printHtmlMock = vi.fn();
    vi.doMock('../utils/print-html.js', () => ({ printHtml: printHtmlMock }));
    const React = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const { ShiftManagerReportForm: Form } = await import('../views/performance-reviews.js');

    const ds = { shiftManagerRows: [row()], targets: {}, allMonthlyTargets: {}, monthlyTargets: {} };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(React.createElement(Form, { stores, ds, onClose: () => {} })); });

    const generateBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Generate Report'));
    expect(generateBtn).toBeTruthy();
    act(() => { generateBtn.click(); });

    expect(printHtmlMock).toHaveBeenCalledTimes(1);
    expect(printHtmlMock.mock.calls[0][0]).toContain('Jane Smith');

    act(() => { root.unmount(); });
    container.remove();
    vi.doUnmock('../utils/print-html.js');
  });

  it('the Manager dropdown is populated from ds.shiftManagerRows and narrows to the selected store', async () => {
    vi.resetModules();
    const React = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const { ShiftManagerReportForm: Form } = await import('../views/performance-reviews.js');

    const ds = {
      shiftManagerRows: [
        row({ loc: '3708', geid: 100, name: 'Jane Smith' }),
        row({ loc: '5985', geid: 200, name: 'Other Manager' }),
      ],
      targets: {}, allMonthlyTargets: {}, monthlyTargets: {},
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(React.createElement(Form, { stores, ds, onClose: () => {} })); });

    const selects = [...container.querySelectorAll('select')];
    const storeSel = selects.find(s => [...s.options].some(o => o.text.includes('All Stores')));
    const mgrSel = selects.find(s => [...s.options].some(o => o.text.includes('everyone')));
    expect([...mgrSel.options].map(o => o.text)).toEqual(['— everyone —', 'Jane Smith', 'Other Manager']);

    // Narrow to store 3708 -- only Jane Smith should remain selectable.
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      nativeSetter.call(storeSel, '3708');
      storeSel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const mgrSel2 = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.text.includes('everyone')));
    expect([...mgrSel2.options].map(o => o.text)).toEqual(['— everyone —', 'Jane Smith']);

    act(() => { root.unmount(); });
    container.remove();
  });
});
