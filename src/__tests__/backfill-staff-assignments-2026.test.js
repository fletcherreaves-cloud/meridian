// @ts-nocheck
// Dispatch #150 (Performance Review continuity, Phase 3a) — pure backfill logic from
// scripts/backfill-staff-assignments-2026.mjs, tested directly (no supabase/fetch dependency in
// these functions — same reasoning employee-roster-tenure-pull.test.js already gives for testing
// a scripts/ module this way; this repo's test env has no live Supabase access). All fixtures
// are 100% synthetic — no real geid, name, or pay rate, matching this repo's standing PII-fixture
// discipline.
import { describe, it, expect } from 'vitest';
import {
  classifyRosterAssignment, isActiveTenureRow, rosterRowToAssignment, asSeedAssignments,
  buildBackfillRows, GM_JOB_CODES, DM_AM_JOB_CODES, SM_JOB_CODES,
} from '../../scripts/backfill-staff-assignments-2026.mjs';

// A synthetic qsr_employee_tenure-shaped row (real DB column names — supabase/schema-qsr-
// employee-tenure.sql), all fields present unless overridden.
function tenureRow(overrides = {}) {
  return {
    loc: '0003708',
    geid: '900001',
    full_employee_name: 'Test Person',
    employment_status: 'Active',
    job_title_code: 641,
    job_title_code_description: 'GENERAL MANAGER',
    hourly_pay_rate: null,
    store_start_date: '2024-01-15',
    job_title_code_start_date: '2024-01-15',
    termination_entry_date: null,
    ...overrides,
  };
}

describe('classifyRosterAssignment — job-title-code -> review role (plan doc decision #5)', () => {
  it('GM codes (45, 641) -> role gm, reviewRole GM, regardless of pay rate', () => {
    for (const code of GM_JOB_CODES) {
      expect(classifyRosterAssignment(tenureRow({ job_title_code: code, hourly_pay_rate: 18.5 })))
        .toEqual({ role: 'gm', reviewRole: 'GM' });
    }
  });

  it('SM code (647) -> role sm_am_dm, reviewRole SM', () => {
    for (const code of SM_JOB_CODES) {
      expect(classifyRosterAssignment(tenureRow({ job_title_code: code })))
        .toEqual({ role: 'sm_am_dm', reviewRole: 'SM' });
    }
  });

  it('DM/AM-bucket codes with hourly_pay_rate 0 or null -> AM (salaried)', () => {
    for (const code of DM_AM_JOB_CODES) {
      expect(classifyRosterAssignment(tenureRow({ job_title_code: code, hourly_pay_rate: 0 })))
        .toEqual({ role: 'sm_am_dm', reviewRole: 'AM' });
      expect(classifyRosterAssignment(tenureRow({ job_title_code: code, hourly_pay_rate: null })))
        .toEqual({ role: 'sm_am_dm', reviewRole: 'AM' });
    }
  });

  it('DM/AM-bucket codes with a nonzero hourly_pay_rate -> DM (hourly)', () => {
    for (const code of DM_AM_JOB_CODES) {
      expect(classifyRosterAssignment(tenureRow({ job_title_code: code, hourly_pay_rate: 15.25 })))
        .toEqual({ role: 'sm_am_dm', reviewRole: 'DM' });
    }
  });

  it('AM and DM fold onto the SAME ladder rung — only reviewRole differs', () => {
    const am = classifyRosterAssignment(tenureRow({ job_title_code: 845, hourly_pay_rate: 0 }));
    const dm = classifyRosterAssignment(tenureRow({ job_title_code: 845, hourly_pay_rate: 15.25 }));
    expect(am.role).toBe(dm.role);
    expect(am.reviewRole).not.toBe(dm.reviewRole);
  });

  it('a non-review-eligible job code (e.g. crew) returns null', () => {
    expect(classifyRosterAssignment(tenureRow({ job_title_code: 650, job_title_code_description: 'CREW PERSON' }))).toBeNull();
  });

  it('a null/missing job_title_code returns null, not a throw', () => {
    expect(classifyRosterAssignment(tenureRow({ job_title_code: null }))).toBeNull();
    expect(classifyRosterAssignment(null)).toBeNull();
  });

  it("code 45 (GENERAL MANAGER W/ MGR PUNCHES) stays GM even when hourly-tracked — the plan doc's explicit wrinkle", () => {
    expect(classifyRosterAssignment(tenureRow({ job_title_code: 45, hourly_pay_rate: 12.0 })))
      .toEqual({ role: 'gm', reviewRole: 'GM' });
  });
});

describe('isActiveTenureRow', () => {
  it('active, no termination date -> true', () => {
    expect(isActiveTenureRow(tenureRow())).toBe(true);
  });
  it('a termination_entry_date, even if status still reads Active -> false', () => {
    expect(isActiveTenureRow(tenureRow({ termination_entry_date: '2026-05-01' }))).toBe(false);
  });
  it('"Inactive" is NOT matched by a substring check on "active"', () => {
    expect(isActiveTenureRow(tenureRow({ employment_status: 'Inactive' }))).toBe(false);
  });
  it('null row -> false, not a throw', () => {
    expect(isActiveTenureRow(null)).toBe(false);
  });
});

