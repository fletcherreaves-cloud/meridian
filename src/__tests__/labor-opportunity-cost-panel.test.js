// @vitest-environment happy-dom
// @ts-nocheck
// Reports redesign Phase 5 -- renders the REAL LaborOpportunityCostPanel, built on the REAL
// ReportShell. Fixture atoms match labor-opportunity-cost-engine.test.js's own (derive-only
// chains need the real underlying fields, not the final metric names).
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { LaborOpportunityCostPanel } from '../views/labor-opportunity-cost.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORES = [{ loc: '3708' }];
const D = (d) => new Date(Date.now() - d * 86400000);

function buildFixture() {
  const qsrActSummaryRows = [], schedRows = [], laborRows = [], opsLaborRows = [];
  for (const d of [1, 2, 3, 4]) {
    qsrActSummaryRows.push({ loc: '3708', date: D(d), actVsNeed: -5, actHrs: 50, sales: 5000 });
    schedRows.push({ loc: '3708', date: D(d), schedTotHrs: 55 });
    laborRows.push({ loc: '3708', date: D(d), laborPct: 0.25 });
    opsLaborRows.push({ loc: '3708', date: D(d), otDollar: 80 });
  }
  // storeIds is required here: metricRowsForRange always resolves metric-source.js's chain
  // UNSCOPED (scopeLoc=null) and filters by loc afterward -- for a pure-derive metric with no
  // `srcs` of its own (oppCostDollar/avgRate/actVsSchedOpp all qualify), the ONLY way the
  // unscoped resolution can discover which locs exist at all is ds.storeIds. The real app
  // always populates this (App.js's rawStores(), same convention CLAUDE.md documents); a test
  // fixture that forgets it silently resolves every pure-derive metric to nothing, which is
  // exactly what caught this while writing this test.
  return { qsrActSummaryRows, schedRows, laborRows, opsLaborRows, storeIds: ['3708'] };
}

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(LaborOpportunityCostPanel, props)); });
  return { container, root };
}

describe('LaborOpportunityCostPanel', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  it('shows the pre-run empty state before Run Report is clicked', async () => {
    ({ container, root } = await mount({ ds: {}, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('Choose a date range and location, then Run Report.');
  });

  it('Run Report computes and renders real $ totals and hour-gap averages from the real engine', async () => {
    ({ container, root } = await mount({ ds: buildFixture(), stores: STORES, onClose: () => {} }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('$320'); // otDollarTotal: 80 * 4
    expect(container.textContent).toContain('-$500'); // oppCostDollarTotal: -125 * 4
  });

  it('after a run, CSV export fires with the real headers and figures', async () => {
    let clicks = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };
    try {
      ({ container, root } = await mount({ ds: buildFixture(), stores: STORES, onClose: () => {} }));
      const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
      await act(async () => { runBtn.click(); await Promise.resolve(); });

      const exportBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Export'));
      await act(async () => { exportBtn.click(); });
      const csvItem = [...container.querySelectorAll('button')].find(b => b.textContent.includes('CSV'));
      await act(async () => { csvItem.click(); });

      expect(clicks).toHaveLength(1);
      expect(clicks[0]).toMatch(/^LaborOpportunityCost_/);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
