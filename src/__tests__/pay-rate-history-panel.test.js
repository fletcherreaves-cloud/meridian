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
    expect(container.textContent).toContain('1 management · 0 crew (roster) · 0 crew (derived)');
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
    expect(container.textContent).toContain('0 management · 0 crew (roster) · 1 crew (derived)');
    expect(container.textContent).toContain('A Crew');
    expect(container.textContent).toContain('$15.00 → $17.50');
  });

  // Owner request 2026-11-05: crew's own REAL logged change from LifeLenz's employee_roster_
  // report (never earnings-derived) -- a separate table-sourced population from the two above.
  it('renders a logged crew (roster) rate change, joined to that employee\'s own measured hours when resolved to a real id', async () => {
    _shiftAssignments = [
      { loc: '0010422', shiftId: 's1', date: '2026-08-03', assignedEmploymentId: 'emp-real-1', employeeName: 'D Crew' },
      { loc: '0010422', shiftId: 's2', date: '2026-08-10', assignedEmploymentId: 'emp-real-1', employeeName: 'D Crew' },
    ];
    // Both weeks at the SAME $12/hr -- the earnings-DERIVED detector (weeklyCrewRates/
    // detectRateSteps) must find no step of its own here, so this test isolates the
    // roster-sourced real change below rather than also tripping the separate derived one.
    _shiftPay = [
      { loc: '0010422', shiftId: 's1', earnings: 48, seconds: 14400 }, // 4h @ $12
      { loc: '0010422', shiftId: 's2', earnings: 48, seconds: 14400 }, // 4h @ $12 -- same rate, just feeds the impact-calc hours
    ];
    const ds = {
      employeePayRateChanges: [{
        source: 'lifelenz_roster', loc: '0010422', personKey: 'emp-real-1', employeeName: 'D Crew',
        jobTitle: '00650', priorRate: 12, newRate: 13, effectiveDate: '2026-10-20',
      }],
    };
    ({ container, root } = await mount({ ds, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('1 change detected');
    expect(container.textContent).toContain('0 management · 1 crew (roster) · 0 crew (derived)');
    expect(container.textContent).toContain('D Crew');
    expect(container.textContent).toContain('$12.00 → $13.00');
    expect(container.textContent).toContain('measured'); // joined to the real id's latest week's hours
    // Real posted rate, never earnings-derived -- always straight-time, regardless of OT mix.
    expect(container.textContent).toContain('straight-time');
  });

  it('shows no measured-hours impact for a roster change that could not be resolved to a real employment id', async () => {
    const ds = {
      employeePayRateChanges: [{
        source: 'lifelenz_roster', loc: '0010422', personKey: 'name:new hire', employeeName: 'New Hire',
        jobTitle: '00650', priorRate: 12, newRate: 13, effectiveDate: '2026-10-20',
      }],
    };
    ({ container, root } = await mount({ ds, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('New Hire');
    expect(container.textContent).toContain('$12.00 → $13.00');
    // No real employment id to join to a measured-hours week -- left honestly unknown (no
    // dollar impact fabricated, no fallback to an assumed management-style 40h/wk for crew).
    expect(container.textContent).toContain('Net annualized impact: $0');
  });

  // Owner-caught 2026-11-05 (real wage-accuracy bug): overtime is paid at 1.5x, not the
  // employee's base rate -- a week with OT should report the STRAIGHT-TIME rate, not an
  // OT-inflated blended one, and the panel should say so plainly ("straight-time" vs "⚠ blended").
  it('a crew week with overtime reports the straight-time rate (not the OT-inflated blended rate) and flags it clearly', async () => {
    _shiftAssignments = [
      { loc: '0010422', shiftId: 's1', date: '2026-08-03', assignedEmploymentId: 'E1', employeeName: 'A Crew' },
      { loc: '0010422', shiftId: 's2', date: '2026-08-10', assignedEmploymentId: 'E1', employeeName: 'A Crew' },
    ];
    _shiftPay = [
      // Week 1: clean 4h @ $15 straight time, no OT.
      { loc: '0010422', shiftId: 's1', earnings: 60, seconds: 14400, regEarnings: 60, regSeconds: 14400, otEarnings: 0, otSeconds: 0 },
      // Week 2: SAME $15 base rate -- but 6h regular ($90) + 2h overtime @ $22.50 (1.5x $15, $45).
      // Blended would read $16.875/hr (a false "raise"); straight-time correctly reads $15/hr flat.
      { loc: '0010422', shiftId: 's2', earnings: 135, seconds: 28800, regEarnings: 90, regSeconds: 21600, otEarnings: 45, otSeconds: 7200 },
    ];
    ({ container, root } = await mount({ ds: { employeePayRateChanges: [] }, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('No pay-rate changes detected in this window.');
  });

  it('a real rate CHANGE alongside overtime is still detected correctly via the straight-time rate', async () => {
    _shiftAssignments = [
      { loc: '0010422', shiftId: 's1', date: '2026-08-03', assignedEmploymentId: 'E1', employeeName: 'A Crew' },
      { loc: '0010422', shiftId: 's2', date: '2026-08-10', assignedEmploymentId: 'E1', employeeName: 'A Crew' },
    ];
    _shiftPay = [
      { loc: '0010422', shiftId: 's1', earnings: 60, seconds: 14400, regEarnings: 60, regSeconds: 14400, otEarnings: 0, otSeconds: 0 }, // $15/hr straight
      // A real $2.50 raise to $17.50, same week also carrying 2h OT @ $26.25 (1.5x $17.50) --
      // blended would read even higher than $17.50 and obscure the clean step size.
      { loc: '0010422', shiftId: 's2', earnings: 157.5, seconds: 28800, regEarnings: 105, regSeconds: 21600, otEarnings: 52.5, otSeconds: 7200 },
    ];
    ({ container, root } = await mount({ ds: { employeePayRateChanges: [] }, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('1 change detected');
    expect(container.textContent).toContain('$15.00 → $17.50'); // the real straight-time step, not an OT-inflated figure
    expect(container.textContent).toContain('straight-time');
  });

  it('pre-split data (no OT columns persisted yet) still works and is flagged "⚠ blended" rather than silently presented as clean', async () => {
    _shiftAssignments = [
      { loc: '0010422', shiftId: 's1', date: '2026-08-03', assignedEmploymentId: 'E1', employeeName: 'A Crew' },
      { loc: '0010422', shiftId: 's2', date: '2026-08-10', assignedEmploymentId: 'E1', employeeName: 'A Crew' },
    ];
    _shiftPay = [
      { loc: '0010422', shiftId: 's1', earnings: 60, seconds: 14400 }, // no regEarnings/regSeconds/otEarnings/otSeconds at all
      { loc: '0010422', shiftId: 's2', earnings: 70, seconds: 14400 },
    ];
    ({ container, root } = await mount({ ds: { employeePayRateChanges: [] }, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('1 change detected');
    expect(container.textContent).toContain('⚠ blended');
  });

  it('a crew shift with no matching pay row contributes nothing -- no fabricated step', async () => {
    _shiftAssignments = [
      { loc: '0010422', shiftId: 'missing', date: '2026-08-03', assignedEmploymentId: 'E1', employeeName: 'A Crew' },
    ];
    _shiftPay = [];
    ({ container, root } = await mount({ ds: { employeePayRateChanges: [] }, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('No pay-rate changes detected in this window.');
  });

  // Owner request 2026-11-05: "will be interesting to see if we start picking these up" while
  // entering a round of OK-only raises store by store (wife low-to-high, owner high-to-low).
  // The store/district rollup regroups allChanges by loc/state -- same detected changes, no new
  // math -- so these exercise the regrouping, not detection.
  it('rollup: counts the reporting store against the real OK store total, and leaves a non-reporting store out', async () => {
    const twoStoreStores = [{ loc: '0010422' }, { loc: '0005183' }]; // both real OK locs (constants.js INV_ORG_COORDS)
    const ds = {
      employeePayRateChanges: [{
        source: 'qsr_tenure', loc: '0010422', personKey: 'g1', employeeName: 'J Mgr',
        jobTitle: 'General Manager', priorRate: 18, newRate: 19, effectiveDate: '2026-11-04',
      }],
    };
    ({ container, root } = await mount({ ds, stores: twoStoreStores, onClose: () => {} }));
    expect(container.textContent).toContain('1 / 2 OK stores reporting a detected change');
    expect(container.textContent).toContain('OK district');
  });

  it('rollup: a Florida store change lands in the FL district, not the OK count', async () => {
    const stores = [{ loc: '0010422' }, { loc: '0006178' }]; // 6178 is a real FL loc (INV_ORG_COORDS)
    const ds = {
      employeePayRateChanges: [{
        source: 'qsr_tenure', loc: '0006178', personKey: 'g2', employeeName: 'F Mgr',
        jobTitle: 'General Manager', priorRate: 18, newRate: 19, effectiveDate: '2026-11-04',
      }],
    };
    ({ container, root } = await mount({ ds, stores, onClose: () => {} }));
    expect(container.textContent).toContain('0 / 1 OK stores reporting a detected change');
    expect(container.textContent).toContain('FL district');
  });
});
