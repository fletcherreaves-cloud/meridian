// @ts-nocheck
// Owner request, 2026-11-18: first ask ("create a report for OEPE w/o parked for nights
// (4pm-close)... do it for the entire night period but also for 5p-7p and 7p-cl... MTD, Last
// month, last 30 days, last 45 days, last 90 days and YTD") shipped as a night-only report;
// same-day follow-up ("as prescribed is good, but adding multiple dayparts would be helpful.
// Even a start time and end time selector would be useful") generalized it. This file tests the
// 5 named presets' hour_slot boundaries (the original 3 night segments unchanged, now joined by
// Breakfast/Lunch), the custom range builder, and the real Σnum/Σden rollup (never a mean of
// daily/hourly OEPE).
import { describe, it, expect } from 'vitest';
import { computeDaypartOepeReport, DAYPART_PRESETS, ALL_HOUR_SLOTS, customDaypartSegment } from '../engine/daypart-oepe-report.js';
import { DT_OEPE_WINDOW_COLS } from '../engine/dt-oepe-report.js';

const asOf = new Date(2026, 10, 17); // Nov 17, 2026

// seconds-per-car -> dt_untilserve (ms total) for a given car count. dt_untilstore carries a
// negligible non-zero constant (oepeSeconds' own guard requires dt_untilstore > 0 to resolve at
// all, per src/utils/oepe.js -- a real "store" leg is always present in live QSRSoft data) small
// enough to leave the seconds-per-car math below unaffected. dt_heldtime=0 (no held/parked time).
const _row = (loc, dt, hourSlot, sec, cars) => ({
  loc, dt, hour_slot: hourSlot,
  dt_untilserve: sec * 1000 * cars, dt_untilstore: 1e-6, dt_heldtime: 0, dt_trans_cnt: cars,
});

describe('DAYPART_PRESETS hour_slot boundaries', () => {
  it('breakfast is the 7-9am pair (08:00, 09:00), matching daypart-peaks\' breakfast slots', () => {
    const seg = DAYPART_PRESETS.find(s => s.key === 'breakfast');
    expect(seg.test('08:00')).toBe(true);
    expect(seg.test('09:00')).toBe(true);
    expect(seg.test('07:00')).toBe(false);
    expect(seg.test('10:00')).toBe(false);
  });

  it('lunch is the 11am-2pm trio (12:00, 13:00, 14:00), matching daypart-peaks\' lunch slots', () => {
    const seg = DAYPART_PRESETS.find(s => s.key === 'lunch');
    expect(seg.test('12:00')).toBe(true);
    expect(seg.test('13:00')).toBe(true);
    expect(seg.test('14:00')).toBe(true);
    expect(seg.test('11:00')).toBe(false);
    expect(seg.test('15:00')).toBe(false);
  });

  it('dinner is exactly the 5pm-7pm pair (18:00, 19:00) -- the original "5pm-7pm" ask', () => {
    const seg = DAYPART_PRESETS.find(s => s.key === 'dinner');
    expect(seg.test('18:00')).toBe(true);
    expect(seg.test('19:00')).toBe(true);
    expect(seg.test('17:00')).toBe(false);
    expect(seg.test('20:00')).toBe(false);
  });

  it('allNight (4pm-Close) includes 17:00 through the latest wrap slot (28:00) -- the original "entire night" ask', () => {
    const seg = DAYPART_PRESETS.find(s => s.key === 'allNight');
    expect(seg.test('17:00')).toBe(true);
    expect(seg.test('20:00')).toBe(true);
    expect(seg.test('28:00')).toBe(true);
    expect(seg.test('16:00')).toBe(false);
  });

  it('sevenPmClose starts at 20:00 through close -- the original "7p-cl" ask', () => {
    const seg = DAYPART_PRESETS.find(s => s.key === 'sevenPmClose');
    expect(seg.test('20:00')).toBe(true);
    expect(seg.test('28:00')).toBe(true);
    expect(seg.test('19:00')).toBe(false);
  });
});

describe('ALL_HOUR_SLOTS', () => {
  it('runs 05:00 through 28:00 (24 slots), the real qsr_daily_activity shape', () => {
    expect(ALL_HOUR_SLOTS).toHaveLength(24);
    expect(ALL_HOUR_SLOTS[0]).toBe('05:00');
    expect(ALL_HOUR_SLOTS[ALL_HOUR_SLOTS.length - 1]).toBe('28:00');
  });
});

describe('customDaypartSegment', () => {
  it('builds an inclusive range test from start to end', () => {
    const seg = customDaypartSegment('10:00', '13:00');
    expect(seg.test('10:00')).toBe(true);
    expect(seg.test('11:00')).toBe(true);
    expect(seg.test('13:00')).toBe(true);
    expect(seg.test('09:00')).toBe(false);
    expect(seg.test('14:00')).toBe(false);
  });

  it('tolerates start/end given in reverse order', () => {
    const seg = customDaypartSegment('13:00', '10:00');
    expect(seg.test('10:00')).toBe(true);
    expect(seg.test('13:00')).toBe(true);
    expect(seg.test('09:00')).toBe(false);
  });

  it('returns null when either bound is missing', () => {
    expect(customDaypartSegment('', '13:00')).toBeNull();
    expect(customDaypartSegment('10:00', '')).toBeNull();
    expect(customDaypartSegment(null, null)).toBeNull();
  });
});

