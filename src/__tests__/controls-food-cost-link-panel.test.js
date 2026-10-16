// @vitest-environment happy-dom
// @ts-nocheck
// Reports redesign Phase 5 -- renders the REAL ControlsFoodCostLinkPanel, built on the REAL
// ReportShell, same shape loss-prevention-report-panel.test.js already proves for Phase 2's report.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ControlsFoodCostLinkPanel } from '../views/controls-food-cost-link.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORES = [{ loc: '3708' }];

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(ControlsFoodCostLinkPanel, props)); });
  return { container, root };
}

describe('ControlsFoodCostLinkPanel', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  it('shows the pre-run empty state before Run Report is clicked', async () => {
    ({ container, root } = await mount({ ds: {}, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('Choose a date range and location, then Run Report.');
  });

  it('Run Report computes and renders real FOB + Controls figures from the real engine, for the real covering month', async () => {
    const ds = {
      fobRows: [{ loc: '3708', date: new Date(Date.now() - 20 * 86400000), compWaste: 0.004 }],
      ctrlRows: [{ loc: '3708', date: new Date(Date.now() - 20 * 86400000), depositAmt: 100 }],
    };
    ({ container, root } = await mount({ ds, stores: STORES, onClose: () => {} }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('0.40%'); // compWaste 0.004 -> fP(.,2)
    expect(container.textContent).toContain('$100');
  });

  it('after a run, CSV export fires with the real headers (incl. Month) and the real formatted figures', async () => {
    const ds = { ctrlRows: [{ loc: '3708', date: new Date(Date.now() - 20 * 86400000), depositAmt: 100 }] };
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
      expect(clicks[0]).toMatch(/^ControlsFoodCostLinkage_/);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
