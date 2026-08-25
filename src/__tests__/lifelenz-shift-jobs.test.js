import { describe, it, expect } from 'vitest';
import {
  rollupShiftsByRole, rollupShiftsByEmployee, computeShiftJobs,
  resolveRoleName, resolveJobTitle, shiftsForEmployeeSchedule,
} from '../engine/lifelenz-shift-jobs.js';

const DT   = '01979dc0-6af3-786a-82a1-17bd10262233'; // Drive Thru
const LOB  = '01979dc0-6a4a-7851-9173-0977a41ac4fe'; // Lobby
const GB   = '01979dc0-6a99-77e5-8cf9-d31da3267511'; // Grill (Breakfast)
const GR   = '01979dc0-6abd-7f7c-92c4-17c9068d57ce'; // Grill (Regular)
const CREW = '01979dc1-f628-7bd6-9439-c855d07e906e'; // Crew Person
const SCH  = '01979dc0-a7cb-7677-a46e-d06dd5d2c7aa';

// Shaped like ShiftsForSchedulePeriod → data.shifts.edges[].node. Segment seconds/earnings
// are real-world consistent ($15/hr: 14400s=4h=$60, 9000s=2.5h=$37.5, etc.).
const edges = [
  { node: { assignedEmploymentId: 'E1', shiftType: 'roster', scheduleId: SCH,
    shiftStartTime: '2026-08-25T13:00:00.000Z', shiftEndTime: '2026-08-25T19:30:00.000Z', pivotMetrics: [
    { businessRoleId: DT, earnings: 60,   seconds: 14400, payType: 'regular' },
    { businessRoleId: DT, earnings: 37.5, seconds: 9000,  payType: 'regular' },
  ] } },
  { node: { assignedEmploymentId: 'E2', shiftType: 'roster', scheduleId: SCH,
    shiftStartTime: '2026-08-26T11:00:00.000Z', shiftEndTime: '2026-08-26T15:30:00.000Z', pivotMetrics: [
    { businessRoleId: GB, earnings: 15,   seconds: 3600,  payType: 'regular' },
    { businessRoleId: GR, earnings: 52.5, seconds: 12600, payType: 'overtime' },
  ] } },
  { node: { assignedEmploymentId: 'E1', shiftType: 'roster', scheduleId: SCH,
    shiftStartTime: '2026-08-27T13:00:00.000Z', shiftEndTime: '2026-08-27T19:30:00.000Z', pivotMetrics: [
    { businessRoleId: LOB, earnings: 30,   seconds: 7200,  payType: 'regular' },
    { businessRoleId: LOB, earnings: 67.5, seconds: 16200, payType: 'regular' },
  ] } },
  // offer (proposal, null earnings) — must be excluded
  { node: { assignedEmploymentId: 'E3', shiftType: 'offer', scheduleId: SCH, pivotMetrics: [
    { businessRoleId: DT, earnings: null, seconds: 14400, payType: 'regular' },
  ] } },
  // committed but on ANOTHER store's schedule (shared-store bleed) — must be excluded
  { node: { assignedEmploymentId: 'E4', shiftType: 'roster', scheduleId: 'OTHER', pivotMetrics: [
    { businessRoleId: DT, earnings: 56, seconds: 14400, payType: 'regular' },
  ] } },
  // REJECTED roster shift: shiftType 'roster' but no assigned employee + null earnings
  // with non-zero seconds — would add phantom $0 hours if not excluded.
  { node: { assignedEmploymentId: null, shiftType: 'roster', scheduleId: SCH, pivotMetrics: [
    { businessRoleId: DT, earnings: null, seconds: 16200, payType: 'regular' },
  ] } },
];
const shifts = { edges };
const roster = [
  { id: 'E1', computedName: 'Alice A', employmentRate: 15, employmentRates: [{ status: 'active', jobTitle: { name: 'CREW PERSON' } }] },
  { id: 'E2', computedName: 'Bob B',   employmentRate: 15, employmentRates: [{ status: 'active', jobTitleId: CREW }] },
];

describe('lifelenz-shift-jobs — per-station rollup', () => {
  const byRole = rollupShiftsByRole(shifts, { scheduleId: SCH });
  const find = id => byRole.find(r => r.businessRoleId === id);

  it('excludes offer shifts, other-schedule bleed, and rejected (unassigned) shifts (4 roles)', () => {
    expect(byRole.length).toBe(4);
    expect(byRole.map(r => r.businessRoleId).sort()).toEqual([DT, LOB, GB, GR].sort());
  });
  it('Drive Thru = 6.5h / $97.50 across 1 shift — the rejected 4.5h shift is NOT counted', () => {
    const r = find(DT);
    expect(r.name).toBe('Drive Thru');
    expect(r.hours).toBeCloseTo(6.5, 6);   // would be 11.0 if the rejected shift leaked in
    expect(r.cost).toBeCloseTo(97.5, 6);
    expect(r.nShifts).toBe(1);
    expect(r.regHours).toBeCloseTo(6.5, 6);
    expect(r.otHours).toBeCloseTo(0, 6);
  });
  it('Lobby folds two segments of one shift into 6.5h / 1 shift', () => {
    const r = find(LOB);
    expect(r.hours).toBeCloseTo(6.5, 6);
    expect(r.nShifts).toBe(1);
  });
  it('overtime segment lands in otHours (Grill Regular = 3.5 OT hrs)', () => {
    const r = find(GR);
    expect(r.name).toBe('Grill Regular Menu');
    expect(r.category).toBe('Variable');
    expect(r.otHours).toBeCloseTo(3.5, 6);
    expect(r.regHours).toBeCloseTo(0, 6);
  });
});

