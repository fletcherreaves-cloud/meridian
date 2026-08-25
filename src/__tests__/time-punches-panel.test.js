// @vitest-environment happy-dom
// @ts-nocheck
// Time Punches (dispatch #138). Pure-logic tests for the directory/pairing/search/selection
// helpers, PLUS call-site rendering tests (same standing rule crew-schedule-panel.test.js's own
// header cites, from #366 — a test that only imports a helper can't tell "built" from "built but
// never wired in").
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const loadPunchTimesMock = vi.fn();

vi.mock('../lib/supabase.js', () => ({
  loadPunchTimes: (...args) => loadPunchTimesMock(...args),
}));

import {
  TimePunchesPanel, shortEmployeeId, punchBusinessDay, punchKey, pairPunchesByShift,
  groupPunchesByEmployee, filterPunchDirectory, punchesForSelected,
} from '../views/time-punches-panel.js';

// Shape mirrors loadPunchTimes' return, and the real pairing observed live 2026-08-25 (dispatch
// #138 grounding read, geid 200165491 @ loc 0024471): a 'shift' row spanning the whole shift, and
// a 'meal' row whose start/end falls strictly inside that window. All timestamps below sit in the
// same business day (2026-08-26, 4am-4am) except E3's second shift, which is the next day.
const ROWS = [
  { loc: '0003708', geid: 'E1', employeeName: 'Alice Anderson', punchType: 'shift', isPaidBreak: null, startDateTime: '2026-08-26T13:00:00.000Z', endDateTime: '2026-08-26T21:00:00.000Z', inModified: false, outModified: false, updatedAt: '2026-08-26T21:05:00.000Z' },
  { loc: '0003708', geid: 'E1', employeeName: 'Alice Anderson', punchType: 'meal', isPaidBreak: false, startDateTime: '2026-08-26T17:00:00.000Z', endDateTime: '2026-08-26T17:30:00.000Z', inModified: false, outModified: false, updatedAt: '2026-08-26T17:31:00.000Z' },
  { loc: '0003708', geid: 'E2', employeeName: null, punchType: 'shift', isPaidBreak: null, startDateTime: '2026-08-26T11:00:00.000Z', endDateTime: '2026-08-26T19:00:00.000Z', inModified: true, outModified: false, updatedAt: '2026-08-26T19:02:00.000Z' },
  // An unmatched meal — no enclosing shift for E2 at this start time (starts before E2's shift).
  { loc: '0003708', geid: 'E2', employeeName: null, punchType: 'meal', isPaidBreak: false, startDateTime: '2026-08-26T05:00:00.000Z', endDateTime: '2026-08-26T05:30:00.000Z', inModified: false, outModified: true, updatedAt: '2026-08-26T05:31:00.000Z' },
];

// ── Pure logic ────────────────────────────────────────────────────────────────────────────────

describe('shortEmployeeId', () => {
  it('formats the last 5 chars of the geid', () => {
    expect(shortEmployeeId('200165491')).toBe('Employee #65491');
  });
  it('empty/null → Unknown, never a guess', () => {
    expect(shortEmployeeId(null)).toBe('Unknown');
    expect(shortEmployeeId('')).toBe('Unknown');
  });
});

describe('punchBusinessDay — the shared businessDate() cutover, applied to the punch start', () => {
  it('a punch starting well after 4am belongs to that calendar day', () => {
    expect(punchBusinessDay({ startDateTime: '2026-08-26T13:00:00.000Z' })).toBe('2026-08-26');
  });
  it('a punch starting before 4am belongs to the PREVIOUS business day', () => {
    expect(punchBusinessDay({ startDateTime: '2026-08-26T02:00:00.000Z' })).toBe('2026-08-25');
  });
  it('missing/invalid timestamp → null, not a guess', () => {
    expect(punchBusinessDay({})).toBeNull();
    expect(punchBusinessDay({ startDateTime: 'not-a-date' })).toBeNull();
  });
});

describe('punchKey — stable key given the table has no punch id', () => {
  it('is loc+geid+punchType+startDateTime', () => {
    expect(punchKey(ROWS[0])).toBe('0003708|E1|shift|2026-08-26T13:00:00.000Z');
  });
});

describe('pairPunchesByShift — the meal-pairing rule (dispatch #138 grounding read)', () => {
  it('nests a meal under the shift punch (same geid) whose window contains the meal start', () => {
    const { shifts } = pairPunchesByShift(ROWS.filter(r => r.geid === 'E1'));
    expect(shifts.length).toBe(1);
    expect(shifts[0].meals.length).toBe(1);
    expect(shifts[0].meals[0].startDateTime).toBe('2026-08-26T17:00:00.000Z');
  });
  it('a meal with no enclosing shift is returned as unmatched, never dropped or misattributed', () => {
    const { shifts, unmatchedMeals } = pairPunchesByShift(ROWS.filter(r => r.geid === 'E2'));
    expect(shifts.length).toBe(1);
    expect(shifts[0].meals.length).toBe(0);
    expect(unmatchedMeals.length).toBe(1);
    expect(unmatchedMeals[0].startDateTime).toBe('2026-08-26T05:00:00.000Z');
  });
  it('empty input → no shifts, no unmatched meals, not a crash', () => {
    expect(pairPunchesByShift([])).toEqual({ shifts: [], unmatchedMeals: [] });
    expect(pairPunchesByShift(null)).toEqual({ shifts: [], unmatchedMeals: [] });
  });
});

