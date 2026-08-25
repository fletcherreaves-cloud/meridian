// @vitest-environment happy-dom
// @ts-nocheck
// Crew Schedule Lookup (dispatch #123). Pure-logic tests for the directory/search/selection
// helpers, PLUS call-site rendering tests (same standing rule security-panel.test.js's own
// header cites, from #366 — a test that only imports a helper can't tell "built" from "built but
// never wired in").
//
// Dispatch #125 (owner directive, 2026-08-25: "there is no reason to hide names for scheduling
// and punch times > everyone can see this data as-is") removed the click-to-reveal gate and the
// panel-specific RBAC check this file used to test (RevealName / securityPanelAccess /
// loadGmIdentityRevealEnabled — none of those are imported by the panel any more). This file
// replaces those RBAC-gate tests with: (1) proof the panel renders names directly with no reveal
// step, for a synthetic multi-employee dataset, and (2) proof it loads data unconditionally on
// mount (no permState gate blocking the fetch) — the RBAC decision now lives one layer up, at
// src/app/App.js's perm('analytics.store') call site before this panel ever mounts (see
// panel-registry.test.js / shell-nav-snapshot.test.js for that layer).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const loadLifeLenzShiftAssignmentsMock = vi.fn();

vi.mock('../lib/supabase.js', () => ({
  loadLifeLenzShiftAssignments: (...args) => loadLifeLenzShiftAssignmentsMock(...args),
}));

import {
  CrewSchedulePanel, groupShiftAssignmentsByEmployee, filterEmployeeDirectory,
  shiftsForSelected, shortEmployeeId,
} from '../views/crew-schedule-panel.js';

const ROWS = [
  { loc: '0003708', shiftId: 's1', date: '2026-08-26', shiftStart: '2026-08-26T13:00:00.000Z', shiftEnd: '2026-08-26T19:00:00.000Z', assignedEmploymentId: 'E1', employeeName: 'Alice Anderson', roleName: 'Drive Thru', isAbsent: false, updatedAt: '2026-08-25T10:00:00.000Z' },
  { loc: '0003708', shiftId: 's2', date: '2026-08-27', shiftStart: '2026-08-27T13:00:00.000Z', shiftEnd: '2026-08-27T19:00:00.000Z', assignedEmploymentId: 'E1', employeeName: 'Alice Anderson', roleName: 'Lobby', isAbsent: false, updatedAt: '2026-08-25T10:00:00.000Z' },
  { loc: '0003708', shiftId: 's3', date: '2026-08-26', shiftStart: '2026-08-26T11:00:00.000Z', shiftEnd: '2026-08-26T15:00:00.000Z', assignedEmploymentId: 'E2', employeeName: null, roleName: 'Grill', isAbsent: false, updatedAt: '2026-08-25T09:00:00.000Z' },
];

// ── Pure logic ────────────────────────────────────────────────────────────────────────────────

describe('shortEmployeeId — the ID display fallback for a row with no resolved name', () => {
  it('formats the last 5 chars of the employmentId', () => {
    expect(shortEmployeeId('E00012345')).toBe('Employee #12345');
  });
  it('empty/null → Unknown, never a guess', () => {
    expect(shortEmployeeId(null)).toBe('Unknown');
    expect(shortEmployeeId('')).toBe('Unknown');
  });
});

describe('groupShiftAssignmentsByEmployee', () => {
  it('groups by assignedEmploymentId — 2 people from 3 rows', () => {
    const dir = groupShiftAssignmentsByEmployee(ROWS);
    expect(dir.length).toBe(2);
    const alice = dir.find(e => e.key === 'eid:E1');
    expect(alice.employeeName).toBe('Alice Anderson');
    expect(alice.shifts.length).toBe(2);
    const e2 = dir.find(e => e.key === 'eid:E2');
    expect(e2.employeeName).toBeNull();
    expect(e2.shifts.length).toBe(1);
  });
  it('busiest person first (shift count desc)', () => {
    const dir = groupShiftAssignmentsByEmployee(ROWS);
    expect(dir[0].key).toBe('eid:E1'); // 2 shifts beats E2's 1
  });
  it('each person\'s own shifts are sorted by start time', () => {
    const dir = groupShiftAssignmentsByEmployee(ROWS);
    const alice = dir.find(e => e.key === 'eid:E1');
    expect(alice.shifts.map(s => s.shiftId)).toEqual(['s1', 's2']);
  });
  it('a later row\'s resolved name fills in an earlier null, never the reverse', () => {
    const rows = [
      { assignedEmploymentId: 'E9', employeeName: null, shiftId: 'a', shiftStart: '2026-08-26T10:00:00Z' },
      { assignedEmploymentId: 'E9', employeeName: 'Bob Baker', shiftId: 'b', shiftStart: '2026-08-27T10:00:00Z' },
    ];
    const dir = groupShiftAssignmentsByEmployee(rows);
    expect(dir[0].employeeName).toBe('Bob Baker');
  });
  it('empty input → empty directory, not a crash', () => {
    expect(groupShiftAssignmentsByEmployee([])).toEqual([]);
    expect(groupShiftAssignmentsByEmployee(null)).toEqual([]);
  });
});

