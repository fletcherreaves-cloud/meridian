// @ts-nocheck
// scripts/qsrsoft-pay-history-pull.mjs — owner request 2026-11-05 ("we can also infer wages in
// the past from this report"). No supabase/fetch dependency in mapRow()/extractRows()/
// assertNoDeniedSelectCols() themselves, cheap to test directly — same reasoning qsrsoft-punch-
// times-pull.test.js already gives for testing a scripts/ module this way.
//
// Per this repo's own verification bar: "A real test exercises the assert-guard (confirms it
// actually fails when a blocked field is present), not just a comment." The whole
// assertNoDeniedSelectCols describe block below is that test.
//
// All fixtures below are 100% synthetic (fake geid, fake rates/hours) — matching this repo's
// standing PII-fixture discipline. Never copy real sample rows from a live capture into a test
// fixture (the real numbers measured live this session went into the memory/ finding doc only).
import { describe, it, expect } from 'vitest';
import {
  mapRow, extractRows, assertNoDeniedSelectCols, SELECT_COLS,
} from '../../scripts/qsrsoft-pay-history-pull.mjs';

const REGULAR_ROW = {
  storeNum: 3708, geid: '12345678', payType: 'Regular', startDate: '2026-08-05', endDate: '2026-08-18',
  hourlyPayRate: 12.0, jobTitleCode: 650, totalHours: 77.73, totalDollars: 932.76, isFinal: 'Y',
};
const OVERTIME_ROW = {
  storeNum: 3708, geid: '12345678', payType: 'Overtime', startDate: '2026-08-05', endDate: '2026-08-18',
  hourlyPayRate: 18.0, jobTitleCode: 650, totalHours: 1.78, totalDollars: 32.04, isFinal: 'Y',
};

describe('mapRow()', () => {
  it('pads storeNum to a 7-char loc', () => {
    expect(mapRow(REGULAR_ROW, 3708).loc).toBe('0003708');
    expect(mapRow({ ...REGULAR_ROW, storeNum: 43701 }, 43701).loc).toBe('0043701');
  });

  it('falls back to the passed-in nsn when storeNum is absent on the row', () => {
    const { storeNum, ...noStoreNum } = REGULAR_ROW;
    expect(mapRow(noStoreNum, 3708).loc).toBe('0003708');
  });

  it('passes geid through as a trimmed string, never a name', () => {
    expect(mapRow(REGULAR_ROW, 3708).geid).toBe('12345678');
    expect(mapRow({ ...REGULAR_ROW, geid: '  99  ' }, 3708).geid).toBe('99');
  });

  it('geid is null (not undefined/empty) when missing — honest-missing, like every other normalizer in this repo', () => {
    const { geid, ...withoutGeid } = REGULAR_ROW;
    expect(mapRow(withoutGeid, 3708).geid).toBeNull();
  });

  it('payType is a raw passthrough — Regular and Overtime both survive unchanged, no hardcoded enum', () => {
    expect(mapRow(REGULAR_ROW, 3708).payType).toBe('Regular');
    expect(mapRow(OVERTIME_ROW, 3708).payType).toBe('Overtime');
  });

  it('an unrecognized payType still passes through rather than being dropped or coerced', () => {
    expect(mapRow({ ...REGULAR_ROW, payType: 'Holiday' }, 3708).payType).toBe('Holiday');
  });

  it('maps period start/end from startDate/endDate', () => {
    const r = mapRow(REGULAR_ROW, 3708);
    expect(r.periodStart).toBe('2026-08-05');
    expect(r.periodEnd).toBe('2026-08-18');
  });

  it('carries hourlyPayRate, totalHours, totalDollars as numbers', () => {
    const r = mapRow(REGULAR_ROW, 3708);
    expect(r.hourlyPayRate).toBe(12.0);
    expect(r.totalHours).toBe(77.73);
    expect(r.totalDollars).toBe(932.76);
  });

  it('the real measured relationship: an Overtime row\'s rate is independently carried, not derived here', () => {
    // mapRow() does NOT compute or assume the 1.5x relationship -- it just passes through
    // whatever QSRSoft reports for each payType row. The 1.5x finding (memory/finding-crew-
    // pay-rate-ot-blending-2026-11-05.md's sibling measurement for this endpoint) is a property
    // of the real data, not logic this function enforces.
    expect(mapRow(OVERTIME_ROW, 3708).hourlyPayRate).toBe(18.0);
    expect(mapRow(REGULAR_ROW, 3708).hourlyPayRate).toBe(12.0);
  });

  it('isFinal: "Y"/"Yes" (any case) -> true, anything else -> false, missing -> null', () => {
    expect(mapRow({ ...REGULAR_ROW, isFinal: 'Y' }, 3708).isFinal).toBe(true);
    expect(mapRow({ ...REGULAR_ROW, isFinal: 'yes' }, 3708).isFinal).toBe(true);
    expect(mapRow({ ...REGULAR_ROW, isFinal: 'N' }, 3708).isFinal).toBe(false);
    const { isFinal, ...withoutFinal } = REGULAR_ROW;
    expect(mapRow(withoutFinal, 3708).isFinal).toBeNull();
  });

  it('a blank/null numeric field maps to null, not 0 or NaN', () => {
    const r = mapRow({ ...REGULAR_ROW, hourlyPayRate: '', totalHours: null }, 3708);
    expect(r.hourlyPayRate).toBeNull();
    expect(r.totalHours).toBeNull();
  });
});