describe('groupPunchesByEmployee', () => {
  it('groups by geid — 2 people from 4 rows', () => {
    const dir = groupPunchesByEmployee(ROWS);
    expect(dir.length).toBe(2);
    const alice = dir.find(e => e.key === 'geid:E1');
    expect(alice.employeeName).toBe('Alice Anderson');
    expect(alice.shifts.length).toBe(1);
    expect(alice.shifts[0].meals.length).toBe(1);
    const e2 = dir.find(e => e.key === 'geid:E2');
    expect(e2.employeeName).toBeNull();
    expect(e2.unmatchedMeals.length).toBe(1);
  });
  it('a later row\'s resolved name fills in an earlier null, never the reverse', () => {
    const rows = [
      { loc: '0003708', geid: 'E9', employeeName: null, punchType: 'shift', startDateTime: '2026-08-26T10:00:00Z', endDateTime: '2026-08-26T14:00:00Z' },
      { loc: '0003708', geid: 'E9', employeeName: 'Bob Baker', punchType: 'shift', startDateTime: '2026-08-27T10:00:00Z', endDateTime: '2026-08-27T14:00:00Z' },
    ];
    const dir = groupPunchesByEmployee(rows);
    expect(dir[0].employeeName).toBe('Bob Baker');
  });
  it('empty input → empty directory, not a crash', () => {
    expect(groupPunchesByEmployee([])).toEqual([]);
    expect(groupPunchesByEmployee(null)).toEqual([]);
  });
});

describe('filterPunchDirectory — search operates on geid or name directly, no reveal gate', () => {
  const dir = groupPunchesByEmployee(ROWS);
  it('empty query matches everyone', () => {
    expect(filterPunchDirectory(dir, '').length).toBe(2);
  });
  it('matches by geid substring, case-insensitively', () => {
    expect(filterPunchDirectory(dir, 'e2').map(e => e.key)).toEqual(['geid:E2']);
  });
  it('matches a resolved name directly — no reveal step required', () => {
    expect(filterPunchDirectory(dir, 'alice').map(e => e.key)).toEqual(['geid:E1']);
  });
  it('an employee with no resolved name is never matched by a name query', () => {
    expect(filterPunchDirectory(dir, 'zzz')).toEqual([]);
  });
});

describe('punchesForSelected', () => {
  it('flattens shifts (with nested meals) plus unmatched meals for selected employees', () => {
    const dir = groupPunchesByEmployee(ROWS);
    const out = punchesForSelected(dir, ['geid:E1', 'geid:E2']);
    // E2's unmatched meal (05:00) sorts before both shifts (11:00, 13:00).
    expect(out.map(p => p.startDateTime)).toEqual([
      '2026-08-26T05:00:00.000Z', '2026-08-26T11:00:00.000Z', '2026-08-26T13:00:00.000Z',
    ]);
    expect(out[0].unmatched).toBe(true);
    expect(out[2].meals.length).toBe(1);
  });
  it('no selection -> empty', () => {
    const dir = groupPunchesByEmployee(ROWS);
    expect(punchesForSelected(dir, [])).toEqual([]);
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

describe('TimePunchesPanel — no reveal gate, loads unconditionally, shows meal pairing + edit flags', () => {
  let container, root;
  beforeEach(() => {
    // Pin "now" so the panel's default DateRangeControl window (trailing 7 days ending at the
    // last CLOSED business day) reliably covers ROWS' fixed 2026-08-26 dates regardless of the
    // real wall-clock date the suite happens to run on — same reasoning as crew-schedule-panel's
    // own fixture dates being anchored near its authoring date, made explicit here via fake time
    // instead of an implicit coincidence.
    vi.setSystemTime(new Date('2026-08-27T12:00:00.000Z'));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadPunchTimesMock.mockReset().mockResolvedValue([]);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.useRealTimers();
  });

  it('loads punches on mount with no permission check in front of it', async () => {
    loadPunchTimesMock.mockResolvedValue(ROWS);
    await act(async () => { root.render(React.createElement(TimePunchesPanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(loadPunchTimesMock).toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/not permitted/i);
  });

  it('renders a resolved employee name directly in the directory list — no click-to-reveal', async () => {
    loadPunchTimesMock.mockResolvedValue(ROWS);
    await act(async () => { root.render(React.createElement(TimePunchesPanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/Alice Anderson/);
    expect(container.textContent).not.toMatch(/reveal/i);
  });

  it('an employee with no resolved name falls back to the short geid display', async () => {
    loadPunchTimesMock.mockResolvedValue(ROWS);
    await act(async () => { root.render(React.createElement(TimePunchesPanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/Employee #/);
  });

  it('selecting an employee renders their shift with the meal nested under it, and the edit flag for the modified shift', async () => {
    loadPunchTimesMock.mockResolvedValue(ROWS);
    await act(async () => { root.render(React.createElement(TimePunchesPanel, { onClose: vi.fn() })); });
    await flush(container);
    const e2Row = [...container.querySelectorAll('div')].find(el => el.textContent === 'Employee #E2' + '1 shift');
    expect(e2Row).toBeTruthy();
    await act(async () => { e2Row.click(); });
    await flush(container);
    // E2's shift punch was in_modified -- the edit flag must render.
    expect(container.textContent).toMatch(/IN edited/);
    // E2's meal is unmatched -- it must still show up, flagged as unmatched, not dropped.
    expect(container.textContent).toMatch(/unmatched/i);
    expect(container.textContent).toMatch(/OUT edited/);
  });

  it('renders the empty-scope message when loaded with zero rows', async () => {
    loadPunchTimesMock.mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(TimePunchesPanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/no punches match this scope/i);
    expect(container.textContent).toMatch(/0 employees/);
  });

  it('renders an error message when the load rejects, instead of a silent empty state', async () => {
    loadPunchTimesMock.mockRejectedValue(new Error('network down'));
    await act(async () => { root.render(React.createElement(TimePunchesPanel, { onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/could not load punch data/i);
  });
});
