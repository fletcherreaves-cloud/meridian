// @vitest-environment happy-dom
// @ts-nocheck
// Renders the REAL ComplianceAuditPanel (Labor & Scheduling hub's new "Compliance Audit" tab),
// not storeComplianceSummary()/categoryBreakdown()/employeeViolationSummary() in isolation
// (already covered in compliance-audit.test.js). Per dispatch16's "would this verification still
// pass if reverted" rule: a test that only imports the engine functions would still pass
// unchanged if the App.js tab wiring or the panel's own rendering were deleted — this one renders
// through the actual exported panel so a revert of either half registers.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ComplianceAuditPanel } from '../views/labor-tools.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(React.createElement(ComplianceAuditPanel, props)); });
  return { container, root };
}

const today = new Date().toISOString().slice(0, 10);
const SAMPLE_ROWS = [
  { loc: '0003708', complianceWarningId: 'cwid-001', employeeName: 'Jordan Lee', shiftDate: today, category: 'Meal Break', title: 'Missed meal break', costPenalty: 12.5, hourPenalty: 0.25, isDismissed: false },
  { loc: '0003708', complianceWarningId: 'cwid-002', employeeName: 'Casey Nguyen', shiftDate: today, category: 'Rest Break', title: 'Missed rest break', costPenalty: 5, hourPenalty: 0, isDismissed: true },
];

describe('ComplianceAuditPanel', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('shows the empty state when no compliance-audit data has synced yet', () => {
    ({ container, root } = mount({ ds: { complianceAuditRows: [] } }));
    expect(container.textContent).toContain('No compliance-audit data yet');
  });

  it('renders real violation rows: store summary, category breakdown, employee breakdown, and the recent-violations drill-down', () => {
    ({ container, root } = mount({ ds: { complianceAuditRows: SAMPLE_ROWS } }));
    expect(container.textContent).toContain('Total violations: ');
    expect(container.textContent).toContain('2');
    expect(container.textContent).toContain('Jordan Lee');
    expect(container.textContent).toContain('By Store');
    expect(container.textContent).toContain('By Category');
    expect(container.textContent).toContain('By Employee');
    expect(container.textContent).toContain('Recent Violations');
    // total cost penalty: 12.5 + 5 = 17.5 -> rendered rounded
    expect(container.textContent).toContain('$18');
    // dismissed count/rate: 1 of 2 = 50%
    expect(container.textContent).toContain('Dismissed: ');
    expect(container.textContent).toContain('50%');
    // drill-down shows the violation title
    expect(container.textContent).toContain('Missed meal break');
  });

  it('a window selector exists and widening it brings an older violation into view', () => {
    const d = new Date(); d.setDate(d.getDate() - 20);
    const olderRow = { loc: '0005183', complianceWarningId: 'cwid-old', employeeName: 'Older Employee', shiftDate: d.toISOString().slice(0, 10), category: 'Minor Labor', title: 'Old violation', costPenalty: 1, hourPenalty: 0, isDismissed: false };
    ({ container, root } = mount({ ds: { complianceAuditRows: [...SAMPLE_ROWS, olderRow] } }));
    expect(container.textContent).not.toContain('Older Employee'); // outside default 14-day window
    const select = container.querySelector('select');
    expect(select).toBeTruthy();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(select, '30');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('Older Employee');
  });
});
