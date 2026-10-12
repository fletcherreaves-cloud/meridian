// @ts-nocheck
// LABOR-001/002/003 (schema-security-rules-labor.sql, scripts/security-rules-run.mjs's own
// "── LABOR ──" section) -- same testing precedent as security-rules-run.test.js: pure functions,
// no Supabase dependency, hand-computed expected values in each test's own comment.
import { describe, it, expect } from 'vitest';
import {
  mapPunchEditRow, mapTenureRow, mapPunchTimeDateRow,
  supportsLaborGhost, supportsLaborSelfApproval, supportsLaborManagerRate,
  joinPunchEditsWithTenure, computeLaborEmployeeFindingsForRule,
  buildLocDatePunchIndex, joinManagerEditsWithPunchVolume, computeManagerEditFindingsForRule,
} from '../../scripts/security-rules-run.mjs';

describe('mapPunchEditRow() — snake_case lifelenz_punch_edits row -> camelCase, plus the inline selfApprovalFlag', () => {
  it('maps every column and derives date from modified_at', () => {
    const r = mapPunchEditRow({
      loc: '0013113', geid: '200668686', employee_name: 'Jordan Smith', manager_modified: 'Casey Diaz',
      adjustment_type: 'Edit', original_punch_at: '2026-10-08 08:00:00', adjusted_punch_at: '2026-10-08 08:15:00',
      modified_at: '2026-10-09 15:29:00',
    });
    expect(r).toMatchObject({
      loc: '0013113', geid: '200668686', employeeName: 'Jordan Smith', managerModified: 'Casey Diaz',
      adjustmentType: 'Edit', originalPunchAt: '2026-10-08 08:00:00', adjustedPunchAt: '2026-10-08 08:15:00',
      modifiedAt: '2026-10-09 15:29:00', date: '2026-10-09', selfApprovalFlag: 0,
    });
  });
  it('selfApprovalFlag is 1 when the edited employee and the editing manager name-match (case/space insensitive)', () => {
    expect(mapPunchEditRow({ loc: 'A', geid: '1', employee_name: 'Casey Diaz', manager_modified: 'casey   diaz', modified_at: '2026-10-09 10:00:00' }).selfApprovalFlag).toBe(1);
  });
  it('selfApprovalFlag is 0 when either name is missing, never a false match on two blanks', () => {
    expect(mapPunchEditRow({ loc: 'A', geid: '1', employee_name: null, manager_modified: null, modified_at: '2026-10-09 10:00:00' }).selfApprovalFlag).toBe(0);
    expect(mapPunchEditRow({ loc: 'A', geid: '1', employee_name: 'Jordan Smith', manager_modified: null, modified_at: '2026-10-09 10:00:00' }).selfApprovalFlag).toBe(0);
  });
});

describe('mapTenureRow() / mapPunchTimeDateRow()', () => {
  it('maps qsr_employee_tenure\'s relevant columns', () => {
    expect(mapTenureRow({ loc: '0013113', geid: '200668686', employment_status: 'Terminated', termination_entry_date: '2026-09-01' }))
      .toEqual({ loc: '0013113', geid: '200668686', employmentStatus: 'Terminated', terminationEntryDate: '2026-09-01' });
  });
  it('maps qsr_punch_times down to just {loc,date}, slicing start_date_time to a calendar date', () => {
    expect(mapPunchTimeDateRow({ loc: '0013113', start_date_time: '2026-10-09T06:12:00+00:00' }))
      .toEqual({ loc: '0013113', date: '2026-10-09' });
  });
});