describe('extractRows()', () => {
  it('handles a bare array', () => {
    expect(extractRows([REGULAR_ROW], 'unit')).toEqual([REGULAR_ROW]);
  });
  it('handles {result: [...]}', () => {
    expect(extractRows({ result: [REGULAR_ROW] }, 'unit')).toEqual([REGULAR_ROW]);
  });
  it('handles {result: {resp: [...]}}', () => {
    expect(extractRows({ result: { resp: [REGULAR_ROW] } }, 'unit')).toEqual([REGULAR_ROW]);
  });
  it('handles {resp: [...]}', () => {
    expect(extractRows({ resp: [REGULAR_ROW] }, 'unit')).toEqual([REGULAR_ROW]);
  });
  it('returns [] on an unrecognized shape rather than throwing', () => {
    expect(extractRows({ somethingElse: 1 }, 'unit')).toEqual([]);
    expect(extractRows(null, 'unit')).toEqual([]);
  });
});

describe('assertNoDeniedSelectCols()', () => {
  it('the real SELECT_COLS passes (no denied field present)', () => {
    expect(() => assertNoDeniedSelectCols(SELECT_COLS)).not.toThrow();
  });
  it('the real SELECT_COLS never requests a name field', () => {
    const lower = SELECT_COLS.map(c => c.toLowerCase());
    expect(lower).not.toContain('fullemployeename');
    expect(lower).not.toContain('firstname');
    expect(lower).not.toContain('lastname');
  });
  it('throws if SELECT_COLS is ever widened to include ssn', () => {
    expect(() => assertNoDeniedSelectCols([...SELECT_COLS, 'ssn'])).toThrow(/denied/i);
  });
  it('throws if SELECT_COLS is ever widened to include a name field', () => {
    expect(() => assertNoDeniedSelectCols([...SELECT_COLS, 'fullEmployeeName'])).toThrow(/denied/i);
  });
  it('throws if SELECT_COLS is ever widened to include address/email/phone', () => {
    expect(() => assertNoDeniedSelectCols([...SELECT_COLS, 'streetAddress'])).toThrow(/denied/i);
    expect(() => assertNoDeniedSelectCols([...SELECT_COLS, 'email'])).toThrow(/denied/i);
    expect(() => assertNoDeniedSelectCols([...SELECT_COLS, 'cellPhone'])).toThrow(/denied/i);
  });
});
