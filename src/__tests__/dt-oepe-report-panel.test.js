// @vitest-environment happy-dom
// @ts-nocheck
// Owner request, 2026-11-17: renders the REAL DtOepeReportPanel, built on the REAL ReportShell +
// the REAL engine/dt-oepe-report.js computation (same pattern as fob-reference-table-panel.test.js).
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DtOepeReportPanel } from '../views/dt-oepe-report.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORES = [{ loc: '3708' }];

// Dated off the real "today" (not a fixed date) so this keeps passing regardless of when the
// suite runs -- the 1st of the current month always falls inside the MTD window.
function buildDs() {
  const today = new Date();
  const mtdDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return { qsrActSummaryRows: [
    { loc: '3708', date: mtdDay, _dtTotal: 20000000, _dtStore: 0, _dtHeldTime: 0, _dtCars: 100 }, // 200s
  ] };
}

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(DtOepeReportPanel, props)); });
  return { container, root };
}

describe('DtOepeReportPanel', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  it('shows the pre-run empty state before Run Report is clicked', async () => {
    ({ container, root } = await mount({ ds: {}, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('Choose a location, then Run Report.');
  });

  it('Run Report computes and renders a real MTD OEPE value for the store', async () => {
    ({ container, root } = await mount({ ds: buildDs(), stores: STORES, onClose: () => {} }));
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(container.querySelector('table')).toBeTruthy();
    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('200s'); // 20,000,000us / 100 cars / 1000 = 200s
  });
});
