// @vitest-environment happy-dom
// @ts-nocheck
// Owner follow-up (2026-11-11) to the OEPE hour-level drill-down (task #132-adjacent messaging
// work): "we should use [hour-pinpoint attribution] sparingly... We can also list out all
// managers present every time... I am no longer concerned about masking names except for the
// rule about masking when it self incriminates a user to that role or someone below them.
// Revealing upstream is useful and warranted."
//
// Tests the two pure pieces this directive translates into (src/engine/shift-roster.js):
// managersOnDuty() (the "list managers present every time" ask) and canRevealAttributedName()
// (the one masking exception that survives -- reveal only strictly upstream of the named
// person's approximate role).
import { describe, it, expect } from 'vitest';
import { managersOnDuty, approxLadderRungForJobTitle, canRevealAttributedName } from '../engine/shift-roster.js';

describe('approxLadderRungForJobTitle()', () => {
  it('maps a General Manager job title to the gm rung', () => {
    expect(approxLadderRungForJobTitle('General Manager')).toBe('gm');
  });
  it('maps any other manager-shaped title to sm_am_dm', () => {
    expect(approxLadderRungForJobTitle('Cert. Swing Mgr.')).toBe('sm_am_dm');
    expect(approxLadderRungForJobTitle('Shift Manager Trainee')).toBe('sm_am_dm');
    expect(approxLadderRungForJobTitle('Dept Mgr I')).toBe('sm_am_dm');
  });
  it('crew titles have no ladder rung at all', () => {
    expect(approxLadderRungForJobTitle('Crew Person')).toBeNull();
    expect(approxLadderRungForJobTitle('Crew Trainer')).toBeNull();
    expect(approxLadderRungForJobTitle(null)).toBeNull();
    expect(approxLadderRungForJobTitle('')).toBeNull();
  });
});

describe('canRevealAttributedName() — reveal only strictly upstream of the named person\'s rung', () => {
  it('a crew member\'s name is never masked, for any viewer', () => {
    expect(canRevealAttributedName('Crew Person', 'sm_am_dm')).toBe(true);
    expect(canRevealAttributedName('Crew Person', 'gm')).toBe(true);
    expect(canRevealAttributedName('Crew Person', undefined)).toBe(true);
  });
  it('a GM\'s name is masked from a peer GM and from their own subordinate (sm_am_dm)', () => {
    expect(canRevealAttributedName('General Manager', 'gm')).toBe(false);
    expect(canRevealAttributedName('General Manager', 'sm_am_dm')).toBe(false);
  });
  it('a GM\'s name is revealed to every role genuinely upstream of a GM', () => {
    expect(canRevealAttributedName('General Manager', 'area_supervisor')).toBe(true);
    expect(canRevealAttributedName('General Manager', 'om')).toBe(true);
    expect(canRevealAttributedName('General Manager', 'do')).toBe(true);
    expect(canRevealAttributedName('General Manager', 'vp')).toBe(true);
  });
  it('a Shift Manager\'s name is revealed to the store\'s own GM (upstream) but masked from a peer shift manager', () => {
    expect(canRevealAttributedName('Shift Manager Trainee', 'gm')).toBe(true);
    expect(canRevealAttributedName('Shift Manager Trainee', 'sm_am_dm')).toBe(false);
  });
  it('admin/owner always reveal, root-override style (same precedent as canOverrideLockedActual)', () => {
    expect(canRevealAttributedName('General Manager', 'admin')).toBe(true);
    expect(canRevealAttributedName('General Manager', 'owner')).toBe(true);
  });
});

describe('managersOnDuty() — "list out all managers present every time"', () => {
  it('picks out only manager-tier rows, excluding crew and absent rows, sorted by shift start', () => {
    const rows = [
      { employeeName: 'Pat GM', jobTitle: 'General Manager', shiftStart: '2026-11-11T13:00:00Z', shiftEnd: '2026-11-11T21:00:00Z', isAbsent: false, assignedEmploymentId: '1' },
      { employeeName: 'Sam Swing', jobTitle: 'Cert. Swing Mgr.', shiftStart: '2026-11-11T20:00:00Z', shiftEnd: '2026-11-12T02:00:00Z', isAbsent: false, assignedEmploymentId: '2' },
      { employeeName: 'Crew A', jobTitle: 'Crew Person', shiftStart: '2026-11-11T14:00:00Z', shiftEnd: '2026-11-11T18:00:00Z', isAbsent: false, assignedEmploymentId: '3' },
      { employeeName: 'Absent Mgr', jobTitle: 'Dept Mgr I', shiftStart: '2026-11-11T12:00:00Z', shiftEnd: '2026-11-11T20:00:00Z', isAbsent: true, assignedEmploymentId: '4' },
    ];
    const out = managersOnDuty(rows);
    expect(out.map(m => m.name)).toEqual(['Pat GM', 'Sam Swing']); // crew + absent manager excluded, sorted by shiftStart
    expect(out[0].rung).toBe('gm');
    expect(out[1].rung).toBe('sm_am_dm');
  });

  it('dedupes the same person split across multiple business-role rows, keeping the earliest shift start', () => {
    const rows = [
      { employeeName: 'Pat GM', jobTitle: 'General Manager', shiftStart: '2026-11-11T18:00:00Z', shiftEnd: '2026-11-11T20:00:00Z', isAbsent: false, assignedEmploymentId: '1' },
      { employeeName: 'Pat GM', jobTitle: 'General Manager', shiftStart: '2026-11-11T13:00:00Z', shiftEnd: '2026-11-11T18:00:00Z', isAbsent: false, assignedEmploymentId: '1' },
    ];
    const out = managersOnDuty(rows);
    expect(out).toHaveLength(1);
    expect(out[0].shiftStart).toBe('2026-11-11T13:00:00Z');
  });

  it('falls back to "Employee #<id>" when employee_name is null (unmatched roster row)', () => {
    const rows = [{ employeeName: null, jobTitle: 'General Manager', shiftStart: '2026-11-11T13:00:00Z', shiftEnd: '2026-11-11T20:00:00Z', isAbsent: false, assignedEmploymentId: '99' }];
    expect(managersOnDuty(rows)[0].name).toBe('Employee #99');
  });

  it('returns an empty array for no rows / no managers at all', () => {
    expect(managersOnDuty([])).toEqual([]);
    expect(managersOnDuty(null)).toEqual([]);
    expect(managersOnDuty([{ employeeName: 'Crew A', jobTitle: 'Crew Person', isAbsent: false }])).toEqual([]);
  });
});
