import { describe, it, expect } from 'vitest';
import { parseImpact, impactWeight, parseConfirmation, parseDates, eventTypeFor, parseStaffingEvents, orgEventsToDayMap, diffUserEventsForCloudSync, IMPACT_WEIGHTS, GAMEDAY_WEIGHT } from '../engine/events-import.js';

describe('parseImpact', () => {
  it('decomposes magnitude × daypart', () => {
    expect(parseImpact('High - Morning / Breakfast')).toMatchObject({ magnitude: 'High', daypart: 'breakfast', gameDay: false });
    expect(parseImpact('High - Dinner/Late Night')).toMatchObject({ magnitude: 'High', daypart: 'dinner' });
    expect(parseImpact('High - Afternoon Rush')).toMatchObject({ magnitude: 'High', daypart: 'afternoon' });
    expect(parseImpact('High - Day Shift')).toMatchObject({ magnitude: 'High', daypart: 'day' });
    expect(parseImpact('High - All Shifts')).toMatchObject({ magnitude: 'High', daypart: 'all' });
    expect(parseImpact('Medium')).toMatchObject({ magnitude: 'Medium', daypart: 'all' });
    expect(parseImpact('Low')).toMatchObject({ magnitude: 'Low', daypart: 'all' });
  });
  it('recognizes Game Day traffic as its own preset', () => {
    expect(parseImpact('Game Day Traffic')).toMatchObject({ magnitude: 'High', daypart: 'gameday', gameDay: true });
  });
  it('flags unparseable free text (defaults, parsed:false)', () => {
    expect(parseImpact('something weird')).toMatchObject({ parsed: false, magnitude: 'Medium', daypart: 'all' });
  });
});

describe('impactWeight', () => {
  it('maps magnitude → conservative default weight; gameday is its own', () => {
    expect(impactWeight(parseImpact('High - Breakfast'))).toBe(IMPACT_WEIGHTS.High);
    expect(impactWeight(parseImpact('Low'))).toBe(0);
    expect(impactWeight(parseImpact('Game Day Traffic'))).toBe(GAMEDAY_WEIGHT);
  });
});

describe('parseConfirmation', () => {
  it('reads Confirmed/Est from the date OR the name', () => {
    expect(parseConfirmation('2026-08-13 (Confirmed)', 'First Day')).toBe('Confirmed');
    expect(parseConfirmation('2026-09-08 to 2026-09-13', 'Carter County Free Fair (Confirmed)')).toBe('Confirmed');
    expect(parseConfirmation('2027-03-28', 'A2A Marathon (Est)')).toBe('Estimated');
    expect(parseConfirmation('2026-10-01', 'Rodeo')).toBe('Unknown');
  });
});

describe('parseDates', () => {
  it('parses a single date', () => {
    expect(parseDates('2026-08-13 (Confirmed)')).toEqual({ start: '2026-08-13', end: '2026-08-13', span: false });
  });
  it('parses a range as a span', () => {
    expect(parseDates('2026-08-06 to 2026-08-11 (Confirmed)')).toEqual({ start: '2026-08-06', end: '2026-08-11', span: true });
  });
});

describe('eventTypeFor', () => {
  it('maps category + school name → EVENT_TYPES key', () => {
    expect(eventTypeFor('Sports - College Football', 'OU vs UTEP')).toBe('sports');
    expect(eventTypeFor('Festival / Fair', 'Carter County Free Fair')).toBe('event');
    expect(eventTypeFor('School Calendar', 'First Day of School (Ardmore)')).toBe('school_start');
    expect(eventTypeFor('School Calendar', 'Last Day of School')).toBe('school_end');
    expect(eventTypeFor('School Calendar', 'Certified Professional Days - In-Service')).toBe('school_no_school');
    expect(eventTypeFor('School Calendar', 'Early Release Day')).toBe('school_early_release');
  });
});

