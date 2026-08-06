import { describe, it, expect } from 'vitest';
import {
  expandRetailEvents, shoppingAnchor, thanksgiving, measureEventLift, shrinkLifts,
  RETAIL_EVENT_RULES, RETAIL_EVENT_TYPES, ANCHOR_MAX_DAYS, defaultRetailYears,
} from '../engine/retail-events.js';
import { impactWeight } from '../engine/events-import.js';

const STORES = [
  { loc: '20475', state: 'OK' },
  { loc: '43380', state: 'OK' },
  { loc: '38609', state: 'FL' },
];
const ruleOf = key => RETAIL_EVENT_RULES.find(r => r.key === key);
const inst = (key, year) => ruleOf(key).instances(year);
const evs = (year, type, loc) => expandRetailEvents(STORES, { years: [year] })
  .filter(e => e.type === type && (!loc || e.loc === loc));

describe('Oklahoma tax-free weekend (rule-derived)', () => {
  it('is the first Friday–Sunday of August', () => {
    expect(inst('ok_tax_free', 2024)[0]).toMatchObject({ start: '2024-08-02', end: '2024-08-04' });
    expect(inst('ok_tax_free', 2025)[0]).toMatchObject({ start: '2025-08-01', end: '2025-08-03' });
    expect(inst('ok_tax_free', 2026)[0]).toMatchObject({ start: '2026-08-07', end: '2026-08-09' });
  });
  it('is 3 days and always Confirmed', () => {
    for (const y of [2022, 2023, 2024, 2025, 2026, 2027]) {
      const i = inst('ok_tax_free', y)[0];
      expect(i.verification).toBe('Confirmed');
      expect(new Date(i.start).getUTCDay()).toBe(5);           // Friday
      expect((new Date(i.end) - new Date(i.start)) / 86400000).toBe(2);
    }
  });
  it('only applies to OK stores', () => {
    const got = evs(2026, 'tax_free');
    expect(got.filter(e => e.ruleKey === 'ok_tax_free').map(e => e.loc).sort()).toEqual(['20475', '43380']);
  });
});

describe('Thanksgiving-weekend shopping events (rule-derived)', () => {
  it('anchors on the 4th Thursday of November', () => {
    expect(thanksgiving(2025).getDate()).toBe(27);
    expect(thanksgiving(2026).getDate()).toBe(26);
  });
  it('Black Friday / Small Business Saturday / Cyber Monday sit +1/+2/+4 days', () => {
    expect(inst('black_friday', 2025)[0].start).toBe('2025-11-28');
    expect(inst('small_biz_sat', 2025)[0].start).toBe('2025-11-29');
    expect(inst('cyber_monday', 2025)[0].start).toBe('2025-12-01');
    expect(inst('black_friday', 2026)[0].start).toBe('2026-11-27');
    expect(inst('small_biz_sat', 2026)[0].start).toBe('2026-11-28');
    expect(inst('cyber_monday', 2026)[0].start).toBe('2026-11-30');
  });
  it('are single-day and apply to both states', () => {
    for (const t of ['black_friday', 'small_biz_sat', 'cyber_monday']) {
      const got = evs(2026, t);
      expect(got.length).toBe(STORES.length);
      expect(got.every(e => e.dateStart === e.dateEnd && !e.span)).toBe(true);
    }
  });
  it('predate their real start years being emitted', () => {
    expect(inst('small_biz_sat', 2009)).toEqual([]);
    expect(inst('cyber_monday', 2004)).toEqual([]);
  });
});

describe('Florida back-to-school (hard-dated, not a recurrence rule)', () => {
  it('uses the published DOR windows verbatim', () => {
    expect(inst('fl_back_to_school', 2023)[0]).toMatchObject({ start: '2023-07-24', end: '2023-08-06', verification: 'Confirmed' });
    expect(inst('fl_back_to_school', 2024).map(i => i.start)).toEqual(['2024-01-01', '2024-07-29']);
    expect(inst('fl_back_to_school', 2025)[0]).toMatchObject({ start: '2025-08-01', end: '2025-08-31' });
    expect(inst('fl_back_to_school', 2026)[0]).toMatchObject({ start: '2026-07-20', end: '2026-08-20' });
  });
  it('omits years with no verified window rather than guessing', () => {
    expect(inst('fl_back_to_school', 2022)).toEqual([]);
    expect(inst('fl_back_to_school', 2020)).toEqual([]);
  });
  it('marks forward-projected years Estimated', () => {
    const i = inst('fl_back_to_school', 2028)[0];
    expect(i).toMatchObject({ start: '2028-07-20', end: '2028-08-20', verification: 'Estimated' });
  });
  it('collapses a month-long window to its opening Fri–Sun and keeps the full window in the note', () => {
    const [e] = evs(2025, 'tax_free', '38609');
    expect(e.dateStart).toBe('2025-08-01');
    expect(e.dateEnd).toBe('2025-08-03');
    expect(e.label).toMatch(/Opening Weekend/);
    expect(e.note).toContain('2025-08-01 → 2025-08-31');
    expect(e.fullWindow).toEqual({ start: '2025-08-01', end: '2025-08-31' });
  });
  it('only applies to FL stores', () => {
    expect(evs(2026, 'tax_free').filter(e => e.ruleKey === 'fl_back_to_school').map(e => e.loc)).toEqual(['38609']);
  });
});

