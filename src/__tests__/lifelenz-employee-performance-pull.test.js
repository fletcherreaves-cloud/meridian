// @ts-nocheck
// Tests of lifelenz-employee-performance-pull.mjs's dynamic label-map builder + CSV parser.
//
// Unlike Compliance Audit's test fixtures (synthetic labels, since that report's real CSV
// header was never captured), this report's REAL column list AND a real CSV capture are both
// on file: scripts/lifelenz-employee-performance-meta-probe.mjs's live discovery dispatch
// (GitHub Actions run 41371639603, 2026-11-02) returned the genuine GetReportMeta column dump
// and one real store's CSV (Duncan, OK). META_COLUMNS and the header/first rows below are
// copied verbatim from that run's job log, not synthesized — per the standing "measure, don't
// reason" rule. Guarded by `if (import.meta.url === ...)` in the script itself, so importing it
// here does not also fire off a live LifeLenz pull.
import { describe, it, expect } from 'vitest';
import { parseEmployeePerformanceCSV, buildLabelMap, locFromName, stripReportPrefix } from '../../scripts/lifelenz-employee-performance-pull.mjs';

// Regression test for the same fully-qualified-member-name trap Compliance Audit's build hit.
describe('stripReportPrefix', () => {
  it('strips the real "employee_performance_report." prefix GetReportMeta returns', () => {
    expect(stripReportPrefix('employee_performance_report.employees_geid')).toBe('employees_geid');
    expect(stripReportPrefix('employee_performance_report.attendance_rate')).toBe('attendance_rate');
  });
  it('leaves an already-bare member unchanged', () => {
    expect(stripReportPrefix('employees_geid')).toBe('employees_geid');
  });
  it('passes through null/undefined without throwing', () => {
    expect(stripReportPrefix(null)).toBeNull();
    expect(stripReportPrefix(undefined)).toBeUndefined();
  });
});

// The real 30-column GetReportMeta dump (member | name | shortTitle), run 41371639603.
const META_COLUMNS = [
  { member: 'locations_location_name', name: 'locations_location_name', shortTitle: 'Home Store' },
  { member: 'employees_employee_name', name: 'employees_employee_name', shortTitle: 'Employee Name' },
  { member: 'employees_geid', name: 'employees_geid', shortTitle: 'Employee ID' },
  { member: 'absent_count', name: 'absent_count', shortTitle: 'Absence' },
  { member: 'late_count', name: 'late_count', shortTitle: 'Lateness Incidents' },
  { member: 'no_punch_count', name: 'no_punch_count', shortTitle: 'No-Show' },
  { member: 'attendance_rate', name: 'attendance_rate', shortTitle: 'Attendance %' },
  { member: 'scheduled_count', name: 'scheduled_count', shortTitle: 'Shifts Scheduled' },
  { member: 'worked_count', name: 'worked_count', shortTitle: 'Shifts Worked' },
  { member: 'unscheduled_count', name: 'unscheduled_count', shortTitle: 'Unscheduled Shifts Worked' },
  { member: 'drop_approved_count', name: 'drop_approved_count', shortTitle: 'Shifts Dropped' },
  { member: 'drop_rate', name: 'drop_rate', shortTitle: 'Shifts Dropped %' },
  { member: 'pickup_request_count', name: 'pickup_request_count', shortTitle: 'Pickup Requested' },
  { member: 'pickup_approved_count', name: 'pickup_approved_count', shortTitle: 'Pickup Approved' },
  { member: 'total_worked_hours', name: 'total_worked_hours', shortTitle: 'Hours Worked' },
  { member: 'employees_employee_name_last_first', name: 'employees_employee_name_last_first', shortTitle: 'Employee Name (Last, First)' },
  { member: 'employees_current_status', name: 'employees_current_status', shortTitle: 'Employment Status' },
  { member: 'disciplinary_action_count', name: 'disciplinary_action_count', shortTitle: 'Disciplinary Actions' },
  { member: 'commendation_count', name: 'commendation_count', shortTitle: 'Commendations' },
  { member: 'leave_days_requested', name: 'leave_days_requested', shortTitle: 'Leave Days Requested' },
  { member: 'leave_days_approved', name: 'leave_days_approved', shortTitle: 'Leave Days Approved' },
  { member: 'employees_employment_type_name', name: 'employees_employment_type_name', shortTitle: 'Employment Type' },
  { member: 'employees_minor_age', name: 'employees_minor_age', shortTitle: 'Minor Age' },
  { member: 'employees_is_salaried', name: 'employees_is_salaried', shortTitle: 'Is Salaried' },
  { member: 'employees_is_manager', name: 'employees_is_manager', shortTitle: 'Is Manager' },
  { member: 'swap_manager_approved_count', name: 'swap_manager_approved_count', shortTitle: 'Shifts Swapped' },
  { member: 'swap_rate', name: 'swap_rate', shortTitle: 'Shifts Swapped %' },
  { member: 'employees_employee_id', name: 'employees_employee_id', shortTitle: 'Employee Id' },
  { member: 'locations_time_zone', name: 'locations_time_zone', shortTitle: 'Time Zone' },
  { member: 'locations_location_id', name: 'locations_location_id', shortTitle: 'Store Id' },
];

