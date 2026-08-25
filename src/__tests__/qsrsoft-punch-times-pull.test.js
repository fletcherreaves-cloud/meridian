// @ts-nocheck
// scripts/qsrsoft-punch-times-pull.mjs — dispatch #124, un-tokenized by dispatch #126. No
// supabase/fetch dependency in mapRow()/extractRows()/assertNoDeniedSelectCols() themselves,
// cheap to test directly, same reasoning register-audit-pull.test.js / employee-roster-tenure-
// pull.test.js already give for testing a scripts/ module this way. resolveEmployeeIdentity()
// (dispatch #126 — was resolveEmpTokens(), now resolves employeeName as the primary field
// alongside the kept empToken) is tested with a mocked supabase client (matching
// identity-vault.test.js's own pattern), since this sandbox has no live Supabase to exercise a
// real qsr_employee_tenure join against.
//
// Per this dispatch's own verification bar: "A real test exercises the assert-guard (confirms it
// actually fails when a blocked field is present), not just a comment." The whole
// assertNoDeniedSelectCols describe block below is that test — it imports SELECT_COLS live (not
// a copy), constructs a call with ssn added, and asserts it throws.
//
// All fixtures below are 100% synthetic — no real geid, name, or timestamp, matching this repo's
// standing PII-fixture discipline (register-audit-pull.test.js, employee-roster-tenure-pull.test.js).
import { describe, it, expect, vi } from 'vitest';
import {
  mapRow, extractRows, assertNoDeniedSelectCols, SELECT_COLS, resolveEmployeeIdentity,
} from '../../scripts/qsrsoft-punch-times-pull.mjs';

// Shaped like the finding's documented safe-field list (memory/finding-qsrsoft-time-punches-
// endpoint-2026-08-21.md) — no ssn, no name, since this script never requests either.
const SHIFT_ROW = {
  storeNum: 3708, geid: '12345678', punchType: 'shift', isPaidBreak: null,
  startDateTime: '2026-08-20T09:02:00Z', endDateTime: '2026-08-20T17:15:00Z',
  inModified: 0, outModified: 0, jobTitleCode: 650, badgeType: 'Primary',
};
const MEAL_ROW = {
  storeNum: 3708, geid: '12345678', punchType: 'meal', isPaidBreak: 0,
  startDateTime: '2026-08-20T12:30:00Z', endDateTime: '2026-08-20T13:00:00Z',
  inModified: 0, outModified: 1, jobTitleCode: 650, badgeType: 'Primary',
};