describe('parseStaffingEvents', () => {
  const header = ['Store #', 'City', 'State', 'Category', 'Event Name', 'Date(s)', 'Expected Impact', 'Verification URL'];
  const rows = [
    header,
    [3708, 'Ardmore', 'OK', 'School Calendar', 'First Day of School (Ardmore City Schools)', '2026-08-13 (Confirmed)', 'High - Morning / Breakfast', 'Verify Source'],
    [3708, 'Ardmore', 'OK', 'Sports - College Football', 'OU vs UTEP (Home)', '2026-09-04 (Confirmed)', 'Game Day Traffic', 'Verify Source'],
    [3708, 'Ardmore', 'OK', 'Festival / Fair', 'Carter County Free Fair (Confirmed)', '2026-09-08 to 2026-09-13', 'High - All Shifts', 'Verify Source'],
    [3708, 'Ardmore', 'OK', 'Festival / Fair', 'A2A Marathon (Est)', '2027-03-28', 'High - All Shifts', 'Verify Source'],   // Estimated → skipped
    ['', '', '', '', '', '', '', ''],   // blank → ignored
  ];
  it('imports Confirmed only, spans ranges, maps types + impact, attaches URLs', () => {
    const urls = { 0: 'https://ardmoreschools.org/', 1: 'https://maxpreps.com/ou', 2: 'https://cartercountyfair.org/' };
    const { events, estimated, skipped } = parseStaffingEvents(rows, urls);
    expect(events).toHaveLength(3);            // the Est festival is excluded
    expect(estimated).toBe(1);
    const school = events[0];
    expect(school.loc).toBe('3708');
    expect(school.type).toBe('school_start');
    expect(school.dateStart).toBe('2026-08-13');
    expect(school.span).toBe(false);
    expect(school.impact.magnitude).toBe('High');
    expect(school.impact.daypart).toBe('breakfast');
    expect(school.url).toBe('https://ardmoreschools.org/');
    expect(school.verification).toBe('Confirmed');
    expect(events[1].impact.gameDay).toBe(true);         // OU game
    expect(events[2].span).toBe(true);                   // fair range
    expect(events[2].dateStart).toBe('2026-09-08');
    expect(events[2].dateEnd).toBe('2026-09-13');
    expect(events[2].label).toBe('Carter County Free Fair');   // "(Confirmed)" stripped
  });
});

describe('orgEventsToDayMap', () => {
  it('down-projects a single-day event into the per-day map', () => {
    const map = orgEventsToDayMap([{ id: 1, loc: '3708', dateStart: '2026-08-13', dateEnd: '2026-08-13', type: 'school_start', label: 'First Day', url: 'https://x', method: 'bulk upload' }], () => '🎒');
    expect(Object.keys(map['3708'])).toEqual(['2026-08-13']);
    const e = map['3708']['2026-08-13'];
    expect(e).toMatchObject({ type: 'school_start', label: 'First Day', icon: '🎒', orgSourced: true, orgEventId: 1, url: 'https://x', source: 'Bulk Import' });
    expect(e.rangeId).toBeUndefined();
  });
  it('expands a span into one entry per day sharing a rangeId', () => {
    const map = orgEventsToDayMap([{ id: 9, loc: '3708', dateStart: '2026-09-08', dateEnd: '2026-09-10', type: 'event', label: 'Fair' }]);
    const days = Object.keys(map['3708']);
    expect(days).toEqual(['2026-09-08', '2026-09-09', '2026-09-10']);
    expect(map['3708']['2026-09-08'].label).toBe('Fair (Day 1 of 3)');
    expect(map['3708']['2026-09-10'].rangeDayNum).toBe(3);
    const rid = map['3708']['2026-09-08'].rangeId;
    expect(days.every(d => map['3708'][d].rangeId === rid)).toBe(true);
  });

  it('issue #142: two org events on the same (loc,date) COMBINE instead of the second silently ' +
     'dropping the first — measured 261 real same-day pairs across all 27 stores (school ' +
     'closures + sports games sharing a date)', () => {
    const map = orgEventsToDayMap([
      { id: 1, loc: '3708', dateStart: '2026-10-15', dateEnd: '2026-10-15', type: 'school_no_school', label: 'Fall Break - Closed - Fall Break' },
      { id: 2, loc: '3708', dateStart: '2026-10-15', dateEnd: '2026-10-15', type: 'sports', label: 'Ardmore High School Football (Away)' },
    ]);
    const e = map['3708']['2026-10-15'];
    expect(e.label).toBe('Fall Break - Closed - Fall Break + Ardmore High School Football (Away)');
    expect(e.orgSourced).toBe(true);
    expect(e.orgEventId).toBe(1);          // first event stays the edit-UI target
    expect(e.tags.map(t => t.type)).toEqual(['school_no_school', 'sports']);   // forecast averages both
    expect(e.combinedEvents).toHaveLength(2);
    expect(e.combinedEvents[1].label).toBe('Ardmore High School Football (Away)');
  });

  it('issue #142: a THIRD same-day event keeps combining, not just pairwise', () => {
    const map = orgEventsToDayMap([
      { id: 1, loc: '3708', dateStart: '2026-09-07', dateEnd: '2026-09-07', type: 'holiday', label: 'Labor Day' },
      { id: 2, loc: '3708', dateStart: '2026-09-07', dateEnd: '2026-09-07', type: 'sports', label: 'FSU vs SMU' },
      { id: 3, loc: '3708', dateStart: '2026-09-07', dateEnd: '2026-09-07', type: 'event', label: 'Street Fair' },
    ]);
    const e = map['3708']['2026-09-07'];
    expect(e.combinedEvents).toHaveLength(3);
    expect(e.label).toBe('Labor Day + FSU vs SMU + Street Fair');
  });
});