// Real CSV SHAPE captured live (Duncan, OK store, GitHub Actions run 41371639603) — the header
// row, column order, and the exact value formatting (decimal hours, blank-not-zero rate cells)
// are copied verbatim from that run's job log. The employee identifying data itself (names,
// GEIDs, LifeLenz UUIDs) is NOT real — synthesized here so no real employee's name or payroll
// number is committed to the repository, per the standing PII-handling rule. The three
// synthetic rows reproduce the three real shapes that mattered: a normal employee with full
// attendance, an employee with a 0.0 (not blank) rate because scheduled_count>0 but worked_
// count=0, and an employee with NO scheduled shifts at all (every rate cell genuinely blank).
const REAL_CSV = `Employee Performance
Date Range,10/19/2026 - 11/02/2026
Home Store,Employee Name,Employee ID,Absence,Lateness Incidents,No-Show,Attendance %,Shifts Scheduled,Shifts Worked,Unscheduled Shifts Worked,Shifts Dropped,Shifts Dropped %,Pickup Requested,Pickup Approved,Hours Worked,"Employee Name (Last, First)",Employment Status,Disciplinary Actions,Commendations,Leave Days Requested,Leave Days Approved,Employment Type,Minor Age,Is Salaried,Is Manager,Shifts Swapped,Shifts Swapped %,Employee Id,Time Zone,Store Id
"0029760 - TEST STORE",Jordan Example,900000001,0,5,0,100.0,7,7,0,0,0.0,0,0,43.050000,"Example, Jordan",active,0,0,0.00,0.00,Casual,,false,false,0,0.0,00000000-0000-0000-0000-000000000001,America/Chicago,00000000-0000-0000-0000-00000000aaaa
"0029760 - TEST STORE",Casey Sample,900000002,2,0,0,0.0,4,0,0,0,0.0,0,0,0.000000,"Sample, Casey",active,0,0,0.00,0.00,Casual,,false,false,0,0.0,00000000-0000-0000-0000-000000000002,America/Chicago,00000000-0000-0000-0000-00000000aaaa
"0029760 - TEST STORE",Taylor Placeholder,900000003,0,0,0,,0,0,9,0,,0,0,35.233333,"Placeholder, Taylor",active,0,0,0.00,0.00,Casual,,false,false,0,,00000000-0000-0000-0000-000000000003,America/Chicago,00000000-0000-0000-0000-00000000aaaa
`;

describe('buildLabelMap', () => {
  it('maps each real shortTitle (case-insensitively) to its member', () => {
    const map = buildLabelMap(META_COLUMNS);
    expect(map.get('home store')).toBe('locations_location_name');
    expect(map.get('EMPLOYEE ID'.toLowerCase())).toBe('employees_geid');
    expect(map.get('attendance %')).toBe('attendance_rate');
  });
});

