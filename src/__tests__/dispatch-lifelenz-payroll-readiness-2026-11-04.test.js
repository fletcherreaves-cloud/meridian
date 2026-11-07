// @ts-nocheck
// Tests of lifelenz-payroll-readiness-pull.mjs's dynamic label-map builder + CSV parser.
//
// ✅ As of 2026-11-05, the reportKey and real grain ARE confirmed live (see this script's own
// header and memory/finding-lifelenz-payroll-readiness-pk-mismatch-2026-11-04.md's "RESOLVED"
// section — the real unique key is `payroll_entry_id`, not `(geid,pay_period_start)`). These
// fixtures still use fully synthetic members AND display labels, though — the point of this file
// is proving the MECHANISM (deriving the label→member map from a live GetReportMeta call, then
// using it to parse an arbitrary header row) works correctly regardless of exactly what labels
// LifeLenz's UI shows, not re-asserting the real shape every test run. Guarded by
// `if (import.meta.url === ...)` in the script itself, so importing it here does not also fire
// off a live LifeLenz pull.
import { describe, it, expect } from 'vitest';
import { parsePayrollReadinessCSV, buildLabelMap, locFromName, stripReportPrefix } from '../../scripts/lifelenz-payroll-readiness-pull.mjs';

describe('stripReportPrefix', () => {
  it('strips the "payroll_readiness_report." prefix GetReportMeta is expected to return', () => {
    expect(stripReportPrefix('payroll_readiness_report.employees_geid')).toBe('employees_geid');
    expect(stripReportPrefix('payroll_readiness_report.overtime_earnings')).toBe('overtime_earnings');
  });
  it('leaves an already-bare member unchanged', () => {
    expect(stripReportPrefix('employees_geid')).toBe('employees_geid');
  });
  it('passes through null/undefined without throwing', () => {
    expect(stripReportPrefix(null)).toBeNull();
    expect(stripReportPrefix(undefined)).toBeUndefined();
  });
});

// Representative subset of the ~58 guessed column members (memory/lifelenz-session.md), each
// paired with a synthetic test-only display label. One extra member
// (locations_location_name) with no PROMOTED_MEMBERS entry, to exercise the `raw` JSONB path.
const META_COLUMNS = [
  { member: 'employees_geid', name: 'Employee ID' },
  { member: 'employees_employee_name', name: 'Employee' },
  { member: 'pay_periods_start_time', name: 'Pay Period Start' },
  { member: 'pay_periods_pay_period_status', name: 'Period Status' },
  { member: 'scheduled_shifts_scheduled_hours', name: 'Scheduled Hours' },
  { member: 'worked_hours', name: 'Worked Hours' },
  { member: 'total_worked_hours', name: 'Total Worked Hours' },
  { member: 'hours_variance', name: 'Hours Variance' },
  { member: 'cost_variance', name: 'Cost Variance' },
  { member: 'total_earnings', name: 'Total Earnings' },
  { member: 'regular_earnings', name: 'Regular Earnings' },
  { member: 'overtime_earnings', name: 'Overtime Earnings' },
  { member: 'overtime_hours', name: 'Overtime Hours' },
  { member: 'double_earnings', name: 'Double Earnings' },
  { member: 'double_hours', name: 'Double Hours' },
  { member: 'time_off_earnings', name: 'Time Off Earnings' },
  { member: 'time_off_hours', name: 'Time Off Hours' },
  { member: 'additional_earnings', name: 'Additional Earnings' },
  { member: 'additional_hours', name: 'Additional Hours' },
  { member: 'misc_earnings', name: 'Misc Earnings' },
  { member: 'misc_hours', name: 'Misc Hours' },
  { member: 'compliance_earnings', name: 'Compliance Earnings' },
  { member: 'compliance_hours', name: 'Compliance Hours' },
  { member: 'differential_earnings', name: 'Differential Earnings' },
  { member: 'differential_hours', name: 'Differential Hours' },
  { member: 'pay_period_posters_employee_name', name: 'Posted By' },
  { member: 'pay_period_approvers_employee_name', name: 'Approved By' },
  { member: 'scheduled_shifts_absent_reason_text', name: 'Absence Reason' },
  { member: 'time_off_types_name', name: 'Time Off Type' },
  { member: 'locations_location_name', name: 'Location' },
  // The report's real per-row unique id ("Entry Id") — confirmed live 2026-11-05, see this
  // file's header and memory/finding-lifelenz-payroll-readiness-pk-mismatch-2026-11-04.md.
  // Appended last so it doesn't disturb every other column's existing position below.
  { member: 'payroll_entry_id', name: 'Entry Id' },
];

