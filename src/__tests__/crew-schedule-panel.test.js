// @vitest-environment happy-dom
// @ts-nocheck
// Crew Schedule Lookup (dispatch #123). Pure-logic tests for the directory/search/selection
// helpers, PLUS call-site RBAC rendering tests (same standing rule security-panel.test.js's own
// header cites, from #366 — a test that only imports a helper can't tell "built" from "built but
// never wired in"). Mocks src/lib/supabase.js exactly like security-panel.test.js does (this
// panel transitively imports store-analytics.js's RevealName and security-panel.js's
// securityPanelAccess, both of which already import from lib/supabase.js — proven safe by that
// existing test suite's own passing transitive import of the same two modules).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const loadLifeLenzShiftAssignmentsMock = vi.fn();
const loadGmIdentityRevealEnabledMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('../lib/supabase.js', () => ({
  supabase: { rpc: (...args) => rpcMock(...args) },
  loadLifeLenzShiftAssignments: (...args) => loadLifeLenzShiftAssignmentsMock(...args),
  loadGmIdentityRevealEnabled: (...args) => loadGmIdentityRevealEnabledMock(...args),
}));

import {
  CrewSchedulePanel, groupShiftAssignmentsByEmployee, filterEmployeeDirectory,
  shiftsForSelected, shortEmployeeId,
} from '../views/crew-schedule-panel.js';

const ROWS = [
  { loc: '0003708', shiftId: 's1', date: '2026-08-26', shiftStart: '2026-08-26T13:00:00.000Z', shiftEnd: '2026-08-26T19:00:00.000Z', assignedEmploymentId: 'E1', empToken: 'tok-alice', roleName: 'Drive Thru', isAbsent: false, updatedAt: '2026-08-25T10:00:00.000Z' },
  { loc: '0003708', shiftId: 's2', date: '2026-08-27', shiftStart: '2026-08-27T13:00:00.000Z', shiftEnd: '2026-08-27T19:00:00.000Z', assignedEmploymentId: 'E1', empToken: 'tok-alice', roleName: 'Lobby', isAbsent: false, updatedAt: '2026-08-25T10:00:00.000Z' },
  { loc: '0003708', shiftId: 's3', date: '2026-08-26', shiftStart: '2026-08-26T11:00:00.000Z', shiftEnd: '2026-08-26T15:00:00.000Z', assignedEmploymentId: 'E2', empToken: null, roleName: 'Grill', isAbsent: false, updatedAt: '2026-08-25T09:00:00.000Z' },
];

// ── Pure logic ────────────────────────────────────────────────────────────────────────────────

describe('shortEmployeeId — the token/ID display fallback', () => {
  it('formats the last 5 chars of the employmentId', () => {
    expect(shortEmployeeId('E00012345')).toBe('Employee #12345');
  });
  it('empty/null → Unknown, never a guess', () => {
    expect(shortEmployeeId(null)).toBe('Unknown');
    expect(shortEmployeeId('')).toBe('Unknown');
  });
});

describe('groupShiftAssignmentsByEmployee', () => {
  it('groups by emp_token when present, by assignedEmploymentId otherwise — 2 people from 3 rows', () => {
    const dir = groupShiftAssignmentsByEmployee(ROWS);
    expect(dir.length).toBe(2);
    const alice = dir.find(e => e.key === 'tok:tok-alice');
    expect(alice.shifts.length).toBe(2);
    const e2 = dir.find(e => e.key === 'eid:E2');
    expect(e2.empToken).toBeNull();
    expect(e2.shifts.length).toBe(1);
  });
  it('busiest person first (shift count desc)', () => {
    const dir = groupShiftAssignmentsByEmployee(ROWS);
    expect(dir[0].key).toBe('tok:tok-alice'); // 2 shifts beats E2's 1
  });
  it('each person\'s own shifts are sorted by start time', () => {
    const dir = groupShiftAssignmentsByEmployee(ROWS);
    const alice = dir.find(e => e.key === 'tok:tok-alice');
    expect(alice.shifts.map(s => s.shiftId)).toEqual(['s1', 's2']);
  });
  it('empty input → empty directory, not a crash', () => {
    expect(groupShiftAssignmentsByEmployee([])).toEqual([]);
    expect(groupShiftAssignmentsByEmployee(null)).toEqual([]);
  });
});

describe('filterEmployeeDirectory — search operates on ID always, on name only once revealed', () => {
  const dir = groupShiftAssignmentsByEmployee(ROWS);

  it('empty query matches everyone', () => {
    expect(filterEmployeeDirectory(dir, '', {}).length).toBe(2);
  });
  it('matches by assignedEmploymentId substring, case-insensitively', () => {
    expect(filterEmployeeDirectory(dir, 'e2', {}).map(e => e.key)).toEqual(['eid:E2']);
  });
  it('does NOT match a name that has not been revealed yet, even if it would match', () => {
    expect(filterEmployeeDirectory(dir, 'alice', {})).toEqual([]);
  });
  it('DOES match a revealed name, once revealedNames carries it', () => {
    const found = filterEmployeeDirectory(dir, 'alice', { 'tok-alice': 'Alice A' });
    expect(found.map(e => e.key)).toEqual(['tok:tok-alice']);
  });
});