describe('supportsLaborGhost() / supportsLaborSelfApproval() / supportsLaborManagerRate() — mutually exclusive by DATA_REQUIRED combination', () => {
  const ghost = { data_required: ['lifelenz_punch_edits', 'qsr_employee_tenure'] };
  const self_ = { data_required: ['lifelenz_punch_edits'] };
  const mgr = { data_required: ['lifelenz_punch_edits', 'qsr_punch_times'] };

  it('each predicate is true for its own shape only', () => {
    expect(supportsLaborGhost(ghost)).toBe(true);
    expect(supportsLaborSelfApproval(ghost)).toBe(false);
    expect(supportsLaborManagerRate(ghost)).toBe(false);

    expect(supportsLaborGhost(self_)).toBe(false);
    expect(supportsLaborSelfApproval(self_)).toBe(true);
    expect(supportsLaborManagerRate(self_)).toBe(false);

    expect(supportsLaborGhost(mgr)).toBe(false);
    expect(supportsLaborSelfApproval(mgr)).toBe(false);
    expect(supportsLaborManagerRate(mgr)).toBe(true);
  });
  it('none of the three ever match an unrelated CASH/INV rule', () => {
    const cashRule = { data_required: ['audit_rows'] };
    const invRule = { data_required: ['qsr_variance_stat'] };
    for (const r of [cashRule, invRule]) {
      expect(supportsLaborGhost(r)).toBe(false);
      expect(supportsLaborSelfApproval(r)).toBe(false);
      expect(supportsLaborManagerRate(r)).toBe(false);
    }
  });
});

describe('joinPunchEditsWithTenure() — LABOR-001\'s postTerminationFlag derivation', () => {
  const tenure = [mapTenureRow({ loc: 'A', geid: '1', employment_status: 'Terminated', termination_entry_date: '2026-09-01' })];

  it('flags an edit whose effective punch date falls AFTER the termination date', () => {
    const edits = [mapPunchEditRow({ loc: 'A', geid: '1', employee_name: 'Jordan Smith', manager_modified: 'Casey Diaz', adjusted_punch_at: '2026-09-15 08:00:00', modified_at: '2026-09-16 10:00:00' })];
    const out = joinPunchEditsWithTenure(edits, tenure);
    expect(out[0].postTerminationFlag).toBe(1);
    expect(out[0].terminationEntryDate).toBe('2026-09-01');
  });
  it('does not flag an edit whose effective punch date is BEFORE termination (a legitimate late correction)', () => {
    const edits = [mapPunchEditRow({ loc: 'A', geid: '1', employee_name: 'Jordan Smith', manager_modified: 'Casey Diaz', original_punch_at: '2026-08-20 08:00:00', adjusted_punch_at: '2026-08-20 08:10:00', modified_at: '2026-09-16 10:00:00' })];
    expect(joinPunchEditsWithTenure(edits, tenure)[0].postTerminationFlag).toBe(0);
  });
  it('falls back to original_punch_at when there is no adjusted_punch_at (an Edit with a null correction is unusual but must not crash)', () => {
    const edits = [mapPunchEditRow({ loc: 'A', geid: '1', employee_name: 'Jordan Smith', manager_modified: 'Casey Diaz', original_punch_at: '2026-09-10 08:00:00', adjusted_punch_at: null, modified_at: '2026-09-16 10:00:00' })];
    expect(joinPunchEditsWithTenure(edits, tenure)[0].postTerminationFlag).toBe(1);
  });
  it('a subject with no tenure row on file (never terminated, or no roster match) is never flagged', () => {
    const edits = [mapPunchEditRow({ loc: 'A', geid: 'unknown-geid', employee_name: 'Someone Else', manager_modified: 'Casey Diaz', adjusted_punch_at: '2026-10-01 08:00:00', modified_at: '2026-10-02 10:00:00' })];
    const out = joinPunchEditsWithTenure(edits, tenure);
    expect(out[0].postTerminationFlag).toBe(0);
    expect(out[0].terminationEntryDate).toBeNull();
  });
});

