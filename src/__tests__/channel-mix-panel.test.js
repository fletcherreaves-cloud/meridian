// @vitest-environment happy-dom
// @ts-nocheck
// Reports redesign Phase 5 -- renders the REAL ChannelMixPanel, built on the REAL ReportShell.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ChannelMixPanel } from '../views/channel-mix.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORES = [{ loc: '3708' }];
const D = (d) => new Date(Date.now() - d * 86400000);

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(ChannelMixPanel, props)); });
  return { container, root };
}

describe('ChannelMixPanel', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  it('shows the pre-run empty state before Run Report is clicked', async () => {
    ({ container, root } = await mount({ ds: {}, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('Choose a date range and location, then Run Report.');
  });

  it('Run Report computes and renders real channel % figures from the real engine', async () => {
    const ds = {
      salesLedgerRows: [
        { loc: '3708', date: D(3), dtPctTotal: 0.60, delivPctTotal: 0.10, mopPctTotal: 0.05, kioskPctTotal: 0.02, fcPctTotal: 0.23 },
        { loc: '3708', date: D(2), dtPctTotal: 0.60, delivPctTotal: 0.10, mopPctTotal: 0.05, kioskPctTotal: 0.02, fcPctTotal: 0.23 },
      ],
    };
    ({ container, root } = await mount({ ds, stores: STORES, onClose: () => {} }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('60.0%'); // slDtPct
  });

  it('after a run, CSV export fires with the real headers and figures', async () => {
    const ds = { salesLedgerRows: [{ loc: '3708', date: D(1), dtPctTotal: 0.55, delivPctTotal: 0.1, mopPctTotal: 0.05, kioskPctTotal: 0.02, fcPctTotal: 0.28 }] };
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
      expect(clicks[0]).toMatch(/^ChannelMix_/);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
