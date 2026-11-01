// @vitest-environment happy-dom
// @ts-nocheck
// Renders the REAL ScheduleDisciplinePanel (Labor & Scheduling hub's new "Schedule Discipline"
// tab), not storeScheduleDisciplineSummary()/editorBreakdown() in isolation (already covered in
// schedule-discipline.test.js). Per dispatch16's "would this verification still pass if
// reverted" rule: a test that only imports the engine functions would still pass unchanged if
// the App.js tab wiring or the panel's own rendering were deleted — this one renders through the
// actual exported panel so a revert of either half registers.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ScheduleDisciplinePanel } from '../views/labor-tools.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(React.createElement(ScheduleDisciplinePanel, props)); });
  return { container, root };
}

const SAMPLE_ROWS = [
  { loc: '0003708', scheduledShiftId: 'shift-001', employeeName: 'Jordan Lee', originalValue: '09:00', updatedValue: '08:00', editedBy: 'Pat Rivera', occurredAt: new Date().toISOString().slice(0, 10) + ' 19:12:00', hoursVariance: 1.0, costVariance: 8.5 },
  { loc: '0003708', scheduledShiftId: 'shift-002', employeeName: 'Casey Nguyen', originalValue: '17:00', updatedValue: '15:00', editedBy: 'Pat Rivera', occurredAt: new Date().toISOString().slice(0, 10) + ' 11:03:00', hoursVariance: -2.0, costVariance: -17.0 },
];

describe('ScheduleDisciplinePanel', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('shows the empty state when no schedule-variance data has synced yet', () => {
    ({ container, root } = mount({ ds: { scheduleVarianceRows: [] } }));
    expect(container.textContent).toContain('No schedule-edit data yet');
  });

  it('renders real edit rows: store summary, editor breakdown, and the recent-edits drill-down', () => {
    ({ container, root } = mount({ ds: { scheduleVarianceRows: SAMPLE_ROWS } }));
    expect(container.textContent).toContain('Total edits: ');
    expect(container.textContent).toContain('2');
    expect(container.textContent).toContain('Pat Rivera');
    expect(container.textContent).toContain('By Store');
    expect(container.textContent).toContain('By Editor');
    expect(container.textContent).toContain('Recent Edits');
    // net cost impact: 8.5 + -17 = -8.5 -> rendered with a minus sign, rounded away from zero
    expect(container.textContent).toContain('-$9');
    expect(container.textContent).not.toContain('-$8');
    // drill-down shows the real before/after value pair
    expect(container.textContent).toContain('09:00 → 08:00');
  });

  it('a window selector exists and widening it brings an older edit into view', () => {
    // 20 days ago: outside the default 14-day window, inside a 30-day window.
    const d = new Date(); d.setDate(d.getDate() - 20);
    const olderRow = { loc: '0005183', scheduledShiftId: 'shift-old', employeeName: 'Older Employee', originalValue: 'A', updatedValue: 'B', editedBy: 'Quiet Editor', occurredAt: d.toISOString().slice(0, 10) + ' 00:00:00', hoursVariance: 1, costVariance: 1 };
    ({ container, root } = mount({ ds: { scheduleVarianceRows: [...SAMPLE_ROWS, olderRow] } }));
    expect(container.textContent).not.toContain('Quiet Editor'); // outside default 14-day window
    const select = container.querySelector('select');
    expect(select).toBeTruthy();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(select, '30');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('Quiet Editor');
  });
});
