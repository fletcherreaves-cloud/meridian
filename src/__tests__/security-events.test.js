// @ts-nocheck
// Dispatch #58 -- event_details row parser tests.
//
// ⚠️ HARD CONSTRAINT: every fixture below is SYNTHETIC. Nothing here is copied from the real
// captured event_details response (memory/finding-qsrsoft-event-details-endpoint-2026-08-21.md)
// -- that response carries plaintext crew/manager names and badge numbers, and nothing from it
// belongs in a test file. Names ("Fixture Crew"), badges, and order keys here are made up.
//
// ⚠️ CORRECTED 2026-11-09: BASE_ROW previously carried an `event_token` field. A live capture
// against the real event_details endpoint (same day) confirmed real rows never carry one -- the
// event type is only known from which event_token the request itself was scoped to. The old
// fixture's `event_token` field was itself the bug this file's own tests should have caught and
// didn't, because the fixture was never checked against a real response (see security-events.js's
// isUsableRow comment for the full story). Every row here now omits event_token and passes it via
// the `eventToken` option instead, matching the real API and the corrected parser contract.
import { describe, it, expect } from 'vitest';
import { EVENT_TOKENS, storeRefFromLoc, parseSecurityEventRow, parseSecurityEventRows } from '../engine/security-events.js';

const BASE_ROW = {
  event_dt: '2026-08-14', event_tm: '23:44:07',
  reg_num: 'POS0013', order_key: 'POS0012:918273645',
  event_name: 'Mobile Promo', event_display: 'Mobile Promo', event_amt: 3.89,
  remaining_amt: 5.21, tender_type: 'Cash', daypart_name: 'Dinner',
  store_busn_dt: '2026-08-14',
  crew: 'Fixture Crew - 91', mgr: 'Fixture Manager - 100', mgr_code: 'true',
  pos_session_start_dt: '2026-08-14', pos_session_start_tm: '22:10:00',
};

describe('EVENT_TOKENS', () => {
  it('is exactly the 8 enumerated tokens across 5 families', () => {
    expect(EVENT_TOKENS).toEqual([
      'all_promo', 't_red_before', 't_red_after', 'cash_refund', 'cashless_refund',
      'employee_meal', 'manager_meal', 'pos_overring',
    ]);
  });
});

describe('storeRefFromLoc — the unpadded NSN this API expects', () => {
  it('strips leading zeros from a padded loc', () => {
    expect(storeRefFromLoc('0029760')).toBe('29760');
    expect(storeRefFromLoc('0006178')).toBe('6178');
  });
});

describe('parseSecurityEventRow — the fields the owner actually asked for', () => {
  it('extracts event_dt/event_tm (time of event) and reg_num (register worked) verbatim', () => {
    const r = parseSecurityEventRow(BASE_ROW, { loc: '0029760', eventToken: 'all_promo' });
    expect(r.eventDt).toBe('2026-08-14');
    expect(r.eventTm).toBe('23:44:07');
    expect(r.regNum).toBe('POS0013');
  });

  it('carries loc as the caller-supplied padded value, not derived from the raw row', () => {
    const r = parseSecurityEventRow(BASE_ROW, { loc: '0029760', eventToken: 'all_promo' });
    expect(r.loc).toBe('0029760');
  });

  it('all 8 event tokens round-trip through the parser unchanged, from the caller-supplied option', () => {
    for (const token of EVENT_TOKENS) {
      const r = parseSecurityEventRow(BASE_ROW, { loc: '0006178', eventToken: token });
      expect(r.eventToken).toBe(token);
    }
  });

  it('eventToken is never read from the raw row, even if one is present', () => {
    const r = parseSecurityEventRow({ ...BASE_ROW, event_token: 'pos_overring' }, { loc: '0006178', eventToken: 'all_promo' });
    expect(r.eventToken).toBe('all_promo');
  });
});

describe('parseSecurityEventRow — crew/mgr "Name - badge" parsing', () => {
  it('splits a normal "Name - NN" string into name and badge', () => {
    const r = parseSecurityEventRow(BASE_ROW, { loc: '0006178', eventToken: 'all_promo' });
    expect(r.crewName).toBe('Fixture Crew');
    expect(r.crewBadge).toBe('91');
    expect(r.mgrName).toBe('Fixture Manager');
    expect(r.mgrBadge).toBe('100');
  });

  it('"Unavailable" is an honest null, not a fabricated name', () => {
    const r = parseSecurityEventRow({ ...BASE_ROW, mgr: 'Unavailable' }, { loc: '0006178', eventToken: 'all_promo' });
    expect(r.mgrName).toBe(null);
    expect(r.mgrBadge).toBe(null);
  });

  it('"Unknown" is an honest null too', () => {
    const r = parseSecurityEventRow({ ...BASE_ROW, crew: 'Unknown' }, { loc: '0006178', eventToken: 'all_promo' });
    expect(r.crewName).toBe(null);
    expect(r.crewBadge).toBe(null);
  });

  it('a name with no trailing " - NN" keeps the name but drops the badge, never throws', () => {
    const r = parseSecurityEventRow({ ...BASE_ROW, crew: 'Fixture Crew No Badge' }, { loc: '0006178', eventToken: 'all_promo' });
    expect(r.crewName).toBe('Fixture Crew No Badge');
    expect(r.crewBadge).toBe(null);
  });

  it('empty/missing crew or mgr is an honest null, never "undefined" or an empty string', () => {
    const r = parseSecurityEventRow({ ...BASE_ROW, crew: '', mgr: undefined }, { loc: '0006178', eventToken: 'all_promo' });
    expect(r.crewName).toBe(null);
    expect(r.mgrName).toBe(null);
  });
});

