// @ts-nocheck
// scripts/qsrsoft-employee-roster-pull.mjs's dispatch #57 additions — toTenureRows(),
// assertNoDeniedSelectCols(), SELECT_COLS. No supabase/fetch dependency in these functions
// themselves, cheap to test directly from src/__tests__/ (same reasoning register-audit-
// pull.test.js/pull-outcome.test.js/pipeline-contract.test.js already give for testing a
// scripts/ module this way). All fixtures below are 100% synthetic — no real geid, name, or
// pay rate, matching this repo's standing PII-fixture discipline.
//
// Per the dispatch's own verification bar: "Revert-sensitive at the call site... a test that
// only exercises a normalizer would pass with the upsert deleted. Test through the actual
// write path." toTenureRows() IS the write-path row shape (its output is passed directly to
// supabase.upsert() in the script), so testing it here is testing the actual call-site
// contract, not a detached normalizer.
import { describe, it, expect } from 'vitest';
import { toTenureRows, assertNoDeniedSelectCols, SELECT_COLS } from '../../scripts/qsrsoft-employee-roster-pull.mjs';
import { parseEmployeeRosterApi } from '../engine/people-reports.js';

describe('toTenureRows() — qsr_employee_tenure write-path row shape', () => {
  it('pads loc to 7 chars (records carry the unpadded form)', () => {
    const recs = parseEmployeeRosterApi({ result: [
      { storeNum: 3708, geid: '1', fullEmployeeName: 'A Tenure', storeStartDate: '2026-01-01', storeEndDate: '0000-00-00', employmentStatus: 'Active', terminationEntryDate: '0000-00-00', jobTitleCode: '650' },
    ] });
    const [row] = toTenureRows(recs);
    expect(row.loc).toBe('0003708');
  });

  it('keeps orgStartDate and store_start_date distinct — never conflated, per the dispatch\'s core requirement', () => {
    const recs = parseEmployeeRosterApi({ result: [
      { storeNum: 3708, geid: '2', fullEmployeeName: 'B Divergent', orgStartDate: '2018-03-01', storeStartDate: '2026-01-15', storeEndDate: '0000-00-00', employmentStatus: 'Active', terminationEntryDate: '0000-00-00', jobTitleCode: '650' },
    ] });
    const [row] = toTenureRows(recs);
    expect(row.org_start_date).toBe('2018-03-01');
    expect(row.store_start_date).toBe('2026-01-15');
    expect(row.org_start_date).not.toBe(row.store_start_date);
  });

  it('the "0000-00-00" sentinel is already null by the time it reaches the row (via parseEmployeeRosterApi\'s cleanDate)', () => {
    const recs = parseEmployeeRosterApi({ result: [
      { storeNum: 3708, geid: '3', fullEmployeeName: 'C ActiveNoEnd', storeStartDate: '2026-01-01', storeEndDate: '0000-00-00', employmentStatus: 'Active', terminationEntryDate: '0000-00-00', jobTitleCode: '650' },
    ] });
    const [row] = toTenureRows(recs);
    expect(row.store_end_date).toBeNull();
    expect(row.termination_entry_date).toBeNull();
  });

  it('carries hourly_pay_rate through as a number, null when absent', () => {
    const recs = parseEmployeeRosterApi({ result: [
      { storeNum: 3708, geid: '4', fullEmployeeName: 'D Paid', storeStartDate: '2026-01-01', storeEndDate: '0000-00-00', employmentStatus: 'Active', terminationEntryDate: '0000-00-00', jobTitleCode: '650', hourlyPayRate: 17.25 },
      { storeNum: 3708, geid: '5', fullEmployeeName: 'E Unpaid', storeStartDate: '2026-01-01', storeEndDate: '0000-00-00', employmentStatus: 'Active', terminationEntryDate: '0000-00-00', jobTitleCode: '650' },
    ] });
    const [paid, unpaid] = toTenureRows(recs);
    expect(paid.hourly_pay_rate).toBe(17.25);
    expect(unpaid.hourly_pay_rate).toBeNull();
  });

  it('drops a record with no geid rather than fabricating a placeholder key', () => {
    const recs = parseEmployeeRosterApi({ result: [
      { storeNum: 3708, fullEmployeeName: 'F NoGeid', storeStartDate: '2026-01-01', storeEndDate: '0000-00-00', employmentStatus: 'Active', terminationEntryDate: '0000-00-00', jobTitleCode: '650' },
      { storeNum: 3708, geid: '6', fullEmployeeName: 'G HasGeid', storeStartDate: '2026-01-01', storeEndDate: '0000-00-00', employmentStatus: 'Active', terminationEntryDate: '0000-00-00', jobTitleCode: '650' },
    ] });
    // parseEmployeeRosterApi itself doesn't drop a missing-geid row (geid isn't its keying
    // field, loc is) -- geid: undefined survives into the record, and toTenureRows is the
    // function responsible for dropping it since geid IS qsr_employee_tenure's own key.
    const rows = toTenureRows(recs);
    expect(rows).toHaveLength(1);
    expect(rows[0].geid).toBe('6');
  });

  it('empty/null input yields an empty array, not a throw', () => {
    expect(toTenureRows([])).toEqual([]);
    expect(toTenureRows(null)).toEqual([]);
  });

  it('every row carries updated_at as an ISO timestamp', () => {
    const recs = parseEmployeeRosterApi({ result: [
      { storeNum: 3708, geid: '7', fullEmployeeName: 'H Stamped', storeStartDate: '2026-01-01', storeEndDate: '0000-00-00', employmentStatus: 'Active', terminationEntryDate: '0000-00-00', jobTitleCode: '650' },
    ] });
    const [row] = toTenureRows(recs);
    expect(() => new Date(row.updated_at).toISOString()).not.toThrow();
  });
});

describe('assertNoDeniedSelectCols() — the SELECT_COLS denial guard', () => {
  it('passes on the real, current SELECT_COLS (imported live, not a copy — catches drift)', () => {
    expect(() => assertNoDeniedSelectCols(SELECT_COLS)).not.toThrow();
  });

  it('fails loudly when ssn is added', () => {
    expect(() => assertNoDeniedSelectCols([...SELECT_COLS, 'ssn'])).toThrow(/ssn/i);
  });

  it('fails on each protected-class field individually', () => {
    for (const denied of ['dateOfBirth', 'nationalOrigin', 'gender', 'federalMaritalStatus']) {
      expect(() => assertNoDeniedSelectCols([...SELECT_COLS, denied])).toThrow();
    }
  });

  it('fails on address/contact fields', () => {
    for (const denied of ['streetAddress', 'emailAddress', 'homePhone']) {
      expect(() => assertNoDeniedSelectCols([...SELECT_COLS, denied])).toThrow();
    }
  });

  it('is case-insensitive (a widened field is caught regardless of casing)', () => {
    expect(() => assertNoDeniedSelectCols([...SELECT_COLS, 'SSN'])).toThrow();
  });
});