describe('filterEmployeeDirectory — search operates on ID or name directly, no reveal gate', () => {
  const dir = groupShiftAssignmentsByEmployee(ROWS);

  it('empty query matches everyone', () => {
    expect(filterEmployeeDirectory(dir, '').length).toBe(2);
  });
  it('matches by assignedEmploymentId substring, case-insensitively', () => {
    expect(filterEmployeeDirectory(dir, 'e2').map(e => e.key)).toEqual(['eid:E2']);
  });
  it('matches a resolved name directly — no reveal step required (dispatch #125)', () => {
    expect(filterEmployeeDirectory(dir, 'alice').map(e => e.key)).toEqual(['eid:E1']);
  });
  it('matches case-insensitively and on a partial name', () => {
    expect(filterEmployeeDirectory(dir, 'ANDERSON').map(e => e.key)).toEqual(['eid:E1']);
  });
  it('an employee with no resolved name is never matched by a name query', () => {
    expect(filterEmployeeDirectory(dir, 'zzz')).toEqual([]);
  });
});

describe('shiftsForSelected', () => {
  it('flattens only the selected employees\' shifts, sorted by start time across people', () => {
    const dir = groupShiftAssignmentsByEmployee(ROWS);
    const out = shiftsForSelected(dir, ['eid:E1', 'eid:E2']);
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

// ── Component wiring — proves the panel actually renders names directly, unconditionally ───────

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function flush(container, maxTicks = 15) {
  let last = null;
  for (let i = 0; i < maxTicks; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    if (container.textContent === last) return;
    last = container.textContent;
  }
}

describe('CrewSchedulePanel — no reveal gate, loads unconditionally (dispatch #125)', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadLifeLenzShiftAssignmentsMock.mockReset().mockResolvedValue([]);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('loads the schedule on mount with no permission check in front of it', async () => {
    loadLifeLenzShiftAssignmentsMock.mockResolvedValue(ROWS);
    await act(async () => { root.render(React.createElement(CrewSchedulePanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(loadLifeLenzShiftAssignmentsMock).toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/not permitted/i);
  });

  it('renders a resolved employee name directly in the directory list — no click-to-reveal', async () => {
    loadLifeLenzShiftAssignmentsMock.mockResolvedValue(ROWS);
    await act(async () => { root.render(React.createElement(CrewSchedulePanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/Alice Anderson/);
    // No reveal affordance anywhere in the rendered output.
    expect(container.textContent).not.toMatch(/reveal/i);
  });

  it('an employee with no resolved name falls back to the short employment-id display', async () => {
    loadLifeLenzShiftAssignmentsMock.mockResolvedValue(ROWS);
    await act(async () => { root.render(React.createElement(CrewSchedulePanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/Employee #/);
  });

  it('allowed + loaded: renders the employee directory count and shift count in the subtitle', async () => {
    loadLifeLenzShiftAssignmentsMock.mockResolvedValue(ROWS);
    await act(async () => { root.render(React.createElement(CrewSchedulePanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/2 employees/);
    expect(container.textContent).toMatch(/3 shifts/);
  });

  it('renders the empty-scope message when loaded with zero rows', async () => {
    loadLifeLenzShiftAssignmentsMock.mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(CrewSchedulePanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/no shifts match this scope/i);
    expect(container.textContent).toMatch(/0 employees/);
  });

  it('renders an error message when the load rejects, instead of a silent empty state', async () => {
    loadLifeLenzShiftAssignmentsMock.mockRejectedValue(new Error('network down'));
    await act(async () => { root.render(React.createElement(CrewSchedulePanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/could not load schedule data/i);
  });

  it('selecting an employee renders their upcoming shifts, replacing the empty-selection prompt', async () => {
    loadLifeLenzShiftAssignmentsMock.mockResolvedValue(ROWS);
    await act(async () => { root.render(React.createElement(CrewSchedulePanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/select one or more employees/i);
    const aliceRow = [...container.querySelectorAll('div')].find(el => el.textContent === 'Alice Anderson2 shifts');
    expect(aliceRow).toBeTruthy();
    await act(async () => { aliceRow.click(); });
    await flush(container);
    expect(container.textContent).not.toMatch(/select one or more employees/i);
    expect(container.textContent).toMatch(/Drive Thru/);
    expect(container.textContent).toMatch(/Lobby/);
  });
});