const HEADER_ROW = META_COLUMNS.map(c => c.name).join(',');

const CSV_WITH_DATA = `Payroll Readiness
Date Range,10/02/2026 - 11/01/2026
${HEADER_ROW}
G1001,Jordan Lee,2026-10-19,Open,80,78,78,-2,-45.00,2340.00,2200,140.00,4,0,0,0,0,0,0,0,0,0,0,0,0,,,,,Ardmore-Broadway,E1001
G1002,Casey Nguyen,2026-10-19,Posted,80,92,92,12,180.00,2600.00,2000,600.00,12,0,0,0,0,0,0,0,0,0,0,0,0,Pat Rivera,Sam Diaz,,,Ardmore-Broadway,E1002
`;

describe('buildLabelMap', () => {
  it('maps each synthetic display label (case-insensitively) to its member', () => {
    const map = buildLabelMap(META_COLUMNS);
    expect(map.get('employee id')).toBe('employees_geid');
    expect(map.get('OVERTIME EARNINGS'.toLowerCase())).toBe('overtime_earnings');
    expect(map.get('pay period start')).toBe('pay_periods_start_time');
    expect(map.get('location')).toBe('locations_location_name');
  });

  it('falls back to the raw member name when no name/shortTitle is present', () => {
    const map = buildLabelMap([{ member: 'some_weird_field' }]);
    expect(map.get('some_weird_field')).toBe('some_weird_field');
  });

  it('returns an empty map for no columns', () => {
    expect(buildLabelMap([]).size).toBe(0);
    expect(buildLabelMap(null).size).toBe(0);
  });
});