describe('parseSecurityEventRow — PII: no plaintext name or badge leaks past the intended fields', () => {
  it('the parsed row carries the name only under crewName/mgrName -- no raw "crew"/"mgr" key survives', () => {
    const r = parseSecurityEventRow(BASE_ROW, { loc: '0006178', eventToken: 'all_promo' });
    expect(Object.prototype.hasOwnProperty.call(r, 'crew')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(r, 'mgr')).toBe(false);
  });

  it('a batch result carries no plaintext fixture names outside crewName/mgrName either', () => {
    const out = parseSecurityEventRows([BASE_ROW, BASE_ROW], { loc: '0006178', eventToken: 'cash_refund' });
    for (const r of out) {
      const { crewName, mgrName, ...rest } = r;
      expect(JSON.stringify(rest)).not.toMatch(/Fixture Crew|Fixture Manager/);
    }
  });
});

describe('parseSecurityEventRow — remaining_amt is opaque', () => {
  it('is passed through verbatim, never derived or renamed to imply a known meaning', () => {
    const r = parseSecurityEventRow(BASE_ROW, { loc: '0006178', eventToken: 'all_promo' });
    expect(r.remainingAmt).toBe(5.21);
  });

  it('a string numeric value still parses', () => {
    const r = parseSecurityEventRow({ ...BASE_ROW, remaining_amt: '5.21' }, { loc: '0006178', eventToken: 'all_promo' });
    expect(r.remainingAmt).toBe(5.21);
  });
});

describe('parseSecurityEventRow — the honest-null / dropped-row cases', () => {
  it('missing required fields (eventToken, event_dt, event_tm, or loc) -> dropped, not thrown', () => {
    expect(parseSecurityEventRow(BASE_ROW, { loc: '0006178', eventToken: undefined })).toBe(null);
    expect(parseSecurityEventRow({ ...BASE_ROW, event_dt: undefined }, { loc: '0006178', eventToken: 'all_promo' })).toBe(null);
    expect(parseSecurityEventRow({ ...BASE_ROW, event_tm: undefined }, { loc: '0006178', eventToken: 'all_promo' })).toBe(null);
    expect(parseSecurityEventRow(BASE_ROW, { loc: undefined, eventToken: 'all_promo' })).toBe(null);
    expect(parseSecurityEventRow(null, { loc: '0006178', eventToken: 'all_promo' })).toBe(null);
  });

  it('optional fields (reg_num, order_key, mgr_code, pos_session_start_*) default to null when absent', () => {
    const minimal = { event_dt: '2026-08-14', event_tm: '10:00:00' };
    const r = parseSecurityEventRow(minimal, { loc: '0006178', eventToken: 'pos_overring' });
    expect(r.regNum).toBe(null);
    expect(r.orderKey).toBe(null);
    expect(r.mgrCode).toBe(null);
    expect(r.posSessionStartDt).toBe(null);
    expect(r.crewName).toBe(null);
    expect(r.mgrName).toBe(null);
  });
});

describe('parseSecurityEventRows — batch', () => {
  it('normalizes every usable row and drops unusable ones, preserving order', () => {
    const malformed = { ...BASE_ROW, event_dt: undefined };
    const out = parseSecurityEventRows([BASE_ROW, malformed, BASE_ROW], { loc: '0006178', eventToken: 'pos_overring' });
    expect(out).toHaveLength(2);
    expect(out.map(r => r.eventToken)).toEqual(['pos_overring', 'pos_overring']);
  });

  it('a non-array input returns an empty array rather than throwing', () => {
    expect(parseSecurityEventRows(null, { loc: '0006178', eventToken: 'all_promo' })).toEqual([]);
    expect(parseSecurityEventRows(undefined, { loc: '0006178', eventToken: 'all_promo' })).toEqual([]);
    expect(parseSecurityEventRows('not an array', { loc: '0006178', eventToken: 'all_promo' })).toEqual([]);
  });

  it('every row in one batch call is tagged with the SAME caller-supplied eventToken (one request = one event_token)', () => {
    const out = parseSecurityEventRows([BASE_ROW, BASE_ROW, BASE_ROW], { loc: '0006178', eventToken: 't_red_before' });
    expect(out.every(r => r.eventToken === 't_red_before')).toBe(true);
  });
});
