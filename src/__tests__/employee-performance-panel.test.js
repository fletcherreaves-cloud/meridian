// @vitest-environment happy-dom
// @ts-nocheck
// Renders the REAL EmployeePerformancePanel (Labor & Scheduling hub's new "Employee
// Performance" tab), not storePerformanceSummary()/lowAttendanceEmployees() in isolation
// (already covered in employee-performance.test.js). Per dispatch16's "would this verification
// still pass if reverted" rule: a test that only imports the engine functions would still pass
// unchanged if the App.js tab wiring or the panel's own rendering were deleted — this one
// renders through the actual exported panel so a revert of either half registers.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { EmployeePerformancePanel } from '../views/labor-tools.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(React.createElement(EmployeePerformancePanel, props)); });
  return { container, root };
}

const SAMPLE_ROWS = [
  { loc: '0003708', geid: 'G1001', employeeName: 'Jordan Lee', periodStart: '2026-10-19', periodEnd: '2026-11-01', attendanceRate: 90, absentCount: 1, lateCount: 2, scheduledCount: 10, workedCount: 9, disciplinaryActionCount: 0, commendationCount: 0, totalWorkedHours: 40 },
  { loc: '0003708', geid: 'G1002', employeeName: 'Casey Nguyen', periodStart: '2026-10-19', periodEnd: '2026-11-01', attendanceRate: 60, absentCount: 4, lateCount: 1, scheduledCount: 10, workedCount: 6, disciplinaryActionCount: 0, commendationCount: 1, totalWorkedHours: 24 },
];

describe('EmployeePerformancePanel', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('shows the empty state when no employee-performance data has synced yet', () => {
    ({ container, root } = mount({ ds: { employeePerformanceRows: [] } }));
    expect(container.textContent).toContain('No employee-performance data yet');
  });

  it('renders real rows: store summary and the low-attendance flag list', () => {
    ({ container, root } = mount({ ds: { employeePerformanceRows: SAMPLE_ROWS } }));
    expect(container.textContent).toContain('By Store');
    expect(container.textContent).toContain('Below 80% Attendance');
    // Casey Nguyen (60%) is flagged; Jordan Lee (90%) is not
    expect(container.textContent).toContain('Casey Nguyen');
    expect(container.textContent).not.toContain('Jordan Lee');
    // store avg attendance = (90+60)/2 = 75.0%
    expect(container.textContent).toContain('75.0%');
  });

  it('shows "no one below the floor" when every employee is above the threshold', () => {
    const allGood = SAMPLE_ROWS.map(r => ({ ...r, attendanceRate: 95 }));
    ({ container, root } = mount({ ds: { employeePerformanceRows: allGood } }));
    expect(container.textContent).toContain('No one below the attendance floor');
  });
});
