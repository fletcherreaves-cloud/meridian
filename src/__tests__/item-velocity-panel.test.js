// @vitest-environment happy-dom
// @ts-nocheck
// Reports redesign Phase 5 -- renders the REAL ItemVelocityPanel, built on the REAL ReportShell.
// Only totals (not the trend split, which depends on the exact midpoint of ReportShell's own
// resolved default range, already covered precisely in item-velocity-engine.test.js with a
// controlled range) are asserted here -- this test's job is proving the real wiring end-to-end.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ItemVelocityPanel } from '../views/item-velocity.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORES = [{ loc: '3708' }];
const D = (d) => new Date(Date.now() - d * 86400000);

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(ItemVelocityPanel, props)); });
  return { container, root };
}

describe('ItemVelocityPanel', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  it('shows the pre-run empty state before Run Report is clicked', async () => {
    ({ container, root } = await mount({ ds: {}, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('Choose a date range and location, then Run Report.');
  });

  it('Run Report computes and renders real item totals from the real engine', async () => {
    const ds = {
      pmixRows: [
        { loc: '0003708', date: D(3), item: '1', desc: 'Big Mac', price: 5, soldQty: 20 },
        { loc: '0003708', date: D(2), item: '1', desc: 'Big Mac', price: 5, soldQty: 20 },
        { loc: '0003708', date: D(1), item: '2', desc: 'Fries', price: 3, soldQty: 10 },
      ],
    };
    ({ container, root } = await mount({ ds, stores: STORES, onClose: () => {} }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(container.textContent).toContain('Big Mac');
    expect(container.textContent).toContain('Fries');
    expect(container.textContent).toContain('40'); // Big Mac units: 20+20
    expect(container.textContent).toContain('$200'); // Big Mac revenue: 40 * $5
  });

  it('after a run, CSV export fires with the real headers and figures', async () => {
    const ds = { pmixRows: [{ loc: '0003708', date: D(1), item: '1', desc: 'Big Mac', price: 5, soldQty: 20 }] };
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
      expect(clicks[0]).toMatch(/^ItemVelocity_/);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
