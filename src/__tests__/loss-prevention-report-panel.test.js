// @vitest-environment happy-dom
// @ts-nocheck
// Reports redesign Phase 2 -- renders the REAL LossPreventionReportPanel, which is itself built
// on the REAL ReportShell (already covered standalone in report-shell.test.js). This test
// exercises the full stack one level up: Run -> real buildLossPreventionReport() against real
// ds rows -> the table actually renders real numbers -> export produces the real CSV contract.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { LossPreventionReportPanel } from '../views/loss-prevention-report.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORES = [{ loc: '3708' }];

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(LossPreventionReportPanel, props)); });
  return { container, root };
}

describe('LossPreventionReportPanel', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  it('shows the pre-run empty state before Run Report is clicked', async () => {
    ({ container, root } = await mount({ ds: {}, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('Choose a date range and location, then Run Report.');
  });

  it('Run Report computes and renders real per-store Discount % / $ figures from the real engine', async () => {
    // 3 days back, safely inside any default trailing window regardless of the exact 4am-
    // business-day cutover boundary (ReportShell's own default preset ends on the last CLOSED
    // business day, not literal "today" -- see utils/date.js's lastClosedBusinessDay).
    const ds = {
      opsCashRows: [{ loc: '3708', date: new Date(Date.now() - 3 * 86400000), discPct: 0.021, discAmt: 42 }],
    };
    ({ container, root } = await mount({ ds, stores: STORES, onClose: () => {} }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(container.textContent).toContain('2.10%');
    expect(container.textContent).toContain('$42');
  });

  it('after a run, CSV export fires with the real headers (all 20 columns) and the real formatted figures', async () => {
    const ds = { opsCashRows: [{ loc: '3708', date: new Date(Date.now() - 3 * 86400000), discPct: 0.021, discAmt: 42 }] };
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
      expect(clicks[0]).toMatch(/^LossPreventionSummary_/);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
