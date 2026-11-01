// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { dailyScheduleVariance, storeScheduleDisciplineSummary, editorBreakdown } from '../engine/schedule-discipline.js';

const ROWS = [
  { loc: '0003708', editedBy: 'Pat Rivera', occurredAt: '2026-10-24 19:12:00', hoursVariance: 1.0, costVariance: 8.5 },
  { loc: '0003708', editedBy: 'Pat Rivera', occurredAt: '2026-10-24 20:05:00', hoursVariance: -0.5, costVariance: -4.25 },
  { loc: '0003708', editedBy: 'Taylor Ford', occurredAt: '2026-10-25 11:03:00', hoursVariance: 0, costVariance: 0 },
  { loc: '0005183', editedBy: 'Taylor Ford', occurredAt: '2026-10-25 09:00:00', hoursVariance: 3.0, costVariance: 30.0 },
];

describe('dailyScheduleVariance', () => {
  it('aggregates by (loc, date), summing edits/hours/cost within the same day', () => {
    const daily = dailyScheduleVariance(ROWS);
    const d1 = daily.find(d => d.loc === '0003708' && d.date === '2026-10-24');
    expect(d1.editCount).toBe(2);
    expect(d1.hoursVarianceSum).toBeCloseTo(0.5);
    expect(d1.costVarianceSum).toBeCloseTo(4.25);
  });

  it('keeps different dates for the same store as separate buckets', () => {
    const daily = dailyScheduleVariance(ROWS);
    const keys = daily.filter(d => d.loc === '0003708').map(d => d.date).sort();
    expect(keys).toEqual(['2026-10-24', '2026-10-25']);
  });

  it('takes the date portion of occurredAt without timezone conversion', () => {
    const daily = dailyScheduleVariance([{ loc: '0003708', editedBy: 'X', occurredAt: '2026-10-24T23:59:59', hoursVariance: 1, costVariance: 1 }]);
    expect(daily[0].date).toBe('2026-10-24');
  });

  it('drops rows missing loc or occurredAt rather than crashing', () => {
    const daily = dailyScheduleVariance([{ editedBy: 'X', hoursVariance: 1 }, null, undefined]);
    expect(daily).toEqual([]);
  });

  it('treats a missing hoursVariance/costVariance as 0, not NaN', () => {
    const daily = dailyScheduleVariance([{ loc: '0003708', occurredAt: '2026-10-24', editedBy: 'X' }]);
    expect(daily[0].hoursVarianceSum).toBe(0);
    expect(daily[0].costVarianceSum).toBe(0);
    expect(Number.isNaN(daily[0].hoursVarianceSum)).toBe(false);
  });
});

describe('storeScheduleDisciplineSummary', () => {
  it('aggregates per-store across the whole rows array (caller pre-filters the window)', () => {
    const summary = storeScheduleDisciplineSummary(ROWS);
    const s3708 = summary.find(s => s.loc === '0003708');
    expect(s3708.editCount).toBe(3);
    expect(s3708.costVarianceSum).toBeCloseTo(4.25);
  });

  it('sorts by |costVarianceSum| descending, biggest cost impact first', () => {
    const summary = storeScheduleDisciplineSummary(ROWS);
    expect(summary[0].loc).toBe('0005183'); // $30 > $4.25 (3708)
  });

  it('tracks the most recent edit per store as lastEditAt', () => {
    const summary = storeScheduleDisciplineSummary(ROWS);
    const s3708 = summary.find(s => s.loc === '0003708');
    expect(s3708.lastEditAt).toBe('2026-10-25 11:03:00');
  });
});

describe('editorBreakdown', () => {
  it('aggregates per-editor across all stores they touched', () => {
    const editors = editorBreakdown(ROWS);
    const pat = editors.find(e => e.editedBy === 'Pat Rivera');
    expect(pat.editCount).toBe(2);
    expect(pat.locs).toEqual(['0003708']);
    const taylor = editors.find(e => e.editedBy === 'Taylor Ford');
    expect(taylor.editCount).toBe(2);
    expect(taylor.locs.sort()).toEqual(['0003708', '0005183']);
  });

  it('sorts by editCount descending', () => {
    const editors = editorBreakdown(ROWS);
    expect(editors[0].editCount).toBeGreaterThanOrEqual(editors[1].editCount);
  });
});
