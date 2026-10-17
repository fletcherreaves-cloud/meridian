// @vitest-environment happy-dom
// @ts-nocheck
// 2026-10-17, owner: "And, yes, build it" -- renders the REAL FobReferenceTablePanel, built on
// the REAL ReportShell + the REAL engine/fob-reference.js computation.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { FobReferenceTablePanel } from '../views/fob-reference-table.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORES = [{ loc: '3708' }];

function buildDs() {
  const qsrFobRows = [];
  const laborRows = [];
  const opsLaborRows = [];
  const ebosRows = [];
  for (let day = 1; day <= 30; day++) {
    const iso = `2026-09-${String(day).padStart(2, '0')}`;
    qsrFobRows.push({
      loc: '0003708', date: iso, prodSalesAmt: 10000 * day, compWasteAmt: 150 * day,
      rawWasteAmt: 100 * day, condimentsAmt: 80 * day, empMgrMealsAmt: 40 * day,
      statVarianceAmt: 60 * day, unexplainedAmt: 10 * day, discountCouponsAmt: 120 * day,
      totalBaseFood: 4000 * day, pnlFoodCostPurchases: 2800 * day, pnlPaperCostPurchases: 350 * day,
    });
    const d = new Date(iso + 'T00:00:00');
    laborRows.push({ loc: '3708', date: d, sales: 10000, gc: 1000, tpph: 5.5 });
    opsLaborRows.push({ loc: '3708', date: d, laborDollar: 2100 });
    ebosRows.push({ loc: '3708', date: d, opsPurchases: 80 });
  }
  return { qsrFobRows, laborRows, opsLaborRows, ebosRows, storeIds: ['3708'] };
}

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(FobReferenceTablePanel, props)); });
  return { container, root };
}

describe('FobReferenceTablePanel', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  it('shows the pre-run empty state before Run Report is clicked', async () => {
    ({ container, root } = await mount({ ds: {}, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('Choose a date range and location, then Run Report.');
  });

  it('Run Report computes and renders real store rows for the default metric (Sales Projection)', async () => {
    ({ container, root } = await mount({ ds: buildDs(), stores: STORES, onClose: () => {} }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(container.querySelector('table')).toBeTruthy();
    expect(container.textContent).toContain('Ardmore-Broadway');
    // 30-day September window, 30 days * $10,000/day sales = $300,000 (LM/L3M both land here --
    // L3M's other two months are empty, and MTD is "—" since the fixture has no October rows).
    expect(container.textContent).toMatch(/\$300,000/);
  });

  it('switching the metric dropdown re-renders the table for a different FOB-leg metric', async () => {
    ({ container, root } = await mount({ ds: buildDs(), stores: STORES, onClose: () => {} }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    // ReportShell's own DateRangeControl/LocationSelector dropdowns render BEFORE this panel's
    // metric selector, so the first <select> in the DOM isn't ours — find it by its options.
    const select = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'compWastePct'));
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    await act(async () => {
      setValue.call(select, 'compWastePct');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    // Every reconstructed day has compWaste/sales = 150/10000 = 1.5% exactly in every window.
    expect(container.textContent).toMatch(/1\.50%/);
  });

  it('after a run, CSV export fires with every metric for every store (long-format export)', async () => {
    let clicks = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };
    try {
      ({ container, root } = await mount({ ds: buildDs(), stores: STORES, onClose: () => {} }));
      const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
      await act(async () => { runBtn.click(); await Promise.resolve(); });

      const exportBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Export'));
      await act(async () => { exportBtn.click(); });
      const csvItem = [...container.querySelectorAll('button')].find(b => b.textContent.includes('CSV'));
      await act(async () => { csvItem.click(); });

      expect(clicks).toHaveLength(1);
      expect(clicks[0]).toMatch(/^FOBReferenceTable_/);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