describe('parseEmployeePerformanceCSV — real captured shape, synthetic employees', () => {
  it('parses one row per employee from the real header/data shape, resolving promoted fields', () => {
    const rows = parseEmployeePerformanceCSV(REAL_CSV, META_COLUMNS, '2026-10-19', '2026-11-02');
    expect(rows).toHaveLength(3);
    expect(rows[0].geid).toBe('900000001');
    expect(rows[0].employee_name).toBe('Jordan Example');
    expect(rows[0].attendance_rate).toBe(100.0);
    expect(rows[0].scheduled_count).toBe(7);
    expect(rows[0].worked_count).toBe(7);
    expect(rows[0].late_count).toBe(5);
    expect(rows[0].total_worked_hours).toBeCloseTo(43.05, 3);
    expect(rows[0].is_manager).toBe(false);
    expect(rows[0].employment_type).toBe('Casual');
    expect(rows[0].period_start).toBe('2026-10-19');
    expect(rows[0].period_end).toBe('2026-11-02');
  });

  it('a real zero-scheduled-shifts employee has a 0.0 rate, not null, when the CSV literally says 0.0', () => {
    const rows = parseEmployeePerformanceCSV(REAL_CSV, META_COLUMNS, '2026-10-19', '2026-11-02');
    const row = rows.find(r => r.geid === '900000002');
    expect(row.scheduled_count).toBe(4);
    expect(row.worked_count).toBe(0);
    expect(row.attendance_rate).toBe(0.0);
  });

  it('a blank rate field (no denominator at all) parses as null, not 0 or NaN', () => {
    const rows = parseEmployeePerformanceCSV(REAL_CSV, META_COLUMNS, '2026-10-19', '2026-11-02');
    const row = rows.find(r => r.geid === '900000003');
    expect(row.scheduled_count).toBe(0);
    expect(row.attendance_rate).toBeNull();
    expect(row.drop_rate).toBeNull();
    expect(row.swap_rate).toBeNull();
    expect(row.unscheduled_count).toBe(9);
  });

  it('blank minor_age parses as null (adult employee), not 0', () => {
    const rows = parseEmployeePerformanceCSV(REAL_CSV, META_COLUMNS, '2026-10-19', '2026-11-02');
    expect(rows[0].minor_age).toBeNull();
  });

  it('does not mistake a metadata row (right column count, wrong content) for the header', () => {
    const noisyMetadata = `Employee Performance\nDate Range,10/19/2026 - 11/02/2026\n` +
      META_COLUMNS.map((_, i) => 'Field' + i).join(',') + '\n' + REAL_CSV.split('\n').slice(2).join('\n');
    const rows = parseEmployeePerformanceCSV(noisyMetadata, META_COLUMNS, '2026-10-19', '2026-11-02');
    expect(rows).toHaveLength(3);
    expect(rows[0].geid).toBe('900000001');
  });

  it('returns [] when no header row is found in the first 10 lines (shape drifted)', () => {
    const drifted = 'some,other,header,shape\na,b,c,d\n';
    expect(parseEmployeePerformanceCSV(drifted, META_COLUMNS, '2026-10-19', '2026-11-02')).toEqual([]);
  });

  it('a real empty report (no data rows) parses as []', () => {
    const emptyReport = `Employee Performance\nDate Range,10/19/2026 - 11/02/2026\n` +
      REAL_CSV.split('\n')[2] + '\n';
    expect(parseEmployeePerformanceCSV(emptyReport, META_COLUMNS, '2026-10-19', '2026-11-02')).toEqual([]);
  });

  it('skips a row missing geid or employee_name rather than crashing', () => {
    const csv = REAL_CSV.replace('Jordan Example,900000001', ',');
    const rows = parseEmployeePerformanceCSV(csv, META_COLUMNS, '2026-10-19', '2026-11-02');
    expect(rows.length).toBeLessThan(3);
  });
});

describe('locFromName', () => {
  it('extracts and zero-pads the store number from a schedule name', () => {
    expect(locFromName('0029760 - DUNCAN, OK-HWY 81 (RELO)')).toBe('0029760');
    expect(locFromName('33222 - ELGIN, OK')).toBe('0033222');
  });
  it('returns null when no store number is present', () => {
    expect(locFromName('MCDOK/Emerald Arches/MCDOK')).toBeNull();
  });
});