// v4.923 built the org_events UPLOAD path (localStorage mf_events → cloud); v4.927 found and
// fixed a bug in it. These verify the round-trip's write-side diff logic without needing a live
// authenticated Supabase session (this environment only has an anon key, which RLS blocks).
describe('diffUserEventsForCloudSync', () => {
  it('a brand-new hand-entered day produces one upsert and no deletes', () => {
    const prev = {};
    const next = { '3708': { '2026-11-27': { type: 'holiday', label: 'Thanksgiving', note: 'closed' } } };
    const { upserts, deleteKeys, staleKeys } = diffUserEventsForCloudSync(prev, next);
    expect(upserts).toEqual([{ loc: '3708', dateStart: '2026-11-27', dateEnd: '2026-11-27', span: false,
      type: 'holiday', label: 'Thanksgiving', note: 'closed', method: 'manual' }]);
    expect(deleteKeys).toEqual([]);
    expect(staleKeys).toEqual([]);
  });

  it('editing a day\'s label upserts the new label and clears the OLD label, not the whole date', () => {
    const prev = { '3708': { '2026-11-27': { type: 'holiday', label: 'Thanksgiving' } } };
    const next = { '3708': { '2026-11-27': { type: 'holiday', label: 'Thanksgiving Day' } } };
    const { upserts, staleKeys, deleteKeys } = diffUserEventsForCloudSync(prev, next);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].label).toBe('Thanksgiving Day');
    expect(staleKeys).toEqual([{ loc: '3708', dk: '2026-11-27', label: 'Thanksgiving' }]);
    expect(deleteKeys).toEqual([]);
  });

  it('deleting a day removes only that entry\'s own label, not every row for the date', () => {
    const prev = { '3708': { '2026-11-27': { type: 'holiday', label: 'Thanksgiving' } } };
    const next = { '3708': {} };
    const { deleteKeys, upserts, staleKeys } = diffUserEventsForCloudSync(prev, next);
    expect(deleteKeys).toEqual([{ loc: '3708', dk: '2026-11-27', label: 'Thanksgiving' }]);
    expect(upserts).toEqual([]);
    expect(staleKeys).toEqual([]);
  });

  it('an unchanged orgSourced entry is never re-uploaded', () => {
    const orgDay = { type: 'sports', label: 'Homecoming Game', orgSourced: true, orgEventId: 42 };
    const prev = { '3708': { '2026-10-10': orgDay } };
    const next = { '3708': { '2026-10-10': orgDay } };
    const { upserts, deleteKeys, staleKeys } = diffUserEventsForCloudSync(prev, next);
    expect(upserts).toEqual([]); expect(deleteKeys).toEqual([]); expect(staleKeys).toEqual([]);
  });

  it('overriding an org-sourced day with a hand tag deletes ONLY the org event\'s own label — ' +
     'a same-day sibling event under a different label must survive (the v4.927 bug)', () => {
    // Two cloud events already share this date (org_events allows >1/day); the local per-day
    // registry can only ever surface one, here the sports game — the school closure exists in
    // the cloud but is invisible locally. The scanner overwrites the visible slot with a new
    // hand-typed tag; the fix must scope the cleanup delete to the sports game's own label so
    // the school closure (a different label, same date) is never touched.
    const prev = { '3708': { '2026-10-10': { type: 'sports', label: 'Homecoming Game', orgSourced: true, orgEventId: 42 } } };
    const next = { '3708': { '2026-10-10': { type: 'other', label: 'Field trip conflict', note: 'staffing note' } } };
    const { upserts, staleKeys, deleteKeys } = diffUserEventsForCloudSync(prev, next);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].label).toBe('Field trip conflict');
    expect(staleKeys).toEqual([{ loc: '3708', dk: '2026-10-10', label: 'Homecoming Game' }]);
    expect(deleteKeys).toEqual([]);
  });

  it('identical prev/next produces no writes at all', () => {
    const day = { type: 'holiday', label: 'Christmas', note: 'closed' };
    const prev = { '3708': { '2026-12-25': day } };
    const next = { '3708': { '2026-12-25': { ...day } } };
    const { upserts, deleteKeys, staleKeys } = diffUserEventsForCloudSync(prev, next);
    expect(upserts).toEqual([]); expect(deleteKeys).toEqual([]); expect(staleKeys).toEqual([]);
  });

  it('falls back to typeLabelFor when a hand-tagged entry has no explicit label', () => {
    const prev = {};
    const next = { '3708': { '2026-07-04': { type: 'holiday' } } };
    const { upserts } = diffUserEventsForCloudSync(prev, next, t => (t === 'holiday' ? 'Holiday' : null));
    expect(upserts[0].label).toBe('Holiday');
  });

  it('diffs each store independently', () => {
    const prev = { '3708': { '2026-11-27': { type: 'holiday', label: 'Thanksgiving' } } };
    const next = {
      '3708': { '2026-11-27': { type: 'holiday', label: 'Thanksgiving' } },
      '4004': { '2026-11-27': { type: 'holiday', label: 'Thanksgiving' } },
    };
    const { upserts } = diffUserEventsForCloudSync(prev, next);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].loc).toBe('4004');
  });
});