describe('mapRow() — field-by-field against the finding\'s documented safe-field shape', () => {
  it('pads storeNum to a 7-char loc', () => {
    expect(mapRow(SHIFT_ROW).loc).toBe('0003708');
    expect(mapRow({ ...SHIFT_ROW, storeNum: 43701 }).loc).toBe('0043701');
  });

  it('passes geid through as a trimmed string, never a name', () => {
    expect(mapRow(SHIFT_ROW).geid).toBe('12345678');
    expect(mapRow({ ...SHIFT_ROW, geid: '  99  ' }).geid).toBe('99');
  });

  it('geid is null (not undefined/empty) when missing — honest-missing, like every other normalizer in this repo', () => {
    const { geid, ...withoutGeid } = SHIFT_ROW;
    expect(mapRow(withoutGeid).geid).toBeNull();
  });

  it('punchType is a raw passthrough — shift and meal both survive unchanged, no hardcoded enum', () => {
    expect(mapRow(SHIFT_ROW).punchType).toBe('shift');
    expect(mapRow(MEAL_ROW).punchType).toBe('meal');
  });

  it('an UNRECOGNIZED punchType still passes through rather than being dropped or coerced', () => {
    expect(mapRow({ ...SHIFT_ROW, punchType: 'training' }).punchType).toBe('training');
  });

  it('isPaidBreak: null on a shift row, false on meal (0), tolerant of a future non-zero/1 value', () => {
    expect(mapRow(SHIFT_ROW).isPaidBreak).toBeNull();
    expect(mapRow(MEAL_ROW).isPaidBreak).toBe(false);
    expect(mapRow({ ...MEAL_ROW, isPaidBreak: 1 }).isPaidBreak).toBe(true);
  });

  it('passes startDateTime/endDateTime through as raw strings — no business-day derivation applied here', () => {
    const r = mapRow(SHIFT_ROW);
    expect(r.startDateTime).toBe('2026-08-20T09:02:00Z');
    expect(r.endDateTime).toBe('2026-08-20T17:15:00Z');
  });

  it('endDateTime is null when absent (an open/still-clocked-in punch), not fabricated', () => {
    const { endDateTime, ...open } = SHIFT_ROW;
    expect(mapRow(open).endDateTime).toBeNull();
  });

  it('in_modified/out_modified are the punch-edit flags, coerced from 0/1 to boolean', () => {
    expect(mapRow(SHIFT_ROW).inModified).toBe(false);
    expect(mapRow(SHIFT_ROW).outModified).toBe(false);
    expect(mapRow(MEAL_ROW).outModified).toBe(true);
  });

  it('badgeType is a raw passthrough — "Primary" and any other value both survive, no hardcoded check', () => {
    expect(mapRow(SHIFT_ROW).badgeType).toBe('Primary');
    expect(mapRow({ ...SHIFT_ROW, badgeType: 'Temporary' }).badgeType).toBe('Temporary');
    expect(mapRow({ ...SHIFT_ROW, badgeType: null }).badgeType).toBeNull();
  });

  it('jobTitleCode passes through unchanged', () => {
    expect(mapRow(SHIFT_ROW).jobTitleCode).toBe(650);
  });

  it('never produces a name or ssn field on the mapped row, even if the raw row somehow carried one', () => {
    const contaminated = { ...SHIFT_ROW, ssn: '123456789', fullEmployeeName: 'Real Person' };
    const r = mapRow(contaminated);
    expect(r.ssn).toBeUndefined();
    expect(r.name).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('123456789');
    expect(JSON.stringify(r)).not.toContain('Real Person');
  });
});

describe('extractRows — response envelope', () => {
  const R = [{ storeNum: 3708 }, { storeNum: 6178 }];

  it('accepts a bare array', () => {
    expect(extractRows(R, 'unit')).toEqual(R);
  });

  it('accepts {result:{resp:[...]}}, {resp:[...]}, {result:[...]}, {data:[...]}', () => {
    expect(extractRows({ result: { resp: R } }, 'unit')).toEqual(R);
    expect(extractRows({ resp: R }, 'unit')).toEqual(R);
    expect(extractRows({ result: R }, 'unit')).toEqual(R);
    expect(extractRows({ data: R }, 'unit')).toEqual(R);
  });

  it('returns [] and logs the SHAPE only (never row values) on an unknown envelope', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(extractRows({ payload: R, status: 'ok' }, 'chunk-1')).toEqual([]);
    const msg = err.mock.calls[0][0];
    expect(msg).toContain('payload[2]');
    expect(msg).not.toContain('6178');
    err.mockRestore();
  });

  it('does not throw on a non-object body', () => {
    expect(extractRows('<html>nope</html>', 'unit')).toEqual([]);
    expect(extractRows(null, 'unit')).toEqual([]);
  });
});

describe('assertNoDeniedSelectCols() — the SELECT_COLS denial guard (dispatch #124 rule 3)', () => {
  it('passes on the real, current SELECT_COLS (imported live, not a copy — catches drift)', () => {
    expect(() => assertNoDeniedSelectCols(SELECT_COLS)).not.toThrow();
  });

  it('never requests ssn or a name field in the first place', () => {
    const lower = SELECT_COLS.map(c => c.toLowerCase());
    expect(lower).not.toContain('ssn');
    expect(lower.some(c => c.includes('name'))).toBe(false);
  });

  it('fails loudly when ssn is added back — the actual guard behaviour, not just a comment', () => {
    expect(() => assertNoDeniedSelectCols([...SELECT_COLS, 'ssn'])).toThrow(/ssn/i);
  });

  it('fails when a name field is added back (this endpoint is documented to carry one)', () => {
    for (const denied of ['fullEmployeeName', 'employeeName', 'firstName', 'lastName']) {
      expect(() => assertNoDeniedSelectCols([...SELECT_COLS, denied])).toThrow();
    }
  });

  it('fails on each protected-class / contact field individually, mirroring the roster endpoint\'s denylist', () => {
    for (const denied of ['dateOfBirth', 'nationalOrigin', 'gender', 'streetAddress', 'emailAddress', 'homePhone']) {
      expect(() => assertNoDeniedSelectCols([...SELECT_COLS, denied])).toThrow();
    }
  });

  it('is case-insensitive (a widened field is caught regardless of casing)', () => {
    expect(() => assertNoDeniedSelectCols([...SELECT_COLS, 'SSN'])).toThrow();
    expect(() => assertNoDeniedSelectCols([...SELECT_COLS, 'FullEmployeeName'])).toThrow();
  });

  it('importing the module itself does not throw — the guard runs clean against the real SELECT_COLS at import time', async () => {
    await expect(import('../../scripts/qsrsoft-punch-times-pull.mjs')).resolves.toBeTruthy();
  });
});

