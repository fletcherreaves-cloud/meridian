// @vitest-environment happy-dom
// @ts-nocheck
// Owner, live, 2026-10-15: "a report I can pull that shows impact of those raises to labor and
// profitability" -- renders the REAL PayEventsReportPanel (Labor & Scheduling's new "Pay
// Events" tab), not payRaiseImpact()/detectAropJumps() in isolation (already covered in
// pay-events.test.js). Covers the actual report wiring: the unexplained-jumps nudge, the
// store picker + log button, and the logged-events table showing a real computed impact row.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PayEventsReportPanel } from '../views/labor-tools.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, savePayEvent: vi.fn(async () => ({ id: 'x', error: null })) };
});

const STORES = [{ loc: '10422' }];

function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(React.createElement(PayEventsReportPanel, props)); });
  return { container, root };
}

describe('PayEventsReportPanel', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('shows the empty states when nothing has jumped and nothing is logged', () => {
    ({ container, root } = mount({ stores: STORES, ds: { laborRows: [], qsrActSummaryRows: [], payEvents: [] } }));
    expect(container.textContent).toContain('No unexplained AROP jumps right now.');
    expect(container.textContent).toContain('Nothing logged yet.');
  });

  it('choosing a store and clicking "Log Pay Event" opens the real PayEventModal for that store', () => {
    ({ container, root } = mount({ stores: STORES, ds: { laborRows: [], qsrActSummaryRows: [], payEvents: [] } }));
    const select = container.querySelector('select');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(select, '10422');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const logBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '💰 Log Pay Event');
    expect(logBtn.disabled).toBe(false);
    act(() => { logBtn.click(); });
    expect(container.textContent).toContain('Log Pay Event — ');
  });

  it('renders a logged event with its computed before/after impact, dollar-exact', () => {
    // Before window: 2026-07-18..07-31 at $10/hr. After window: 2026-08-01..08-14 at $10.40/hr.
    // Same shape as pay-events.test.js's payRaiseImpact fixture.
    const mk = (start, end, avgRate) => {
      const laborPct = (avgRate * 250) / 10000;
      const laborRows = [], qsrActSummaryRows = [];
      for (let d = start; d <= end; d = addDay(d)) {
        laborRows.push({ loc: '10422', date: new Date(d + 'T00:00:00'), laborPct, sales: 10000 });
        qsrActSummaryRows.push({ loc: '10422', date: new Date(d + 'T00:00:00'), actHrs: 250 });
      }
      return { laborRows, qsrActSummaryRows };
    };
    function addDay(dateStr) { const dt = new Date(dateStr + 'T12:00:00'); dt.setDate(dt.getDate() + 1); return dt.toISOString().slice(0, 10); }
    const before = mk('2026-07-18', '2026-07-31', 10);
    const after = mk('2026-08-01', '2026-08-14', 10.4);
    const ds = {
      laborRows: [...before.laborRows, ...after.laborRows],
      qsrActSummaryRows: [...before.qsrActSummaryRows, ...after.qsrActSummaryRows],
      payEvents: [{ id: 'ev1', loc: '10422', raiseType: 'review_raise', amountPerHour: 0.4, employeeLabel: 'Jane D.', effectiveDate: '2026-08-01', note: '' }],
    };
    ({ container, root } = mount({ stores: STORES, ds }));
    expect(container.textContent).toContain('Logged Pay Events (1)');
    expect(container.textContent).toContain('Performance Review Raise');
    expect(container.textContent).toContain('Jane D.');
    expect(container.textContent).toContain('$10.00 → $10.40');
    // weekly impact = 0.4 * 250 * 7 = 700; annualized = 700*52 = 36400
    expect(container.textContent).toContain('$700');
    expect(container.textContent).toContain('$36,400');
  });
});
