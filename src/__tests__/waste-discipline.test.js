// @ts-nocheck
// #209 — Data-discipline score. Mirrors count-cycle.test.js's fixture style: real qsr_waste
// row shape (loc, type, dt, amount), no null-vs-zero sentinel — "missing" only means "no row
// for this date." Guards the two things the file exists to get right: expected days are
// DERIVED per-store from observed history (never a fixed calendar), and a real $0 entry is
// never conflated with a missing one.
import { describe, it, expect } from 'vitest';
import {
  LOOKBACK_DAYS, expectedDaysOfWeek, computeMissingWasteDays, estimateMissingWasteImpact,
  computeStoreDataDiscipline, disciplineSummary,
} from '../engine/waste-discipline.js';

const addDays = (dateStr, n) => { const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const dowOf = (dateStr) => new Date(dateStr + 'T12:00:00').getDay();
const datesInRange = (start, end) => { const out = []; for (let d = start; d <= end; d = addDays(d, 1)) out.push(d); return out; };
const mkRows = (loc, type, dates, amount = 25) => dates.map(dt => ({ loc, type, dt, amount }));

describe('expectedDaysOfWeek', () => {
  const asOf = '2026-08-11';
  const start = addDays(asOf, -LOOKBACK_DAYS);

  it('a store that submits every day expects every day of week', () => {
    const dateSet = new Set(datesInRange(start, asOf));
    expect(expectedDaysOfWeek(dateSet, asOf)).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
  });

  it('a weekday-only submitter does not expect weekend days', () => {
    const dateSet = new Set(datesInRange(start, asOf).filter(d => { const dow = dowOf(d); return dow !== 0 && dow !== 6; }));
    const expected = expectedDaysOfWeek(dateSet, asOf);
    expect(expected.has(0)).toBe(false);
    expect(expected.has(6)).toBe(false);
    expect(expected.has(1)).toBe(true);
  });

  it('a day-of-week hit below COVER_FRAC is not called a pattern', () => {
    const allMondays = datesInRange(start, asOf).filter(d => dowOf(d) === 1);
    const hitMondays = allMondays.filter((_, i) => i % 3 === 0); // ~37.5% hit rate, below 0.75
    const expected = expectedDaysOfWeek(new Set(hitMondays), asOf);
    expect(expected.has(1)).toBe(false);
  });
});

describe('computeMissingWasteDays', () => {
  const asOf = '2026-08-11';
  const start = addDays(asOf, -LOOKBACK_DAYS);
  const allDates = datesInRange(start, asOf);

  it("flags recent gaps against the store's OWN derived pattern, not a fixed schedule", () => {
    const submitted = allDates.filter(d => d !== asOf && d !== addDays(asOf, -1));
    const missing = computeMissingWasteDays(mkRows('10422', 'raw', submitted), { asOf });
    const m = missing['10422'].raw;
    expect(m.missingDates).toEqual(expect.arrayContaining([asOf, addDays(asOf, -1)]));
    expect(m.missingCount).toBe(2);
    expect(m.pctOnTime).toBeGreaterThan(0);
  });

  it('a type with too little history reports null pctOnTime, not a false 100%', () => {
    const rows = mkRows('99999', 'completed', [addDays(asOf, -1), addDays(asOf, -8)]);
    const missing = computeMissingWasteDays(rows, { asOf });
    expect(missing['99999'].completed.pctOnTime).toBeNull();
    expect(missing['99999'].completed.expectedCount).toBe(0);
  });

  it('excludes full-closure holidays from expected days, even on an otherwise-expected dow', () => {
    const closureAsOf = '2026-12-27'; // window covers Dec 25 (Christmas, fullClosure)
    const closureStart = addDays(closureAsOf, -LOOKBACK_DAYS);
    const submitted = datesInRange(closureStart, closureAsOf).filter(d => d !== '2026-12-25');
    const missing = computeMissingWasteDays(mkRows('10422', 'raw', submitted), { asOf: closureAsOf });
    const m = missing['10422'].raw;
    expect(m.missingDates).not.toContain('2026-12-25');
    expect(m.missingCount).toBe(0);
  });

  it('missing != zero: a real $0 entry on every day means nothing is missing', () => {
    const rowsWithZero = allDates.map(dt => ({ loc: '10422', type: 'raw', dt, amount: 0 }));
    const missing = computeMissingWasteDays(rowsWithZero, { asOf });
    expect(missing['10422'].raw.missingCount).toBe(0);
  });
});

describe('estimateMissingWasteImpact', () => {
  it("estimates a missing day's $ as the store's own average entry for that type", () => {
    const rows = [
      { loc: '10422', type: 'raw', dt: '2026-08-01', amount: 20 },
      { loc: '10422', type: 'raw', dt: '2026-08-02', amount: 30 },
    ];
    const est = estimateMissingWasteImpact(rows, { '10422': { raw: { missingCount: 2 } } });
    expect(est['10422']).toBeCloseTo(50, 2);
  });

  it('a loc/type with no observed amounts estimates 0, not NaN', () => {
    const est = estimateMissingWasteImpact([], { '55555': { raw: { missingCount: 3 } } });
    expect(est['55555']).toBe(0);
  });
});

describe('computeStoreDataDiscipline', () => {
  it('rolls up both waste types, averaging only the ones with a derivable pattern', () => {
    const asOf = '2026-08-11';
    const start = addDays(asOf, -LOOKBACK_DAYS);
    const allDates = datesInRange(start, asOf);
    const rawRows = mkRows('10422', 'raw', allDates.filter(d => d !== asOf), 25); // 1 missing raw day
    const completedRows = mkRows('10422', 'completed', [addDays(asOf, -1), addDays(asOf, -8)], 10); // no pattern yet
    const discipline = computeStoreDataDiscipline([...rawRows, ...completedRows], { asOf });
    const row = discipline.find(r => r.loc === '10422');
    expect(row.raw.pctOnTime).not.toBeNull();
    expect(row.completed.pctOnTime).toBeNull();
    expect(row.overallPct).toBe(row.raw.pctOnTime); // completed's null is excluded, not averaged in
    expect(row.totalMissing).toBe(1);
  });
});

describe('disciplineSummary', () => {
  it('rolls up counts and estimated impact across stores', () => {
    const discipline = [
      { loc: 'A', totalMissing: 2, estImpact: 40, overallPct: 90 },
      { loc: 'B', totalMissing: 0, estImpact: 0, overallPct: null },
    ];
    const s = disciplineSummary(discipline);
    expect(s.stores).toBe(2);
    expect(s.totalMissing).toBe(2);
    expect(s.totalEstImpact).toBe(40);
    expect(s.storesWithMissing).toBe(1);
    expect(s.storesWithoutPattern).toBe(1);
  });
});
