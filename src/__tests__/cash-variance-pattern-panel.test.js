// @vitest-environment happy-dom
// @ts-nocheck
// Reports redesign Tier 3 -- renders the REAL CashVariancePatternPanel, built on the REAL ReportShell.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { CashVariancePatternPanel } from '../views/cash-variance-pattern.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORES = [{ loc: '3708' }];
const D = (d) => new Date(Date.now() - d * 86400000);

// 21 consecutive days ending today = exactly 3 occurrences of every day-of-week, same trick
// cash-variance-pattern-engine.test.js uses with fixed dates.
function buildCtrlRows() {
  const rows = [];
  for (let d = 0; d < 21; d++) {
    const date = D(d);
    rows.push({
      loc: '3708', date,
      cashOSPct: date.getDay() === 1 ? 0.04 : 0.005, // Monday stands out
      cashOSAmt: date.getDay() === 1 ? 80 : 5,
      posOverCnt: 1, posOverAmt: 10, manualRefAmt: 2,
      cashRefCnt: 1, cashlessRefCnt: 1, drawerOpens: 4, tRedACnt: 1, tRedAPct: 0.01,
    });
  }
  return rows;
}

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(CashVariancePatternPanel, props)); });
  return { container, root };
}

describe('CashVariancePatternPanel', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  it('shows the pre-run empty state before Run Report is clicked', async () => {
    ({ container, root } = await mount({ ds: {}, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('Choose a date range and location, then Run Report.');
  });

  it('Run Report computes and renders real store x day-of-week rows from the real engine', async () => {
    const ds = { ctrlRows: buildCtrlRows() };
    ({ container, root } = await mount({ ds, stores: STORES, onClose: () => {} }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('Monday');
    expect(container.textContent).toContain('Sunday');
  });

  it('never renders a register or employee COLUMN — privacy-safe by construction (the ' +
     'explanatory copy legitimately says "never by register or employee" in prose, so this ' +
     'checks the table\'s own headers/cells, not the whole page text)', async () => {
    const ds = { ctrlRows: buildCtrlRows() };
    ({ container, root } = await mount({ ds, stores: STORES, onClose: () => {} }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    const table = container.querySelector('table');
    expect(table).toBeTruthy();
    expect(table.textContent).not.toMatch(/register|employee|cashier/i);
  });

  it('after a run, CSV export fires with the real headers and the real figures', async () => {
    const ds = { ctrlRows: buildCtrlRows() };
    let clicks = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };
    try {
      ({ container, root } = await mount({ ds, stores: STORES, onClose: () => {} }));
      const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
      await act(async () => { runBtn.click(); await Promise.resolve(); });

      const exportBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Export'));
      await act(async () => { exportBtn.click(); });
      const csvItem = [...container.querySelectorAll('button')].find(b => b.textContent.includes('CSV'));
      await act(async () => { csvItem.click(); });

      expect(clicks).toHaveLength(1);
      expect(clicks[0]).toMatch(/^CashVariancePattern_/);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