describe('shoppingAnchor', () => {
  it('passes short windows through untouched', () => {
    expect(shoppingAnchor('2026-08-07', '2026-08-09')).toEqual({ start: '2026-08-07', end: '2026-08-09', anchored: false });
  });
  it('picks the first full Fri–Sun inside a long window', () => {
    expect(shoppingAnchor('2026-07-20', '2026-08-20')).toEqual({ start: '2026-07-24', end: '2026-07-26', anchored: true });
    expect(shoppingAnchor('2024-07-29', '2024-08-11')).toEqual({ start: '2024-08-02', end: '2024-08-04', anchored: true });
  });
  it('clamps the anchor to the end of the window', () => {
    const a = shoppingAnchor('2025-08-01', '2025-08-02');   // 2 days ≤ ANCHOR_MAX_DAYS
    expect(a.anchored).toBe(false);
    expect(ANCHOR_MAX_DAYS).toBeGreaterThanOrEqual(3);
  });
});

describe('event records are shaped like the staffing-workbook parser output', () => {
  const all = expandRetailEvents(STORES, { years: [2026] });
  it('carries every field saveOrgEvents() maps', () => {
    for (const e of all) {
      expect(typeof e.loc).toBe('string');
      expect(RETAIL_EVENT_TYPES).toContain(e.type);
      expect(e.dateStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.dateEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.category).toBe('Retail / Shopping');
      expect(e.impact).toMatchObject({ gameDay: false });
      expect(e.note).toBeTruthy();
      expect(['Confirmed', 'Estimated']).toContain(e.verification);
    }
  });
  it('moves NO forecast until measured — every default impact weight is zero', () => {
    for (const e of all) expect(impactWeight(e.impact)).toBe(0);
  });
  it('never emits two events for the same store on the same start date', () => {
    const keys = all.map(e => e.loc + '|' + e.dateStart + '|' + e.label);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('is sorted by date', () => {
    const d = all.map(e => e.dateStart);
    expect([...d].sort()).toEqual(d);
  });
  it('defaultRetailYears spans measurable history plus next year', () => {
    const y = defaultRetailYears(new Date('2026-08-06T12:00:00'));
    expect(y[0]).toBe(2022);
    expect(y[y.length - 1]).toBe(2027);
  });
});

describe('measureEventLift / shrinkLifts', () => {
  // 20 Fridays of $1000, with one event Friday at $1200 → +20% lift vs the median baseline.
  const rows = [];
  for (let i = 0; i < 20; i++) {
    const d = new Date(Date.UTC(2025, 0, 3 + i * 7));        // consecutive Fridays
    rows.push({ loc: '1', date: d.toISOString().slice(0, 10), sales: 1000 });
  }
  const eventDay = rows[10].date;
  rows[10] = { ...rows[10], sales: 1200 };

  it('grades an event day against its own same-DOW median baseline', () => {
    const out = measureEventLift(rows, { 1: [eventDay] });
    expect(out['1'].n).toBe(1);
    expect(out['1'].measured).toBeCloseTo(0.2, 6);
  });
  it('skips days with too thin a baseline', () => {
    const thin = [{ loc: '1', date: '2025-03-07', sales: 1200 }];
    expect(measureEventLift(thin, { 1: ['2025-03-07'] })).toEqual({});
  });
  it('excludes other days of the same event and any excluded dates from the baseline', () => {
    const both = measureEventLift(rows, { 1: [eventDay, rows[11].date] });
    expect(both['1'].n).toBe(2);
    const withExcl = measureEventLift(rows, { 1: [eventDay] }, { excludeDates: new Set([rows[9].date, rows[11].date]) });
    expect(withExcl['1'].measured).toBeCloseTo(0.2, 6);       // median of identical $1000 days is unchanged
  });
  it('strips a zero-padded loc so registry keys match the forecast lookup', () => {
    const padded = rows.map(r => ({ ...r, loc: '0000001' }));
    expect(Object.keys(measureEventLift(padded, { '0000001': [eventDay] }))).toEqual(['1']);
  });
  it('shrinks a low-n store toward the district mean (K=10)', () => {
    const { district, byLoc } = shrinkLifts({ a: { measured: 0.30, n: 2 }, b: { measured: 0.05, n: 20 } });
    expect(district).toBeCloseTo((0.30 * 2 + 0.05 * 20) / 22, 6);
    expect(byLoc.a.shrunk).toBeCloseTo(district + (0.30 - district) * (2 / 12), 6);
    expect(Math.abs(byLoc.a.shrunk - district)).toBeLessThan(Math.abs(0.30 - district)); // pulled in
    expect(byLoc.b.shrunk).toBeGreaterThan(district - 0.05);
  });
  it('returns nothing for an empty registry rather than NaN', () => {
    expect(shrinkLifts({})).toEqual({ district: null, byLoc: {} });
  });
});