describe('computeDaypartOepeReport', () => {
  it('computes a true Σnum/Σden OEPE per segment+period, not a mean of hourly rates', () => {
    const rows = [
      // 5pm-6pm slot, low volume, high per-car time (200s/car).
      _row('1', new Date(2026, 10, 1), '18:00', 200, 10),
      // 6pm-7pm slot, high volume, low per-car time (50s/car).
      _row('1', new Date(2026, 10, 1), '19:00', 50, 1000),
    ];
    const result = computeDaypartOepeReport(rows, ['1'], asOf);
    const seg = result[0].segments.dinner;
    // (200*10 + 50*1000) / (10+1000) = 51.485...s, rounded to the nearest second by oepeSeconds.
    const meanOfHourly = (200 + 50) / 2; // 125s -- would be wrong, volume-blind
    expect(seg.mtd).toBe(51);
    expect(seg.mtd).not.toBeCloseTo(meanOfHourly, 0);
  });

  it('a 4pm-5pm row counts toward allNight but not breakfast/lunch/dinner/sevenPmClose', () => {
    const rows = [_row('1', new Date(2026, 10, 5), '17:00', 90, 20)];
    const result = computeDaypartOepeReport(rows, ['1'], asOf);
    expect(result[0].segments.allNight.mtd).toBe(90);
    expect(result[0].segments.breakfast.mtd).toBeNull();
    expect(result[0].segments.lunch.mtd).toBeNull();
    expect(result[0].segments.dinner.mtd).toBeNull();
    expect(result[0].segments.sevenPmClose.mtd).toBeNull();
  });

  it('a custom segment resolves alongside the named presets', () => {
    const rows = [_row('1', new Date(2026, 10, 5), '09:00', 60, 5)];
    const custom = customDaypartSegment('08:00', '10:00');
    const result = computeDaypartOepeReport(rows, ['1'], asOf, [...DAYPART_PRESETS, custom]);
    expect(result[0].segments.custom.mtd).toBe(60);
    expect(result[0].segments.breakfast.mtd).toBe(60); // 09:00 is also in the breakfast preset
  });

  it('computing only one segment (the view\'s normal usage) skips the rest entirely', () => {
    const rows = [_row('1', new Date(2026, 10, 5), '12:00', 45, 3)];
    const lunchOnly = DAYPART_PRESETS.find(s => s.key === 'lunch');
    const result = computeDaypartOepeReport(rows, ['1'], asOf, [lunchOnly]);
    expect(Object.keys(result[0].segments)).toEqual(['lunch']);
    expect(result[0].segments.lunch.mtd).toBe(45);
  });

  it('a store with no matching rows in a window returns null, not zero', () => {
    const result = computeDaypartOepeReport([], ['9'], asOf);
    expect(result[0].loc).toBe('9');
    for (const seg of DAYPART_PRESETS) {
      for (const col of DT_OEPE_WINDOW_COLS) expect(result[0].segments[seg.key][col.key]).toBeNull();
    }
  });

  it('a row outside every window (two years prior) never leaks into YTD', () => {
    const rows = [_row('1', new Date(2024, 5, 1), '18:00', 999, 1)];
    const result = computeDaypartOepeReport(rows, ['1'], asOf);
    expect(result[0].segments.dinner.ytd).toBeNull();
  });

  it('returns one row per requested loc, in the order given, each with all 5 default presets', () => {
    const result = computeDaypartOepeReport([], ['3708', '5183'], asOf);
    expect(result.map(r => r.loc)).toEqual(['3708', '5183']);
    for (const r of result) expect(Object.keys(r.segments).sort()).toEqual(DAYPART_PRESETS.map(s => s.key).sort());
  });

  // Live production bug (dispatch 2026-11-18, "still blank" after the page-load fix merged):
  // qsr_daily_activity rows carry loc zero-padded to 7 chars ('0003708'), but the view's caller
  // (STORE_NAMES / LocationSelector) supplies the short, un-padded form ('3708'). Before this
  // fix, rows were bucketed under the padded key and looked up under the short key -- acc.get()
  // missed on every store, rendering every cell null with no error. Real rows, caller's real loc
  // format: this is the exact mismatch, not a contrived one.
  it('matches a zero-padded row loc (real qsr_daily_activity shape) against a short caller loc', () => {
    const rows = [_row('0003708', new Date(2026, 10, 1), '18:00', 200, 10)];
    const result = computeDaypartOepeReport(rows, ['3708'], asOf);
    expect(result[0].segments.dinner.mtd).toBe(200);
  });

  it('also matches when the caller loc itself is zero-padded', () => {
    const rows = [_row('3708', new Date(2026, 10, 1), '18:00', 200, 10)];
    const result = computeDaypartOepeReport(rows, ['0003708'], asOf);
    expect(result[0].loc).toBe('3708');
    expect(result[0].segments.dinner.mtd).toBe(200);
  });
});
