// @vitest-environment happy-dom
// @ts-nocheck
// Owner, live, 2026-10-15: "a report... to show history of each employee's wages and rates of
// pay... see when a pay rate changes and be able to have analysis on its expected impact to
// overall labor." Renders the REAL PayRateHistoryPanel (Owner/Admin/DO only), not
// weeklyCrewRates()/detectRateSteps()/managementRateChanges()/payImpact() in isolation (already
// covered in employee-pay-history.test.js). Covers the actual report wiring: the loading state,
// the merged crew+management table, and the net-impact summary line.
// All fixtures synthetic (no real geid/name/rate), same PII-fixture discipline as the rest of
// this repo's tests.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PayRateHistoryPanel } from '../views/pay-rate-history.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let _shiftPay = [];
let _shiftAssignments = [];
// Owner request 2026-10-17 (app_access_log) -- wage data is sensitive; the panel logs its own
// view on mount. Spied (not left as the real implementation) so the test below can assert it.
const logAppAccessMock = vi.fn().mockResolvedValue({ error: null });

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadLifeLenzShiftPay: vi.fn(async () => _shiftPay),
    loadLifeLenzShiftAssignments: vi.fn(async () => _shiftAssignments),
    logAppAccess: (...args) => logAppAccessMock(...args),
  };
});

const STORES = [{ loc: '0010422' }];

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(PayRateHistoryPanel, props)); });
  await act(async () => { await Promise.resolve(); });
  return { container, root };
}

describe('PayRateHistoryPanel', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); _shiftPay = []; _shiftAssignments = []; logAppAccessMock.mockClear(); });

  it('logs its own view on mount (app_access_log, owner request 2026-10-17)', async () => {
    ({ container, root } = await mount({ ds: { employeePayRateChanges: [] }, stores: STORES, onClose: () => {} }));
    expect(logAppAccessMock).toHaveBeenCalledWith('panel_view', 'pay-rate-history');
  });

  it('shows the empty state when nothing has changed for either population', async () => {
    ({ container, root } = await mount({ ds: { employeePayRateChanges: [] }, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('No pay-rate changes detected in this window.');
    expect(container.textContent).toContain('0 changes detected');
  });

  it('renders a logged management rate change with its real-shaped before/after + annualized impact', async () => {
    const ds = {
      employeePayRateChanges: [{
        source: 'qsr_tenure', loc: '0010422', personKey: 'g1', employeeName: 'J Mgr',
        jobTitle: 'General Manager', priorRate: 18, newRate: 19, effectiveDate: '2026-09-01',
      }],
    };
    ({ container, root } = await mount({ ds, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('1 change detected');
    expect(container.textContent).toContain('1 management · 0 crew');
    expect(container.textContent).toContain('J Mgr');
    expect(container.textContent).toContain('General Manager');
    expect(container.textContent).toContain('$18.00 → $19.00');
    // weekly = 1 * 40 = 40; annualized = 40*52 = 2080 (ASSUMED_MANAGEMENT_WEEKLY_HOURS, flagged as assumed)
    expect(container.textContent).toContain('$40.00');
    expect(container.textContent).toContain('$2,080');
    expect(container.textContent).toContain('assumed 40h/wk');
    expect(container.textContent).toContain('Net annualized impact: $2,080');
  });

  it('derives a crew rate step from joined shift-pay + shift-assignment rows, using that employee\'s own measured hours', async () => {
    _shiftAssignments = [
      { loc: '0010422', shiftId: 's1', date: '2026-08-03', assignedEmploymentId: 'E1', employeeName: 'A Crew' }, // Mon wk1
      { loc: '0010422', shiftId: 's2', date: '2026-08-10', assignedEmploymentId: 'E1', employeeName: 'A Crew' }, // Mon wk2
    ];
    _shiftPay = [
      { loc: '0010422', shiftId: 's1', earnings: 60, seconds: 14400 },  // 4h @ $15
      { loc: '0010422', shiftId: 's2', earnings: 70, seconds: 14400 },  // 4h @ $17.50 -- a real $2.50 step, clear of the threshold
    ];
    ({ container, root } = await mount({ ds: { employeePayRateChanges: [] }, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('1 change detected');
    expect(container.textContent).toContain('0 management · 1 crew');
    expect(container.textContent).toContain('A Crew');
    expect(container.textContent).toContain('$15.00 → $17.50');
    // weekly = 2.5 * 4 (this employee's own measured hours that week) = 10; annualized = 10*52 = 520
    expect(container.textContent).toContain('$10.00');
    expect(container.textContent).toContain('$520');
    expect(container.textContent).toContain('measured');
  });

  it('a crew shift with no matching pay row contributes nothing -- no fabricated step', async () => {
    _shiftAssignments = [
      { loc: '0010422', shiftId: 'missing', date: '2026-08-03', assignedEmploymentId: 'E1', employeeName: 'A Crew' },
    ];
    _shiftPay = [];
    ({ container, root } = await mount({ ds: { employeePayRateChanges: [] }, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('No pay-rate changes detected in this window.');
  });
});