describe('computeLaborEmployeeFindingsForRule() — LABOR-001/002\'s (loc,empToken) threshold-count loop', () => {
  const WIN = { windowStart: '2026-10-01', windowEnd: '2026-10-12' };
  const LABOR_001_RULE = {
    rule_id: 'LABOR-001', method: 'Post-termination punch-edit activity', baseline_type: null, severity: 5, weight: 1.5,
    data_required: ['lifelenz_punch_edits', 'qsr_employee_tenure'],
    logic_type: 'threshold', logic_expression: { field: 'postTerminationFlag', agg: 'sum', comparator: 'gte' },
    threshold: { default: 1 },
  };
  const LABOR_002_RULE = {
    rule_id: 'LABOR-002', method: 'Employee self-approved punch edit', baseline_type: null, severity: 4, weight: 1,
    data_required: ['lifelenz_punch_edits'],
    logic_type: 'threshold', logic_expression: { field: 'selfApprovalFlag', agg: 'sum', comparator: 'gte' },
    threshold: { default: 1 },
  };

  it('LABOR-001: an employee with one post-termination edit flags; a clean one does not', () => {
    const rows = [
      { loc: 'A', emp: 'Jordan Smith', empToken: 'tok-jordan', date: '2026-10-09', postTerminationFlag: 1 },
      { loc: 'A', emp: 'Alex Rivera', empToken: 'tok-alex', date: '2026-10-05', postTerminationFlag: 0 },
    ];
    const findings = computeLaborEmployeeFindingsForRule(LABOR_001_RULE, rows, WIN);
    const jordan = findings.find(f => f.empToken === 'tok-jordan');
    const alex = findings.find(f => f.empToken === 'tok-alex');
    expect(jordan.value).toBe(1);
    expect(jordan.pass).toBe(true);
    expect(alex.value).toBe(0);
    expect(alex.pass).toBe(false);
  });

  it('LABOR-001: two post-termination edits for the same employee SUM to one finding, not two', () => {
    const rows = [
      { loc: 'A', emp: 'Jordan Smith', empToken: 'tok-jordan', date: '2026-10-09', postTerminationFlag: 1 },
      { loc: 'A', emp: 'Jordan Smith', empToken: 'tok-jordan', date: '2026-10-10', postTerminationFlag: 1 },
    ];
    const findings = computeLaborEmployeeFindingsForRule(LABOR_001_RULE, rows, WIN);
    expect(findings).toHaveLength(1);
    expect(findings[0].value).toBe(2);
  });

  it('a row with no empToken (identity not yet resolved) is excluded, same discipline as the CASH pre-backfill case', () => {
    const rows = [{ loc: 'A', emp: 'Unresolved Name', empToken: null, date: '2026-10-09', postTerminationFlag: 1 }];
    expect(computeLaborEmployeeFindingsForRule(LABOR_001_RULE, rows, WIN)).toHaveLength(0);
  });

  it('LABOR-002: the dynamic DATA_REQUIRED[0] key is used, not a hardcoded source name -- reads selfApprovalFlag correctly on a rule whose own data_required differs from LABOR-001\'s', () => {
    const rows = [{ loc: 'A', emp: 'Casey Diaz', empToken: 'tok-casey', date: '2026-10-09', selfApprovalFlag: 1 }];
    const findings = computeLaborEmployeeFindingsForRule(LABOR_002_RULE, rows, WIN);
    expect(findings[0].value).toBe(1);
    expect(findings[0].pass).toBe(true);
  });
});

describe('buildLocDatePunchIndex() — total qsr_punch_times rows per (loc,date), independent of manager', () => {
  it('counts punches per store-day', () => {
    const rows = [
      mapPunchTimeDateRow({ loc: 'A', start_date_time: '2026-10-09T06:00:00' }),
      mapPunchTimeDateRow({ loc: 'A', start_date_time: '2026-10-09T07:00:00' }),
      mapPunchTimeDateRow({ loc: 'A', start_date_time: '2026-10-10T06:00:00' }),
      mapPunchTimeDateRow({ loc: 'B', start_date_time: '2026-10-09T06:00:00' }),
    ];
    const idx = buildLocDatePunchIndex(rows);
    expect(idx.get('A::2026-10-09')).toBe(2);
    expect(idx.get('A::2026-10-10')).toBe(1);
    expect(idx.get('B::2026-10-09')).toBe(1);
  });
});

