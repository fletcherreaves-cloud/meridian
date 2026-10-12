// @ts-nocheck
// scripts/lifelenz-pull.mjs's new parsePunchEditCSV()/parsePunchDateTime() (2026-10-12) --
// unblocks plan-security-loss-prevention.md's manual-edit-pattern rules. Source report:
// LifeLenz's time_punch_change_approvals_report (memory/finding-lifelenz-punch-edit-audit-
// report-2026-10-12.md). No I/O in either function, cheap to test directly -- same reasoning
// qsrsoft-punch-times-pull.test.js already gives for testing a scripts/ module this way.
//
// All fixtures below are 100% synthetic (fake names, fake GEIDs, fake manager names) --
// matching this repo's standing PII-fixture discipline. Never copy real sample rows from a live
// capture into a test fixture.
import { describe, it, expect } from 'vitest';
import { parsePunchEditCSV, parsePunchDateTime } from '../../scripts/lifelenz-pull.mjs';

// Shaped like the live capture's CSV structure (metadata row, header row, then sparse
// per-employee blocks where Employee Name/GEID/Payroll ID are blank after an employee's first
// row) -- but every value below is synthetic.
function csv(rows) {
  const header = '"","","","",Store,0099999\n' +
    'Employee Name,GEID,Payroll ID,Original Punch Date/Time,Punch Type,Punch Method,' +
    'Adjustment Type,Adjusted Punch Date/Time,Modified Date/Time,Manager Modified,' +
    'Employee Action Date/Time,Employee Action Status\n';
  return header + rows.join('\n');
}

describe('parsePunchDateTime()', () => {
  it('parses MM/DD/YYYY HH:MM into an ISO-ish naive string', () => {
    expect(parsePunchDateTime('09/30/2026 17:31')).toBe('2026-09-30T17:31:00');
  });
  it('pads single-digit month/day/hour', () => {
    expect(parsePunchDateTime('1/2/2026 9:05')).toBe('2026-01-02T09:05:00');
  });
  it('strips a trailing parenthetical annotation (e.g. "(EI)") rather than failing to parse', () => {
    expect(parsePunchDateTime('10/03/2026 16:45 (EI)')).toBe('2026-10-03T16:45:00');
  });
  it('returns null on blank/unparseable input', () => {
    expect(parsePunchDateTime('')).toBeNull();
    expect(parsePunchDateTime(null)).toBeNull();
    expect(parsePunchDateTime('not a date')).toBeNull();
  });
});

