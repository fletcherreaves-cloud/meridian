// @ts-nocheck
// #210 — labor gap split into planning accuracy (scheduled-needed) and execution
// (actual-scheduled). Guards: the Wed-Tue pay week (never Mon-Sun), the in-progress-day
// exclusion (signature #4), and "scheduled hours unknown" reporting null rather than a
// fabricated number when the rollup hasn't backfilled total_scheduled_hours yet.
import { describe, it, expect } from 'vitest';
import { computeLaborGapSplit, latestCompleteWeekByStore, laborGapSplitSummary } from '../engine/labor-gap-split.js';

const day = (loc, dt, needHrs, actHrs, darSchedHrs) => ({ loc, date: new Date(dt + 'T00:00:00'), needHrs, actHrs, darSchedHrs });

// Aug 11 2026 is a Tuesday — the LAST day of its own pay week (Wed Aug5-Tue Aug11) — a
// deliberately awkward anchor: even the final day of a pay week must not leak in as "today."
const ASOF = '2026-08-11T12:00:00';

describe('computeLaborGapSplit', () => {
  it('buckets by the Wed-Tue pay week, not Mon-Sun', () => {
    // Wed 2026-07-29 .. Tue 2026-08-04 — one full pay week, well before ASOF.
    const dates = ['2026-07-29','2026-07-30','2026-07-31','2026-08-01','2026-08-02','2026-08-03','2026-08-04'];
    const rows = dates.map(d => day('10422', d, 50, 52, 51));
    const splits = computeLaborGapSplit(rows, { asOf: ASOF });
    expect(splits).toHaveLength(1);
    expect(splits[0].weekStart).toBe('2026-07-29');
    expect(splits[0].days).toBe(7);
  });

  it('computes planning (sched-need) and execution (act-sched) gaps separately', () => {
    const dates = ['2026-07-29','2026-07-30','2026-07-31','2026-08-01','2026-08-02','2026-08-03','2026-08-04'];
    const rows = dates.map(d => day('10422', d, 50, 52, 51)); // need=350, sched=357, act=364/week
    const s = computeLaborGapSplit(rows, { asOf: ASOF })[0];
    expect(s.needHrs).toBeCloseTo(350, 2);
    expect(s.schedHrs).toBeCloseTo(357, 2);
    expect(s.actHrs).toBeCloseTo(364, 2);
    expect(s.planningGapHrs).toBeCloseTo(7, 2);   // scheduled 7hrs over plan
    expect(s.executionGapHrs).toBeCloseTo(7, 2);  // ran 7hrs over the schedule
    expect(s.combinedGapHrs).toBeCloseTo(14, 2);  // the two halves sum to the old single number
  });

  it('excludes the in-progress day (signature #4) — today never leaks into a week bucket', () => {
    const rows = [
      day('10422', '2026-08-05', 50, 52, 51), day('10422', '2026-08-06', 50, 52, 51),
      day('10422', '2026-08-07', 50, 52, 51), day('10422', '2026-08-08', 50, 52, 51),
      day('10422', '2026-08-09', 50, 52, 51), day('10422', '2026-08-10', 50, 52, 51),
      day('10422', '2026-08-11', 999, 999, 999), // today — must be dropped entirely
    ];
    const s = computeLaborGapSplit(rows, { asOf: ASOF })[0];
    expect(s.days).toBe(6); // Wed-Mon only, Tue (today) excluded
    expect(s.needHrs).toBeCloseTo(300, 2); // 6 x 50, not 6x50+999
    expect(s.complete).toBe(false); // week end (Tue Aug11) is after the last closed day (Mon Aug10)
  });

  it('a fully-elapsed week is complete; the current week is not', () => {
    const priorWeek = ['2026-07-29','2026-07-30','2026-07-31','2026-08-01','2026-08-02','2026-08-03','2026-08-04']
      .map(d => day('10422', d, 50, 52, 51));
    const currentWeekSoFar = ['2026-08-05','2026-08-06'].map(d => day('10422', d, 50, 52, 51));
    const splits = computeLaborGapSplit([...priorWeek, ...currentWeekSoFar], { asOf: ASOF });
    const prior = splits.find(s => s.weekStart === '2026-07-29');
    const current = splits.find(s => s.weekStart === '2026-08-05');
    expect(prior.complete).toBe(true);
    expect(current.complete).toBe(false);
  });

  it('scheduled hours unknown (null darSchedHrs anywhere in the week) reports the split as null, not a fabricated number', () => {
    const rows = [
      day('10422', '2026-07-29', 50, 52, 51),
      day('10422', '2026-07-30', 50, 52, null), // rollup not yet migrated for this row
      day('10422', '2026-07-31', 50, 52, 51),
      day('10422', '2026-08-01', 50, 52, 51),
      day('10422', '2026-08-02', 50, 52, 51),
      day('10422', '2026-08-03', 50, 52, 51),
      day('10422', '2026-08-04', 50, 52, 51),
    ];
    const s = computeLaborGapSplit(rows, { asOf: ASOF })[0];
    expect(s.schedHrs).toBeNull();
    expect(s.planningGapHrs).toBeNull();
    expect(s.executionGapHrs).toBeNull();
    // combinedGapHrs still has everything it needs (actual + needed, both always carried)
    expect(s.combinedGapHrs).toBeCloseTo(14, 2);
  });

  it('multiple stores and weeks stay in separate buckets', () => {
    const rows = [
      ...['2026-07-29','2026-07-30'].map(d => day('10422', d, 50, 52, 51)),
      ...['2026-07-29','2026-07-30'].map(d => day('3708', d, 40, 38, 39)),
    ];
    const splits = computeLaborGapSplit(rows, { asOf: ASOF });
    expect(splits.map(s => s.loc).sort()).toEqual(['10422', '3708']);
  });
});