describe('parsePayrollReadinessCSV — data rows', () => {
  it('parses one row per employee-payroll-entry, resolving promoted fields via the dynamic label map', () => {
    const rows = parsePayrollReadinessCSV(CSV_WITH_DATA, META_COLUMNS);
    expect(rows).toHaveLength(2);
    expect(rows[0].geid).toBe('G1001');
    expect(rows[0].payroll_entry_id).toBe('E1001');
    expect(rows[0].employee_name).toBe('Jordan Lee');
    expect(rows[0].pay_period_start).toBe('2026-10-19');
    expect(rows[0].pay_period_status).toBe('Open');
    expect(rows[0].scheduled_hours).toBe(80);
    expect(rows[0].hours_variance).toBe(-2);
    expect(rows[0].cost_variance).toBe(-45);
  });

  it('two rows sharing (geid,pay_period_start) but with distinct payroll_entry_id both parse — the report\'s real grain', () => {
    const csv = CSV_WITH_DATA.replace(
      'G1002,Casey Nguyen,2026-10-19,Posted,80,92,92,12,180.00,2600.00,2000,600.00,12,0,0,0,0,0,0,0,0,0,0,0,0,Pat Rivera,Sam Diaz,,,Ardmore-Broadway,E1002',
      'G1001,Jordan Lee,2026-10-19,Open,80,78,78,-2,-45.00,2340.00,2200,140.00,4,0,0,0,0,0,0,0,0,0,0,0,0,,,,,Ardmore-Broadway,E1002'
    );
    const rows = parsePayrollReadinessCSV(csv, META_COLUMNS);
    // Same geid + same pay_period_start as row 1, but a different payroll_entry_id (a second
    // real shift inside the same pay period) — both must survive parsing, not collapse.
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.payroll_entry_id).sort()).toEqual(['E1001', 'E1002']);
  });

  it('resolves overtime_earnings/overtime_hours correctly — the field this pull exists for', () => {
    const rows = parsePayrollReadinessCSV(CSV_WITH_DATA, META_COLUMNS);
    const row2 = rows.find(r => r.geid === 'G1002');
    expect(row2.overtime_hours).toBe(12);
    expect(row2.overtime_earnings).toBe(600);
    expect(row2.hours_variance).toBe(12);
    expect(row2.cost_variance).toBe(180);
  });

  it('parses the poster/approver fields on a posted period, blank (not fabricated) on an open one', () => {
    const rows = parsePayrollReadinessCSV(CSV_WITH_DATA, META_COLUMNS);
    const open = rows.find(r => r.geid === 'G1001');
    const posted = rows.find(r => r.geid === 'G1002');
    // Same plain-text `get()` semantics as every sibling pull's text fields (e.g. Compliance
    // Audit's dismissal_reason on a non-dismissed row): a blank CSV cell passes through as ''
    // (the real literal cell content), not a fabricated null.
    expect(open.poster_employee_name).toBe('');
    expect(open.approver_employee_name).toBe('');
    expect(posted.poster_employee_name).toBe('Pat Rivera');
    expect(posted.approver_employee_name).toBe('Sam Diaz');
  });

  it('puts unmapped columns (not in PROMOTED_MEMBERS) into `raw`', () => {
    const rows = parsePayrollReadinessCSV(CSV_WITH_DATA, META_COLUMNS);
    expect(rows[0].raw).toEqual({ locations_location_name: 'Ardmore-Broadway' });
  });

  it('skips a row missing geid or pay_period_start rather than crashing', () => {
    const csv = CSV_WITH_DATA.replace('G1002,Casey Nguyen,2026-10-19', ',Casey Nguyen,');
    const rows = parsePayrollReadinessCSV(csv, META_COLUMNS);
    expect(rows.length).toBeLessThan(2);
  });

  it('skips a row missing payroll_entry_id rather than crashing (the report\'s real key)', () => {
    const csv = CSV_WITH_DATA.replace(',Ardmore-Broadway,E1002', ',Ardmore-Broadway,');
    const rows = parsePayrollReadinessCSV(csv, META_COLUMNS);
    expect(rows.length).toBeLessThan(2);
    expect(rows.every(r => r.payroll_entry_id)).toBe(true);
  });

  it('does not mistake a metadata row (right column count, wrong content) for the header', () => {
    const noisyMetadata = `Payroll Readiness
Date Range,10/02/2026 - 11/01/2026
${META_COLUMNS.map((_, i) => 'Field' + i).join(',')}
${HEADER_ROW}
G1001,Jordan Lee,2026-10-19,Open,80,78,78,-2,-45.00,2340.00,2200,140.00,4,0,0,0,0,0,0,0,0,0,0,0,0,,,,,Ardmore-Broadway,E1001
`;
    const rows = parsePayrollReadinessCSV(noisyMetadata, META_COLUMNS);
    expect(rows).toHaveLength(1);
    expect(rows[0].geid).toBe('G1001');
  });

  it('returns [] when no header row is found in the first 10 lines (shape drifted, or the reportKey guess is wrong)', () => {
    const drifted = 'some,other,header,shape\na,b,c,d\n';
    expect(parsePayrollReadinessCSV(drifted, META_COLUMNS)).toEqual([]);
  });

  it('a real empty report (no data rows) parses as []', () => {
    const emptyReport = `Payroll Readiness\nDate Range,10/02/2026 - 11/01/2026\n${HEADER_ROW}\n`;
    expect(parsePayrollReadinessCSV(emptyReport, META_COLUMNS)).toEqual([]);
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
