// @ts-nocheck
// Owner request, 2026-11-18: "create a report for OEPE w/o parked for nights (4pm-close) for
// each location. Add ask - do it for the entire night period but also for 5p-7p and 7p-cl ...
// MTD, Last month, last 30 days, last 45 days, last 90 days and YTD ... This is separate from
// previous work." This file tests the hour_slot segment boundaries, the real Σnum/Σden rollup
// (never a mean of daily/hourly OEPE), and the period-window reuse from dt-oepe-report.js.
import { describe, it, expect } from 'vitest';
import { computeNightOepeReport, NIGHT_SEGMENTS } from '../engine/night-oepe-report.js';
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

describe('NIGHT_SEGMENTS hour_slot boundaries', () => {
  it('allNight includes 4pm-5pm (17:00) through the latest wrap slot (28:00)', () => {
    const seg = NIGHT_SEGMENTS.find(s => s.key === 'allNight');
    expect(seg.test('17:00')).toBe(true);
    expect(seg.test('20:00')).toBe(true);
    expect(seg.test('28:00')).toBe(true);
    expect(seg.test('16:00')).toBe(false); // 3pm-4pm -- before the night window starts
  });

  it('fivePmSeven is exactly the 5pm-7pm pair (18:00, 19:00), matching daypart-peaks\' dinner slots', () => {
    const seg = NIGHT_SEGMENTS.find(s => s.key === 'fivePmSeven');
    expect(seg.test('18:00')).toBe(true);
    expect(seg.test('19:00')).toBe(true);
    expect(seg.test('17:00')).toBe(false); // 4pm-5pm is allNight-only
    expect(seg.test('20:00')).toBe(false); // 7pm-8pm belongs to sevenPmClose, not this segment
  });

  it('sevenPmClose starts at 20:00 (the 7pm-8pm block) through close', () => {
    const seg = NIGHT_SEGMENTS.find(s => s.key === 'sevenPmClose');
    expect(seg.test('20:00')).toBe(true);
    expect(seg.test('28:00')).toBe(true);
    expect(seg.test('19:00')).toBe(false);
  });
});

describe('computeNightOepeReport', () => {
  it('computes a true Σnum/Σden OEPE per segment+period, not a mean of hourly rates', () => {
    const rows = [
      // 5pm-6pm slot, low volume, high per-car time (200s/car).
      _row('1', new Date(2026, 10, 1), '18:00', 200, 10),
      // 6pm-7pm slot, high volume, low per-car time (50s/car).
      _row('1', new Date(2026, 10, 1), '19:00', 50, 1000),
    ];
    const result = computeNightOepeReport(rows, ['1'], asOf);
    const seg = result[0].segments.fivePmSeven;
    // (200*10 + 50*1000) / (10+1000) = 51.485...s, rounded to the nearest second by oepeSeconds.
    const meanOfHourly = (200 + 50) / 2; // 125s -- would be wrong, volume-blind
    expect(seg.mtd).toBe(51);
    expect(seg.mtd).not.toBeCloseTo(meanOfHourly, 0);
  });

  it('a 4pm-5pm row counts toward allNight but not the two sub-segments', () => {
    const rows = [_row('1', new Date(2026, 10, 5), '17:00', 90, 20)];
    const result = computeNightOepeReport(rows, ['1'], asOf);
    expect(result[0].segments.allNight.mtd).toBe(90);
    expect(result[0].segments.fivePmSeven.mtd).toBeNull();
    expect(result[0].segments.sevenPmClose.mtd).toBeNull();
  });

  it('a store with no matching rows in a window returns null, not zero', () => {
    const result = computeNightOepeReport([], ['9'], asOf);
    expect(result[0].loc).toBe('9');
    for (const seg of NIGHT_SEGMENTS) {
      for (const col of DT_OEPE_WINDOW_COLS) expect(result[0].segments[seg.key][col.key]).toBeNull();
    }
  });

  it('a row outside every window (two years prior) never leaks into YTD', () => {
    const rows = [_row('1', new Date(2024, 5, 1), '18:00', 999, 1)];
    const result = computeNightOepeReport(rows, ['1'], asOf);
    expect(result[0].segments.fivePmSeven.ytd).toBeNull();
  });

  it('a daytime row (hour_slot before 17:00) never leaks into any night segment', () => {
    const rows = [_row('1', new Date(2026, 10, 1), '12:00', 999, 1)];
    const result = computeNightOepeReport(rows, ['1'], asOf);
    for (const seg of NIGHT_SEGMENTS) expect(result[0].segments[seg.key].mtd).toBeNull();
  });

  it('returns one row per requested loc, in the order given, each with all 3 segments', () => {
    const result = computeNightOepeReport([], ['3708', '5183'], asOf);
    expect(result.map(r => r.loc)).toEqual(['3708', '5183']);
    for (const r of result) expect(Object.keys(r.segments).sort()).toEqual(['allNight', 'fivePmSeven', 'sevenPmClose'].sort());
  });
});
