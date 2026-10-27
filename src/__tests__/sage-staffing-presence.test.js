// @ts-nocheck
// 2026-10-27 -- SAGE had no tool at all for staffing/presence questions ("which stores have GMs
// working more closing shifts") until this one. Imports supabase/functions/sage-chat/
// staffing-presence.js directly -- the same plain-JS module index.ts's query_staffing_presence
// tool calls. No Deno test infrastructure exists in this repo to boot the edge function itself,
// so this is the closest thing to the real call site: reverting the aggregation or the role
// classification (not just their wiring into index.ts) makes these tests fail. Same pattern as
// sage-paginate.test.js, sage-stream-events.test.js, sage-final-round-nudge.test.js.
//
// Also guards the PII handling: this module must NEVER surface employee_name or raw geid
// values in its output -- only role-level, store-level counts.
import { describe, it, expect } from 'vitest';
import {
  localHour,
  classifyPunchRole,
  aggregateStaffingPresence,
  STAFFING_PRESENCE_NOTE,
} from '../../supabase/functions/sage-chat/staffing-presence.js';

describe('staffing-presence -- localHour (America/Chicago, hourCycle h23)', () => {
  it('converts a UTC evening timestamp to the correct Central local hour', () => {
    // 2026-05-27T16:04:00+00:00 (from a real sample row) -- late May is CDT (UTC-5), so 16:04
    // UTC = 11:04 local.
    expect(localHour('2026-05-27T16:04:00+00:00')).toBe(11);
  });

  it('handles a late-night UTC timestamp crossing into the next local day', () => {
    // 2026-05-28T00:00:00+00:00 (CDT, UTC-5) = 2026-05-27T19:00:00 local.
    expect(localHour('2026-05-28T00:00:00+00:00')).toBe(19);
  });

  it('never returns "24" for local midnight -- hourCycle:h23 pinned explicitly, not hour12:false', () => {
    // 2026-05-28T05:00:00+00:00 (CDT, UTC-5) = exactly 2026-05-28T00:00:00 local midnight.
    expect(localHour('2026-05-28T05:00:00+00:00')).toBe(0);
  });

  it('returns null for a missing timestamp rather than throwing', () => {
    expect(localHour(null)).toBeNull();
    expect(localHour(undefined)).toBeNull();
  });
});

describe('staffing-presence -- classifyPunchRole', () => {
  it('classifies GM job codes (45, 641)', () => {
    expect(classifyPunchRole(45)).toBe('gm');
    expect(classifyPunchRole(641)).toBe('gm');
  });
  it('classifies SM job code (647)', () => {
    expect(classifyPunchRole(647)).toBe('sm');
  });
  it('classifies DM/AM job codes (845, 846, 10001, 20107)', () => {
    for (const code of [845, 846, 10001, 20107]) expect(classifyPunchRole(code)).toBe('dm_am');
  });
  it('classifies anything else (crew) as other', () => {
    expect(classifyPunchRole(650)).toBe('other'); // Crew Person, per the night-shift analysis earlier today
    expect(classifyPunchRole(671)).toBe('other');
  });
  it('handles a missing/malformed code without throwing', () => {
    expect(classifyPunchRole(null)).toBe('other');
    expect(classifyPunchRole(undefined)).toBe('other');
    expect(classifyPunchRole('not-a-number')).toBe('other');
  });
});

describe('staffing-presence -- aggregateStaffingPresence', () => {
  const storeNames = { '3708': 'Ardmore-Broadway' };

  it('aggregates shifts/hours/distinct-people per role per store, with no time filter', () => {
    const rows = [
      // GM, 8-hour shift, store 3708 (padded)
      { loc: '0003708', start_date_time: '2026-05-27T16:00:00+00:00', end_date_time: '2026-05-28T00:00:00+00:00', job_title_code: 45, geid: 'A' },
      // Shift Manager, 6-hour shift, same store, different person
      { loc: '0003708', start_date_time: '2026-05-27T17:00:00+00:00', end_date_time: '2026-05-27T23:00:00+00:00', job_title_code: 647, geid: 'B' },
      // Another GM shift, same GM as above (same geid) -- distinct count should stay 1
      { loc: '0003708', start_date_time: '2026-05-28T16:00:00+00:00', end_date_time: '2026-05-29T00:00:00+00:00', job_title_code: 45, geid: 'A' },
    ];
    const result = aggregateStaffingPresence(rows, storeNames, null);
    expect(result).toHaveLength(1);
    const store = result[0];
    expect(store.loc).toBe('3708'); // unpadded
    expect(store.name).toBe('Ardmore-Broadway');
    expect(store.gm_shifts).toBe(2);
    expect(store.gm_hours).toBeCloseTo(16, 1);
    expect(store.gm_distinct_people).toBe(1); // same geid both times
    expect(store.sm_shifts).toBe(1);
    expect(store.sm_hours).toBeCloseTo(6, 1);
    expect(store.sm_distinct_people).toBe(1);
  });

  it('a shift counting only if it STARTED at or after after_local_hour -- hours are the FULL shift, not clipped', () => {
    const rows = [
      // Starts 11:04 local (per the localHour test above) -- should be excluded by after_local_hour=16
      { loc: '0003708', start_date_time: '2026-05-27T16:04:00+00:00', end_date_time: '2026-05-27T21:04:00+00:00', job_title_code: 647, geid: 'C' },
      // Starts 19:00 local -- should be included, full 5h duration reported even though the
      // window only asked for "after 16:00"
      { loc: '0003708', start_date_time: '2026-05-27T23:30:00+00:00', end_date_time: '2026-05-28T04:30:00+00:00', job_title_code: 647, geid: 'D' },
    ];
    const result = aggregateStaffingPresence(rows, storeNames, 16);
    expect(result).toHaveLength(1);
    expect(result[0].sm_shifts).toBe(1); // only the second row
    expect(result[0].sm_hours).toBeCloseTo(5, 1); // full shift duration, not clipped
  });

  it('never exposes geid or employee_name in its output -- only counts', () => {
    const rows = [
      { loc: '0003708', start_date_time: '2026-05-27T16:00:00+00:00', end_date_time: '2026-05-27T20:00:00+00:00', job_title_code: 45, geid: 'super-secret-geid', employee_name: 'Should Never Appear' },
    ];
    const result = aggregateStaffingPresence(rows, storeNames, null);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('super-secret-geid');
    expect(serialized).not.toContain('Should Never Appear');
    expect(serialized).not.toMatch(/geid/i); // the key itself never appears, only *_distinct_people counts
  });

  it('a store with no qualifying rows after filtering is simply absent, not a zero-filled row', () => {
    const rows = [
      { loc: '0003708', start_date_time: '2026-05-27T11:00:00+00:00', end_date_time: '2026-05-27T15:00:00+00:00', job_title_code: 647, geid: 'E' },
    ];
    const result = aggregateStaffingPresence(rows, storeNames, 16); // starts before 16:00 local, excluded
    expect(result).toEqual([]);
  });
});

describe('staffing-presence -- STAFFING_PRESENCE_NOTE', () => {
  it('states the salaried-exempt caveat plainly, so SAGE never overclaims absence from zero punches', () => {
    expect(STAFFING_PRESENCE_NOTE).toMatch(/salaried-exempt/i);
    expect(STAFFING_PRESENCE_NOTE).toMatch(/does NOT mean no GM\/DM was present/i);
  });
  it('states the never-name-individuals rule plainly', () => {
    expect(STAFFING_PRESENCE_NOTE).toMatch(/never state or imply a named individual/i);
  });
});
