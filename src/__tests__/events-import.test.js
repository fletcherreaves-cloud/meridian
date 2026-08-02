import { describe, it, expect } from 'vitest';
import { parseImpact, impactWeight, parseConfirmation, parseDates, eventTypeFor, parseStaffingEvents, orgEventsToDayMap, IMPACT_WEIGHTS, GAMEDAY_WEIGHT } from '../engine/events-import.js';

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
});
