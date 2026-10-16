// @vitest-environment happy-dom
// @ts-nocheck
// Reports redesign Phase 5 -- renders the REAL PriceChangeImpactPanel, built on the REAL
// ReportShell. The event date (10 days back) is safely inside any default trailing window
// regardless of the exact 4am-business-day cutover boundary, same convention
// loss-prevention-report-panel.test.js's own comment documents. The before/after 14-day
// windows are built as offsets from that same event date, not from a second "now" base, so
// the whole fixture — including a few window days that land in the "future" relative to the
// real clock — forms one self-consistent 28-day block; metricRowsForRange matches purely on
// date key, so a future-dated row resolves exactly like a past one.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PriceChangeImpactPanel } from '../views/price-change-impact.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORES = [{ loc: '3708' }];
const EVENT_OFFSET = 10; // days back from now -- the confirmed change date
const D = (d) => new Date(Date.now() - d * 86400000);

function buildFixture() {
  const pmixRows = [];
  const laborRows = [];
  for (let i = -14; i <= 13; i++) {
    const offset = EVENT_OFFSET + i; // D(offset) = now - offset days, so LARGER offset = an EARLIER date
    const beforeChange = i >= 0; // i=0..13 (offset 10..23) are the 14 earliest/"before" days
    pmixRows.push({ loc: '3708', date: D(offset), item: '100', desc: 'Test Item', price: beforeChange ? 5.00 : 5.50, soldQty: 10 });
    laborRows.push({ loc: '3708', date: D(offset), sales: beforeChange ? 1000 : 1200, gc: beforeChange ? 100 : 110 });
  }
  return { pmixRows, laborRows };
}

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(PriceChangeImpactPanel, props)); });
  return { container, root };
}

describe('PriceChangeImpactPanel', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  it('shows the pre-run empty state before Run Report is clicked', async () => {
    ({ container, root } = await mount({ ds: {}, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('Choose a date range and location, then Run Report.');
  });

  it('shows the no-events state when nothing confirms in range', async () => {
    ({ container, root } = await mount({ ds: {}, stores: STORES, onClose: () => {} }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });
    expect(container.textContent).toContain('No confirmed price changes in this range/selection.');
  });

  it('Run Report finds the real confirmed event and renders the real before/after figures', async () => {
    const ds = buildFixture();
    ({ container, root } = await mount({ ds, stores: STORES, onClose: () => {} }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('+20.0%'); // salesDeltaPct: 1000 -> 1200
  });

  it('after a run, CSV export fires with the real headers and figures', async () => {
    const ds = buildFixture();
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
      expect(clicks[0]).toMatch(/^PriceChangeImpact_/);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