describe('shiftsForSelected', () => {
  it('flattens only the selected employees\' shifts, sorted by start time across people', () => {
    const dir = groupShiftAssignmentsByEmployee(ROWS);
    const out = shiftsForSelected(dir, ['tok:tok-alice', 'eid:E2']);
    expect(out.map(s => s.shiftId)).toEqual(['s3', 's1', 's2']); // s3 (11:00) before s1 (13:00 same day)
  });
  it('an unselected employee contributes nothing', () => {
    const dir = groupShiftAssignmentsByEmployee(ROWS);
    const out = shiftsForSelected(dir, ['eid:E2']);
    expect(out.map(s => s.shiftId)).toEqual(['s3']);
  });
  it('no selection -> empty', () => {
    const dir = groupShiftAssignmentsByEmployee(ROWS);
    expect(shiftsForSelected(dir, [])).toEqual([]);
  });
});

// ── Component wiring — RBAC call-site tests, not just the pure helpers ──────────────────────────

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function flush(container, maxTicks = 15) {
  let last = null;
  for (let i = 0; i < maxTicks; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    if (container.textContent === last) return;
    last = container.textContent;
  }
}

describe('CrewSchedulePanel — RBAC gate matches securityPanelAccess exactly (reused, not reimplemented)', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadLifeLenzShiftAssignmentsMock.mockReset().mockResolvedValue([]);
    loadGmIdentityRevealEnabledMock.mockReset().mockResolvedValue(false);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('admin: never calls loadGmIdentityRevealEnabled, and loads the schedule', async () => {
    loadLifeLenzShiftAssignmentsMock.mockResolvedValue(ROWS);
    await act(async () => { root.render(React.createElement(CrewSchedulePanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    expect(loadGmIdentityRevealEnabledMock).not.toHaveBeenCalled();
    expect(loadLifeLenzShiftAssignmentsMock).toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/not permitted/i);
  });

  it('supervisor: allowed the same way as admin', async () => {
    loadLifeLenzShiftAssignmentsMock.mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(CrewSchedulePanel, { userRole: 'supervisor', onClose: vi.fn() })); });
    await flush(container);
    expect(loadGmIdentityRevealEnabledMock).not.toHaveBeenCalled();
    expect(loadLifeLenzShiftAssignmentsMock).toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/not permitted/i);
  });

  it('manager with the org flag OFF: renders "not permitted" and NEVER calls loadLifeLenzShiftAssignments — an empty read must never stand in for a permission check', async () => {
    loadGmIdentityRevealEnabledMock.mockResolvedValue(false);
    await act(async () => { root.render(React.createElement(CrewSchedulePanel, { userRole: 'manager', onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/not permitted/i);
    expect(loadLifeLenzShiftAssignmentsMock).not.toHaveBeenCalled();
  });

  it('manager with the org flag ON: proceeds to load the schedule, same as admin/supervisor', async () => {
    loadGmIdentityRevealEnabledMock.mockResolvedValue(true);
    loadLifeLenzShiftAssignmentsMock.mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(CrewSchedulePanel, { userRole: 'manager', onClose: vi.fn() })); });
    await flush(container);
    expect(loadGmIdentityRevealEnabledMock).toHaveBeenCalled();
    expect(loadLifeLenzShiftAssignmentsMock).toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/not permitted/i);
  });

  it('an ineligible role (e.g. gm) is denied immediately, without an org_config round-trip or any data read — the real RBAC-denial proof this dispatch requires', async () => {
    await act(async () => { root.render(React.createElement(CrewSchedulePanel, { userRole: 'gm', onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/not permitted/i);
    expect(loadGmIdentityRevealEnabledMock).not.toHaveBeenCalled();
    expect(loadLifeLenzShiftAssignmentsMock).not.toHaveBeenCalled();
  });

  it('office_staff is denied the same way', async () => {
    await act(async () => { root.render(React.createElement(CrewSchedulePanel, { userRole: 'office_staff', onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/not permitted/i);
    expect(loadLifeLenzShiftAssignmentsMock).not.toHaveBeenCalled();
  });

  it('allowed + loaded: renders the employee directory count and shift count in the subtitle', async () => {
    loadLifeLenzShiftAssignmentsMock.mockResolvedValue(ROWS);
    await act(async () => { root.render(React.createElement(CrewSchedulePanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/2 employees/);
    expect(container.textContent).toMatch(/3 shifts/);
  });
});