describe('lifelenz-shift-jobs — per-employee rollup', () => {
  const byEmp = rollupShiftsByEmployee(shifts, { scheduleId: SCH, roster });
  const find = id => byEmp.find(e => e.employmentId === id);

  it('E1 aggregates both shifts (13h / $195 / 2 shifts) with name + title', () => {
    const e = find('E1');
    expect(e.name).toBe('Alice A');
    expect(e.jobTitle).toBe('Crew Person'); // title-cased from CREW PERSON
    expect(e.hours).toBeCloseTo(13, 6);
    expect(e.cost).toBeCloseTo(195, 6);
    expect(e.nShifts).toBe(2);
  });
  it('E2 resolves job title via jobTitleId map', () => {
    const e = find('E2');
    expect(e.jobTitle).toBe('Crew Person');
    expect(e.hours).toBeCloseTo(4.5, 6);
  });
});

describe('lifelenz-shift-jobs — totals + name resolution', () => {
  it('computeShiftJobs totals are dollar-weighted', () => {
    const res = computeShiftJobs(shifts, { scheduleId: SCH, roster });
    expect(res.totalHours).toBeCloseTo(17.5, 6);
    expect(res.totalCost).toBeCloseTo(262.5, 6);
    expect(res.avgRate).toBeCloseTo(15, 6); // $262.50 / 17.5h
    expect(res.nEmployees).toBe(2);
  });
  it('resolveRoleName: authoritative name, else short-id fallback', () => {
    expect(resolveRoleName(DT)).toBe('Drive Thru');
    expect(resolveRoleName(GB)).toBe('Grill Breakfast Menu');
    expect(resolveRoleName('01979dc0-0000-0000-0000-000000000abc')).toBe('Role 0abc'); // unknown id
    expect(resolveRoleName(null)).toBe('Unknown');
  });
  it('resolveJobTitle maps known ids', () => {
    expect(resolveJobTitle(CREW)).toBe('Crew Person');
    expect(resolveJobTitle('nope')).toBe(null);
  });
});

// dispatch #123 (Crew Schedule Lookup) -- per-shift rows, not the weekly rollup above.
describe('lifelenz-shift-jobs — shiftsForEmployeeSchedule (per-shift, dispatch #123)', () => {
  it('3 committed shifts (E1×2, E2×1) — offer/bleed/rejected still excluded, same as the rollups', () => {
    const rows = shiftsForEmployeeSchedule(shifts, { scheduleId: SCH, roster });
    expect(rows.length).toBe(3);
  });

  it('sorted by start time, each row carries its own date/start/end (not aggregated)', () => {
    const rows = shiftsForEmployeeSchedule(shifts, { scheduleId: SCH, roster });
    expect(rows.map(r => r.employmentId)).toEqual(['E1', 'E2', 'E1']);
    expect(rows[0].date).toBe('2026-08-25');
    expect(rows[0].startISO).toBe('2026-08-25T13:00:00.000Z');
    expect(rows[0].endISO).toBe('2026-08-25T19:30:00.000Z');
  });

  it('resolves name + jobTitle from the roster, and the primary businessRole for a multi-segment shift', () => {
    const rows = shiftsForEmployeeSchedule(shifts, { scheduleId: SCH, roster });
    const e1first = rows.find(r => r.employmentId === 'E1' && r.date === '2026-08-25');
    expect(e1first.name).toBe('Alice A');
    expect(e1first.jobTitle).toBe('Crew Person');
    expect(e1first.businessRoleId).toBe(DT);
    expect(e1first.roleName).toBe('Drive Thru');
    expect(e1first.category).toBe('Variable');
  });

  it('an employee with no roster entry gets name:null — the pull script\'s own graceful-degrade case', () => {
    const rows = shiftsForEmployeeSchedule(shifts, { scheduleId: SCH, roster: [] });
    expect(rows.every(r => r.name === null)).toBe(true);
    expect(rows.every(r => r.employmentId)).toBe(true); // the ID key survives regardless
  });

  it('a committed shift missing shiftStartTime/shiftEndTime is skipped, not guessed at', () => {
    const noTimes = { edges: [
      { node: { assignedEmploymentId: 'E9', shiftType: 'roster', scheduleId: SCH, pivotMetrics: [
        { businessRoleId: DT, earnings: 10, seconds: 3600, payType: 'regular' },
      ] } }, // no shiftStartTime/shiftEndTime at all
    ] };
    expect(shiftsForEmployeeSchedule(noTimes, { scheduleId: SCH })).toEqual([]);
  });
});