describe('joinManagerEditsWithPunchVolume() — aggregates edits by (loc,date,managerToken), attaches punch volume ONCE per bucket, drops what it cannot price', () => {
  const punchIndex = new Map([['A::2026-10-09', 1000]]);

  it('two edits by the same manager on the same store-day sum into one row, sharing one punch-volume figure (not doubled)', () => {
    const edits = [
      { loc: 'A', date: '2026-10-09', managerToken: 'tok-casey' },
      { loc: 'A', date: '2026-10-09', managerToken: 'tok-casey' },
    ];
    const out = joinManagerEditsWithPunchVolume(edits, punchIndex);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ loc: 'A', date: '2026-10-09', managerToken: 'tok-casey', editCount: 2, storePunchVolume: 1000 });
  });

  it('an edit with no matching punch-volume bucket is dropped, not carried forward with a null denominator', () => {
    const edits = [{ loc: 'A', date: '2026-10-11', managerToken: 'tok-casey' }];
    expect(joinManagerEditsWithPunchVolume(edits, punchIndex)).toHaveLength(0);
  });

  it('an edit with no managerToken (identity not yet resolved) is dropped -- cannot attribute an unattributable finding', () => {
    const edits = [{ loc: 'A', date: '2026-10-09', managerToken: null }];
    expect(joinManagerEditsWithPunchVolume(edits, punchIndex)).toHaveLength(0);
  });
});

describe('computeManagerEditFindingsForRule() — LABOR-003\'s manager x store grain, storeBaseline pooling every OTHER store\'s own rate', () => {
  const WIN = { windowStart: '2026-10-01', windowEnd: '2026-10-12' };
  const LABOR_003_RULE = {
    rule_id: 'LABOR-003', method: 'Punch-edit rate per editing manager, vs. other stores', baseline_type: 'store', severity: 3, weight: 1,
    data_required: ['lifelenz_punch_edits', 'qsr_punch_times'],
    logic_type: 'z-score',
    logic_expression: { numerator: { field: 'editCount', agg: 'sum' }, denominator: { field: 'storePunchVolume', agg: 'sum' }, scale: 1000, comparator: 'gte', min_denominator: 500 },
    threshold: { default: 2.5 },
  };
  // Store A (target manager): editCount=50, storePunchVolume=1000 -> value=50 per 1,000 punches.
  // Peer stores B-F (same window, different stores/managers): 8/9/11/12/10 per 1,000 -- same
  // hand-computed peer stats as security-rules-run.test.js's own INV-004 z-score fixture
  // (mean=10, stdev=sqrt(2)~=1.4142). z = (50-10)/1.4142 ~= 28.3, comfortably >= threshold 2.5.
  const ROWS = [
    { loc: 'A', date: '2026-10-09', managerToken: 'tok-mgr1', editCount: 50, storePunchVolume: 1000 },
    { loc: 'B', date: '2026-10-09', managerToken: 'tok-mgr2', editCount: 8,  storePunchVolume: 1000 },
    { loc: 'C', date: '2026-10-09', managerToken: 'tok-mgr3', editCount: 9,  storePunchVolume: 1000 },
    { loc: 'D', date: '2026-10-09', managerToken: 'tok-mgr4', editCount: 11, storePunchVolume: 1000 },
    { loc: 'E', date: '2026-10-09', managerToken: 'tok-mgr5', editCount: 12, storePunchVolume: 1000 },
    { loc: 'F', date: '2026-10-09', managerToken: 'tok-mgr6', editCount: 10, storePunchVolume: 1000 },
  ];

  it('the outlier manager at Store A flags, z-scored against the other 5 stores own rate', () => {
    const findings = computeManagerEditFindingsForRule(LABOR_003_RULE, ROWS, WIN);
    const a = findings.find(f => f.loc === 'A');
    expect(a.empToken).toBe('tok-mgr1'); // manager subject reuses the empToken column, same as INV-004
    expect(a.value).toBeCloseTo(50, 6);
    expect(a.pass).toBe(true);
    expect(a.baselineContext.mean).toBeCloseTo(10, 6);
    expect(a.baselineContext.stdev).toBeCloseTo(Math.sqrt(2), 4);
  });

  it('an in-range peer manager stays clear (a real, decided pass:false, not a null)', () => {
    const findings = computeManagerEditFindingsForRule(LABOR_003_RULE, ROWS, WIN);
    const b = findings.find(f => f.loc === 'B');
    expect(b.pass).toBe(false);
  });

  it('a row with no managerToken is excluded from subject pairing entirely', () => {
    const rows = [...ROWS, { loc: 'G', date: '2026-10-09', managerToken: null, editCount: 99, storePunchVolume: 1000 }];
    const findings = computeManagerEditFindingsForRule(LABOR_003_RULE, rows, WIN);
    expect(findings.find(f => f.loc === 'G')).toBeUndefined();
  });
});
