// @vitest-environment happy-dom
// @ts-nocheck
// Real production bug (measured live, 2026-11-11, service-role read against
// lifelenz_shift_assignments): job_title is null in ALL 88,908 real rows. Root cause: the roster
// lookup scripts/lifelenz-pull.mjs's pullShiftAssignments() uses (GetSchedulableEmploymentsForPeriod)
// deliberately requests ONLY `{ id computedName firstName lastName }` (PII-minimization, see that
// query's own header comment) -- never a title field -- so _primaryJobTitle() always fell through
// to null. This silently broke the "Managers On Duty" feature shipped the same day (PR #1839):
// managersOnDuty() filters on approxLadderRungForJobTitle(row.jobTitle), which is always null ->
// always excluded -> the feature rendered nothing for any real store.
//
// Fix does NOT touch the roster GraphQL query (a wrong field there has broken production before,
// per dispatch #137's own comment on this same file). Instead: lifelenz_employee_roster (a
// SEPARATE pull, owner request 2026-11-05) already carries a real job_title_code per employee,
// and its person_key IS the same assignedEmploymentId shift rows carry whenever resolution
// succeeded -- confirmed live, not assumed. This tests the pure join (engine/lifelenz-shift-jobs.js)
// end to end on its own output shape.
import { describe, it, expect } from 'vitest';
import { enrichRowsWithJobTitleByEmploymentId, resolveJobTitleByCode, JOB_TITLE_CODE_NAMES } from '../engine/lifelenz-shift-jobs.js';

describe('resolveJobTitleByCode() — confirmed codes only, never a fabricated name', () => {
  it('resolves every code confirmed against real lifelenz_employee_roster data', () => {
    expect(resolveJobTitleByCode('00641')).toBe('General Manager');
    expect(resolveJobTitleByCode('00650')).toBe('Crew Person');
  });
  it('returns null for a real-but-unmapped code rather than guessing a name', () => {
    // '00671'/'10002' are confirmed live values with no confirmed name -- see the map's own
    // header comment. Must stay unresolved, not fabricated.
    expect(resolveJobTitleByCode('00671')).toBeNull();
    expect(resolveJobTitleByCode('10002')).toBeNull();
  });
  it('returns null for a missing/empty code', () => {
    expect(resolveJobTitleByCode(null)).toBeNull();
    expect(resolveJobTitleByCode('')).toBeNull();
  });
});

describe('enrichRowsWithJobTitleByEmploymentId() — the real join, on shiftsForEmployeeSchedule\'s own row shape', () => {
  it('backfills jobTitle by matching person_key (a real employment id) to row.employmentId', () => {
    const rows = [
      { employmentId: 'emp-1', name: 'Pat GM', jobTitle: null },
      { employmentId: 'emp-2', name: 'Sam Crew', jobTitle: null },
    ];
    const rosterRows = [
      { person_key: 'emp-1', job_title_code: '00641' },
      { person_key: 'emp-2', job_title_code: '00650' },
    ];
    const out = enrichRowsWithJobTitleByEmploymentId(rows, rosterRows);
    expect(out[0].jobTitle).toBe('General Manager');
    expect(out[1].jobTitle).toBe('Crew Person');
  });

  it('never trusts a synthetic name:-prefixed person_key as a join key (resolveRosterPersonKeys\' own unresolved/ambiguous fallback)', () => {
    const rows = [{ employmentId: 'name:pat gm', name: 'Pat GM', jobTitle: null }];
    const rosterRows = [{ person_key: 'name:pat gm', job_title_code: '00641' }];
    // The row's own employmentId happening to look like a synthetic key is irrelevant here --
    // the real guard is on the ROSTER row's person_key, confirmed via a row whose employmentId
    // is a real id but the only roster entry for it is synthetic.
    const rows2 = [{ employmentId: 'emp-3', name: 'Pat GM', jobTitle: null }];
    const rosterRows2 = [{ person_key: 'name:pat gm', job_title_code: '00641' }];
    expect(enrichRowsWithJobTitleByEmploymentId(rows2, rosterRows2)[0].jobTitle).toBeNull();
    expect(enrichRowsWithJobTitleByEmploymentId(rows, rosterRows)[0].jobTitle).toBeNull();
  });

  it('never overwrites an already-resolved jobTitle', () => {
    const rows = [{ employmentId: 'emp-1', jobTitle: 'Already Resolved' }];
    const rosterRows = [{ person_key: 'emp-1', job_title_code: '00641' }];
    expect(enrichRowsWithJobTitleByEmploymentId(rows, rosterRows)[0].jobTitle).toBe('Already Resolved');
  });

  it('leaves jobTitle null when the employment id has no roster match (new hire, not yet rostered)', () => {
    const rows = [{ employmentId: 'emp-unmatched', jobTitle: null }];
    expect(enrichRowsWithJobTitleByEmploymentId(rows, [{ person_key: 'emp-1', job_title_code: '00641' }])[0].jobTitle).toBeNull();
  });

  it('leaves jobTitle null when the matched code has no confirmed name (never fabricates)', () => {
    const rows = [{ employmentId: 'emp-1', jobTitle: null }];
    const rosterRows = [{ person_key: 'emp-1', job_title_code: '00671' }];
    expect(enrichRowsWithJobTitleByEmploymentId(rows, rosterRows)[0].jobTitle).toBeNull();
  });

  it('handles empty/missing inputs without throwing', () => {
    expect(enrichRowsWithJobTitleByEmploymentId([], [])).toEqual([]);
    expect(enrichRowsWithJobTitleByEmploymentId(null, null)).toEqual([]);
    expect(enrichRowsWithJobTitleByEmploymentId([{ employmentId: 'emp-1', jobTitle: null }], null)).toEqual([{ employmentId: 'emp-1', jobTitle: null }]);
  });
});

describe('Regression guard: this is exactly what unblocks "Managers On Duty" (PR #1839)', () => {
  it('a GM row enriched by this join is now classified as manager-tier by shift-roster.js\'s own approxLadderRungForJobTitle', async () => {
    const { approxLadderRungForJobTitle } = await import('../engine/shift-roster.js');
    const rows = [{ employmentId: 'emp-1', jobTitle: null }];
    const rosterRows = [{ person_key: 'emp-1', job_title_code: '00641' }];
    const [enriched] = enrichRowsWithJobTitleByEmploymentId(rows, rosterRows);
    expect(approxLadderRungForJobTitle(enriched.jobTitle)).toBe('gm');
  });
});