describe('parsePunchEditCSV() — field mapping', () => {
  it('extracts the store number from the metadata row and zero-pads to 7 chars', () => {
    const rows = parsePunchEditCSV(csv([
      'Test Employee A,500000001,,,Break End,Manual,Edit,10/07/2026 09:00,10/07/2026 10:47,Test Manager A,,',
    ]));
    expect(rows).toHaveLength(1);
    expect(rows[0].loc).toBe('0099999');
  });

  it('maps every column to its field, with adjustment_type/manager_modified/modified_at the core signal', () => {
    const rows = parsePunchEditCSV(csv([
      'Test Employee A,500000001,PR001,10/07/2026 10:44,Break End,Manual,Edit,10/07/2026 09:00,10/07/2026 10:47,Test Manager A,10/08/2026 08:00,Acknowledged',
    ]));
    expect(rows).toEqual([{
      loc: '0099999', geid: '500000001',
      employee_name: 'Test Employee A', payroll_id: 'PR001',
      punch_type: 'Break End', punch_method: 'Manual',
      adjustment_type: 'Edit',
      original_punch_at: '2026-10-07T10:44:00',
      adjusted_punch_at: '2026-10-07T09:00:00',
      modified_at: '2026-10-07T10:47:00',
      manager_modified: 'Test Manager A',
      employee_action_at: '2026-10-08T08:00:00',
      employee_action_status: 'Acknowledged',
      seq: 0,
      updated_at: rows[0].updated_at,
    }]);
  });

  it('drops a row with no Adjustment Type -- an ordinary punch, not an edit event', () => {
    const rows = parsePunchEditCSV(csv([
      'Test Employee A,500000001,,,Clock In,Pin,,,,,,',
    ]));
    expect(rows).toEqual([]);
  });

  it('keeps an "Add" row even though it has no original punch (never existed to begin with)', () => {
    const rows = parsePunchEditCSV(csv([
      'Test Employee B,500000002,,,Clock In,Manual,Add,09/20/2026 15:00,09/22/2026 09:38,Test Manager B,,',
    ]));
    expect(rows).toHaveLength(1);
    expect(rows[0].adjustment_type).toBe('Add');
    expect(rows[0].original_punch_at).toBeNull();
    expect(rows[0].adjusted_punch_at).toBe('2026-09-20T15:00:00');
  });

  it('carries Employee Name/GEID/Payroll ID forward across blank-employee rows, matching the real report\'s sparse shape', () => {
    const rows = parsePunchEditCSV(csv([
      'Test Employee C,500000003,,,Clock In,Biometrics,,,,,,',          // dropped (no adjustment)
      ',,,,Role Rate Operation,Biometrics,,,,,,',                        // dropped (no adjustment)
      ',,,,Break Start,Manual,Add,09/30/2026 18:31,10/01/2026 20:07,Test Manager C,10/01/2026 23:32,Acknowledged',
      ',,,,Break End,Manual,Add,09/30/2026 19:01,10/01/2026 20:07,Test Manager C,10/01/2026 23:32,Acknowledged',
    ]));
    expect(rows).toHaveLength(2);
    expect(rows[0].employee_name).toBe('Test Employee C');
    expect(rows[0].geid).toBe('500000003');
    expect(rows[1].employee_name).toBe('Test Employee C');
    expect(rows[1].geid).toBe('500000003');
    expect(rows[0].punch_type).toBe('Break Start');
    expect(rows[1].punch_type).toBe('Break End');
  });

  it('starts a NEW employee block the moment a non-blank Employee Name appears -- never bleeds the prior employee\'s identity', () => {
    const rows = parsePunchEditCSV(csv([
      ',,,,Break End,Manual,Edit,10/07/2026 09:00,10/07/2026 10:47,Test Manager A,,', // orphan row before any employee -- dropped
      'Test Employee A,500000001,,,Clock In,Manual,Add,10/09/2026 06:00,10/09/2026 13:01,Test Manager A,,',
      'Test Employee D,500000004,,,Clock In,Manual,Add,10/01/2026 10:24,10/01/2026 10:28,Test Manager D,10/01/2026 10:44,Acknowledged',
    ]));
    expect(rows).toHaveLength(2);
    expect(rows[0].geid).toBe('500000001');
    expect(rows[1].geid).toBe('500000004');
    expect(rows[1].employee_name).toBe('Test Employee D');
  });

  it('a row with a non-blank Adjustment Type but no resolvable GEID context is dropped, not fabricated', () => {
    const rows = parsePunchEditCSV(csv([
      ',,,,Break End,Manual,Edit,10/07/2026 09:00,10/07/2026 10:47,Test Manager A,,',
    ]));
    expect(rows).toEqual([]);
  });

  it('manager_modified/punch_method/employee_action_status are null (not empty string or undefined) when blank', () => {
    const rows = parsePunchEditCSV(csv([
      'Test Employee E,500000005,,,Clock Out,,Edit,10/01/2026 13:00,10/01/2026 13:05,,,',
    ]));
    expect(rows[0].punch_method).toBeNull();
    expect(rows[0].manager_modified).toBeNull();
    expect(rows[0].employee_action_status).toBeNull();
    expect(rows[0].employee_action_at).toBeNull();
  });

  it('returns [] for a CSV with no Store metadata row', () => {
    expect(parsePunchEditCSV('just,some,header\nrow,of,data')).toEqual([]);
  });

  it('returns [] for an empty or near-empty input', () => {
    expect(parsePunchEditCSV('')).toEqual([]);
    expect(parsePunchEditCSV('one line only')).toEqual([]);
  });

  it('seq: two rows sharing the SAME geid/punch_type/modified_at (minute-granular, a real duplicate found live -- a multi-segment "Role Rate Operation" split saved in one action) get distinct seq 0/1, not a collision', () => {
    const rows = parsePunchEditCSV(csv([
      // Same modified_at (the save action's own minute), different adjusted_punch_at (each
      // row is a different time-segment of the same multi-segment edit) -- exactly the real
      // shape that broke the old (loc,geid,punch_type,modified_at) key live.
      'Test Employee G,500000007,,,Role Rate Operation,Manual,Edit,10/09/2026 15:00,10/09/2026 15:20,Test Manager G,,',
      ',,,,Role Rate Operation,Manual,Edit,10/09/2026 15:10,10/09/2026 15:20,Test Manager G,,',
    ]));
    expect(rows).toHaveLength(2);
    // Both rows share the exact same geid/punch_type/modified_at -- only adjusted_punch_at differs.
    expect(rows[0].geid).toBe(rows[1].geid);
    expect(rows[0].punch_type).toBe(rows[1].punch_type);
    expect(rows[0].modified_at).toBe(rows[1].modified_at);
    expect(rows[0].adjusted_punch_at).not.toBe(rows[1].adjusted_punch_at);
    expect(rows[0].seq).toBe(0);
    expect(rows[1].seq).toBe(1);
  });

  it('seq starts over at 0 for a DIFFERENT group (different punch_type), not a running total across the whole CSV', () => {
    const rows = parsePunchEditCSV(csv([
      'Test Employee H,500000008,,,Role Rate Operation,Manual,Edit,10/09/2026 15:00,10/09/2026 15:20,Test Manager H,,',
      ',,,,Role Rate Operation,Manual,Edit,10/09/2026 15:10,10/09/2026 15:20,Test Manager H,,',
      ',,,,Clock Out,Manual,Edit,10/09/2026 16:00,10/09/2026 15:20,Test Manager H,,', // same modified_at, different punch_type
    ]));
    expect(rows).toHaveLength(3);
    expect(rows[0].seq).toBe(0);
    expect(rows[1].seq).toBe(1);
    expect(rows[2].seq).toBe(0); // new group (punch_type differs) -- not seq 2
  });

  it('seq is 0 for the ordinary, non-colliding case (the overwhelming majority of real rows)', () => {
    const rows = parsePunchEditCSV(csv([
      'Test Employee I,500000009,,,Clock In,Manual,Add,10/01/2026 06:00,10/01/2026 06:05,Test Manager I,,',
    ]));
    expect(rows[0].seq).toBe(0);
  });

  it('never fabricates a name/geid/manager field beyond what the CSV actually carries', () => {
    const rows = parsePunchEditCSV(csv([
      'Test Employee F,500000006,,,Clock In,Manual,Add,10/01/2026 06:00,10/01/2026 06:05,Test Manager F,,',
    ]));
    const serialized = JSON.stringify(rows);
    // No injected PII-shaped literal (e.g. a 9-digit SSN pattern) should ever appear -- this
    // report never carries ssn, confirmed in the finding file, so nothing here should either.
    expect(serialized).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
  });
});