describe('latestCompleteWeekByStore', () => {
  it('picks the most recent COMPLETE week per store, never an in-progress one', () => {
    const priorWeek = ['2026-07-29','2026-07-30','2026-07-31','2026-08-01','2026-08-02','2026-08-03','2026-08-04']
      .map(d => day('10422', d, 50, 52, 51));
    const currentWeekSoFar = ['2026-08-05','2026-08-06'].map(d => day('10422', d, 999, 999, 999));
    const splits = computeLaborGapSplit([...priorWeek, ...currentWeekSoFar], { asOf: ASOF });
    const latest = latestCompleteWeekByStore(splits);
    expect(latest['10422'].weekStart).toBe('2026-07-29');
    expect(latest['10422'].needHrs).toBeCloseTo(350, 2); // not the 999-contaminated in-progress week
  });
});

describe('laborGapSplitSummary', () => {
  it('rolls up totals and only counts stores with known scheduled hours', () => {
    const weekRows = [
      { loc: 'A', planningGapHrs: 5, executionGapHrs: 3, combinedGapHrs: 8 },
      { loc: 'B', planningGapHrs: null, executionGapHrs: null, combinedGapHrs: 10 }, // sched unknown
      { loc: 'C', planningGapHrs: -2, executionGapHrs: 4, combinedGapHrs: 2 },
    ];
    const s = laborGapSplitSummary(weekRows);
    expect(s.stores).toBe(3);
    expect(s.storesWithSchedData).toBe(2);
    expect(s.totalPlanningGapHrs).toBeCloseTo(3, 2);  // 5 + -2, B excluded
    expect(s.totalExecutionGapHrs).toBeCloseTo(7, 2); // 3 + 4, B excluded
    expect(s.totalCombinedGapHrs).toBeCloseTo(20, 2); // 8 + 10 + 2, always known
    expect(s.storesOverPlanning).toBe(1);  // only A (5 > 0)
    expect(s.storesOverExecution).toBe(2); // A and C
  });
});