describe('resolveEmployeeIdentity() — geid → qsr_employee_tenure.full_employee_name → {employeeName, empToken} (dispatch #126)', () => {
  function mockSupabase({ tenureRows = [], rpcImpl } = {}) {
    return {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            in: vi.fn(async () => ({ data: tenureRows, error: null })),
          })),
        })),
      })),
      rpc: vi.fn(rpcImpl || (async (_fn, { p_employee_name }) => ({ data: `tok-${p_employee_name}`, error: null }))),
    };
  }

  const rows = (over = []) => [
    { loc: '0003708', geid: '12345678', punchType: 'shift' },
    { loc: '0003708', geid: '12345678', punchType: 'meal' }, // same person, second punch — must not double-resolve
    ...over,
  ];

  it('resolves a geid with a matching tenure row to BOTH employeeName (primary) and empToken (kept, dispatch #126)', async () => {
    const supabase = mockSupabase({ tenureRows: [{ loc: '0003708', geid: '12345678', full_employee_name: 'A Synthetic Name' }] });
    const map = await resolveEmployeeIdentity(supabase, rows());
    expect(map.get('0003708|12345678')).toEqual({ employeeName: 'A Synthetic Name', empToken: 'tok-A Synthetic Name' });
  });

  it('calls the identity-vault RPC exactly once per DISTINCT resolved name, not once per punch row', async () => {
    const supabase = mockSupabase({ tenureRows: [{ loc: '0003708', geid: '12345678', full_employee_name: 'A Synthetic Name' }] });
    await resolveEmployeeIdentity(supabase, rows());
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('leaves employeeName/empToken unresolved (map has no entry) for a geid absent from qsr_employee_tenure — geid stays the fallback key', async () => {
    const supabase = mockSupabase({ tenureRows: [] });
    const map = await resolveEmployeeIdentity(supabase, rows());
    expect(map.has('0003708|12345678')).toBe(false);
    expect(map.size).toBe(0);
  });

  it('two different geids resolving to the SAME name still cost only one RPC call (name-cache, not geid-cache), and share the same employeeName + empToken', async () => {
    const supabase = mockSupabase({
      tenureRows: [
        { loc: '0003708', geid: '111', full_employee_name: 'Shared Name' },
        { loc: '0003708', geid: '222', full_employee_name: 'Shared Name' },
      ],
    });
    const twoRows = [
      { loc: '0003708', geid: '111', punchType: 'shift' },
      { loc: '0003708', geid: '222', punchType: 'shift' },
    ];
    const map = await resolveEmployeeIdentity(supabase, twoRows);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(map.get('0003708|111').employeeName).toBe('Shared Name');
    expect(map.get('0003708|111')).toEqual(map.get('0003708|222'));
  });

  it('returns an empty map without touching supabase when there are no rows or no client', async () => {
    const supabase = mockSupabase();
    expect((await resolveEmployeeIdentity(supabase, [])).size).toBe(0);
    expect(supabase.from).not.toHaveBeenCalled();
    expect((await resolveEmployeeIdentity(null, rows())).size).toBe(0);
  });

  it('never throws and simply returns an empty map when the tenure lookup errors', async () => {
    const supabase = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ in: vi.fn(() => ({ in: vi.fn(async () => ({ data: null, error: { message: 'boom' } })) })) })) })),
      rpc: vi.fn(),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const map = await resolveEmployeeIdentity(supabase, rows());
    expect(map.size).toBe(0);
    expect(supabase.rpc).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