describe('rosterRowToAssignment — one tenure row -> one staff_assignments row', () => {
  it('a clean active GM row produces a role=gm store assignment, loc unpadded, person=geid', () => {
    const row = rosterRowToAssignment(tenureRow());
    expect(row).toMatchObject({ person: '900001', role: 'gm', target_type: 'store', target: '3708', start_date: '2024-01-15' });
    expect(row.notes).toMatch(/suggested review role GM/);
  });

  it('start_date is the LATER of store_start_date and job_title_code_start_date', () => {
    const promoted = rosterRowToAssignment(tenureRow({ store_start_date: '2020-01-01', job_title_code_start_date: '2026-03-01' }));
    expect(promoted.start_date).toBe('2026-03-01'); // in-place promotion, later than the old store-join date

    const transferred = rosterRowToAssignment(tenureRow({ store_start_date: '2026-06-15', job_title_code_start_date: '2019-01-01' }));
    expect(transferred.start_date).toBe('2026-06-15'); // same-role transfer, later than the old role-start date
  });

  it('an inactive person produces no row', () => {
    expect(rosterRowToAssignment(tenureRow({ termination_entry_date: '2026-01-01' }))).toBeNull();
  });

  it('a non-review-eligible job code produces no row', () => {
    expect(rosterRowToAssignment(tenureRow({ job_title_code: 650 }))).toBeNull();
  });

  it('missing BOTH start dates produces no row rather than a fabricated date', () => {
    expect(rosterRowToAssignment(tenureRow({ store_start_date: null, job_title_code_start_date: null }))).toBeNull();
  });

  it('a missing geid produces no row rather than a placeholder key', () => {
    expect(rosterRowToAssignment(tenureRow({ geid: null }))).toBeNull();
    expect(rosterRowToAssignment(tenureRow({ geid: '' }))).toBeNull();
  });
});

describe('asSeedAssignments — Area Supervisors from the existing orgAssignments() timeline', () => {
  it('an always-effective ("") seed row gets start_date 2026-01-01 (the backfill year floor)', () => {
    const [row] = asSeedAssignments([{ loc: '3708', supervisor: 'Robert Spencer', start: '' }]);
    expect(row).toMatchObject({ person: 'Robert Spencer', role: 'area_supervisor', target_type: 'store', target: '3708', start_date: '2026-01-01' });
  });

  it('a real in-2026 reassignment date is preserved, not overwritten by the floor', () => {
    const [row] = asSeedAssignments([{ loc: '6178', supervisor: 'Mary', start: '2026-07-22' }]);
    expect(row.start_date).toBe('2026-07-22');
  });

  it('a pre-2026 start is clamped to the backfill year floor, not left in the past', () => {
    const [row] = asSeedAssignments([{ loc: '6178', supervisor: 'Brad', start: '2019-03-01' }]);
    expect(row.start_date).toBe('2026-01-01');
  });

  it('multiple stores for the same supervisor become multiple rows', () => {
    const rows = asSeedAssignments([
      { loc: '3708', supervisor: 'Robert Spencer', start: '' },
      { loc: '6972', supervisor: 'Robert Spencer', start: '' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.target).sort()).toEqual(['3708', '6972']);
  });

  it('empty/null input yields an empty array, not a throw', () => {
    expect(asSeedAssignments([])).toEqual([]);
    expect(asSeedAssignments(null)).toEqual([]);
  });
});

describe('buildBackfillRows — combined roster + AS-seed output', () => {
  it('merges roster-derived and AS-seeded rows into one list', () => {
    const rows = buildBackfillRows({
      tenureRows: [tenureRow()],
      orgAssignmentRows: [{ loc: '6972', supervisor: 'Robert Spencer', start: '' }],
    });
    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.role === 'gm')).toBeTruthy();
    expect(rows.find(r => r.role === 'area_supervisor')).toBeTruthy();
  });

  it('drops inactive / non-eligible / undated roster rows while keeping the eligible ones', () => {
    const rows = buildBackfillRows({
      tenureRows: [
        tenureRow({ geid: '1', job_title_code: 641 }),                         // eligible GM
        tenureRow({ geid: '2', job_title_code: 650 }),                         // crew — dropped
        tenureRow({ geid: '3', job_title_code: 647, termination_entry_date: '2026-01-01' }), // terminated — dropped
      ],
      orgAssignmentRows: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].person).toBe('1');
  });

  it('OM/DO never appear — no seed data exists for them in this backfill (dispatch #150 scope note)', () => {
    const rows = buildBackfillRows({
      tenureRows: [tenureRow()],
      orgAssignmentRows: [{ loc: '3708', supervisor: 'Robert Spencer', start: '' }],
    });
    expect(rows.some(r => r.role === 'om')).toBe(false);
    expect(rows.some(r => r.role === 'do')).toBe(false);
  });

  it('empty inputs yield an empty array', () => {
    expect(buildBackfillRows({})).toEqual([]);
    expect(buildBackfillRows()).toEqual([]);
  });
});
