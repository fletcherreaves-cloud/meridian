// @ts-nocheck
// #208 — coaching feedback loop v1. Guards the five rules from
// memory/project-coaching-feedback-loop.md: auto-captured baseline (never typed), a measured
// verdict that stays null without a real threshold (the explicit v1 fallback — "ship cycle
// recording without verdicts rather than with wrong ones"), and the dollar-weighted FOB
// convention (never a mean of daily ratios).
import { describe, it, expect } from 'vitest';
import {
  COACHING_METRICS, NOISE_THRESHOLDS, SNAPSHOT_WINDOW_DAYS, REVIEW_WINDOW_DAYS,
  snapshotMetricValue, startCoachingCycle, dueForReview, computeVerdict,
  recordCoachingResult, toAttentionItem,
} from '../engine/coaching-loop.js';

const addDays = (dateStr, n) => { const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const ASOF = '2026-08-11T12:00:00'; // matches labor-gap-split.test.js's anchor

describe('snapshotMetricValue', () => {
  it('labor_pct averages the trailing window via metricAvg (same number Labor Tools shows)', () => {
    const start = addDays('2026-08-10', -(SNAPSHOT_WINDOW_DAYS - 1));
    const dates = []; for (let d = start; d <= '2026-08-10'; d = addDays(d, 1)) dates.push(d);
    const laborRows = dates.map(dt => ({ loc: '10422', date: new Date(dt + 'T00:00:00'), laborPct: 0.24 }));
    const val = snapshotMetricValue({ laborRows }, '10422', 'labor_pct', ASOF);
    expect(val).toBeCloseTo(0.24, 5);
  });

  it('FOB components are dollar-weighted (Σamt/Σsales), not a mean of daily ratios', () => {
    // Two days, deliberately different sales so a naive mean-of-ratios would differ from the
    // dollar-weighted answer.
    const qsrFobRows = [
      { loc: '0010422', date: '2026-08-09', prodSalesAmt: 1000, condimentsAmt: 20 },  // 2.0%
      { loc: '0010422', date: '2026-08-10', prodSalesAmt: 3000, condimentsAmt: 90 },  // 3.0%
    ];
    const val = snapshotMetricValue({ qsrFobRows }, '10422', 'condiment_pct', ASOF);
    // dollar-weighted: (20+90)/(1000+3000) = 110/4000 = 2.75% — NOT the naive mean (2.0+3.0)/2=2.5%
    expect(val).toBeCloseTo(0.0275, 5);
  });

  it('fob_total_pct sums all 6 controllable components before weighting', () => {
    const qsrFobRows = [{
      loc: '10422', date: '2026-08-10', prodSalesAmt: 1000,
      compWasteAmt: 2, rawWasteAmt: 3, condimentsAmt: 20, empMgrMealsAmt: 2, statVarianceAmt: 10, unexplainedAmt: 3,
    }];
    const val = snapshotMetricValue({ qsrFobRows }, '10422', 'fob_total_pct', ASOF);
    expect(val).toBeCloseTo((2 + 3 + 20 + 2 + 10 + 3) / 1000, 5);
  });

  it('excludes the in-progress day (signature #4) — matches lastClosedBusinessDay', () => {
    const qsrFobRows = [
      { loc: '10422', date: '2026-08-10', prodSalesAmt: 1000, condimentsAmt: 20 },
      { loc: '10422', date: '2026-08-11', prodSalesAmt: 999999, condimentsAmt: 999999 }, // today, must be excluded
    ];
    const val = snapshotMetricValue({ qsrFobRows }, '10422', 'condiment_pct', ASOF);
    expect(val).toBeCloseTo(0.02, 5);
  });

  it('returns null (not a fabricated 0) when there is no real data for the window', () => {
    expect(snapshotMetricValue({ qsrFobRows: [] }, '10422', 'condiment_pct', ASOF)).toBeNull();
    expect(snapshotMetricValue({ laborRows: [] }, '10422', 'labor_pct', ASOF)).toBeNull();
  });

  it('an unknown metric key returns null rather than throwing', () => {
    expect(snapshotMetricValue({}, '10422', 'not_a_real_metric', ASOF)).toBeNull();
  });
});

describe('startCoachingCycle', () => {
  it('auto-captures baseline, sets coachedAt to today and reviewAt +30 days — never a typed baseline', () => {
    const qsrFobRows = [{ loc: '10422', date: '2026-08-10', prodSalesAmt: 1000, condimentsAmt: 20 }];
    const cycle = startCoachingCycle({ qsrFobRows }, { loc: '10422', metricKey: 'condiment_pct', note: 'talked to GM about portioning' }, ASOF);
    expect(cycle.loc).toBe('10422');
    expect(cycle.metric).toBe('condiment_pct');
    expect(cycle.baseline).toBeCloseTo(0.02, 5);
    expect(cycle.coachedAt).toBe('2026-08-11');
    expect(cycle.reviewAt).toBe('2026-09-10'); // +30 days
    expect(cycle.note).toBe('talked to GM about portioning');
    expect(cycle.result).toBeNull();
    expect(cycle.verdict).toBeNull();
  });

  it('rejects a metric outside the food-cost/labor scope rather than silently accepting it', () => {
    expect(() => startCoachingCycle({}, { loc: '10422', metricKey: 'oepe' }, ASOF)).toThrow();
  });

  it('unpads loc for storage consistency', () => {
    const cycle = startCoachingCycle({}, { loc: '0010422', metricKey: 'labor_pct' }, ASOF);
    expect(cycle.loc).toBe('10422');
  });
});

describe('dueForReview', () => {
  it('returns cycles whose reviewAt has arrived and have no result yet', () => {
    const cycles = [
      { loc: 'A', reviewAt: '2026-08-10', result: null },   // due
      { loc: 'B', reviewAt: '2026-08-11', result: null },   // due (exactly today)
      { loc: 'C', reviewAt: '2026-08-12', result: null },   // not yet due
      { loc: 'D', reviewAt: '2026-08-01', result: 0.02 },   // already recorded — not due again
    ];
    const due = dueForReview(cycles, ASOF);
    expect(due.map(c => c.loc).sort()).toEqual(['A', 'B']);
  });
});

describe('computeVerdict — the v1 fallback: null without a measured threshold', () => {
  it('returns null when NOISE_THRESHOLDS has no entry for this metric (the actual v1 state)', () => {
    expect(NOISE_THRESHOLDS.labor_pct).toBeUndefined(); // confirms v1 ships empty, per #208's own fallback
    expect(computeVerdict(0.24, 0.20, 'labor_pct')).toBeNull();
  });

  it('classifies improved/worse/no-change once a threshold IS registered (future-state check)', () => {
    const saved = NOISE_THRESHOLDS.labor_pct;
    NOISE_THRESHOLDS.labor_pct = 0.01; // 1pp, hypothetical for this test only
    try {
      expect(computeVerdict(0.24, 0.22, 'labor_pct')).toBe('improved'); // -2pp, past threshold
      expect(computeVerdict(0.24, 0.26, 'labor_pct')).toBe('worse');    // +2pp, past threshold
      expect(computeVerdict(0.24, 0.245, 'labor_pct')).toBe('no change'); // +0.5pp, within noise
    } finally {
      if (saved === undefined) delete NOISE_THRESHOLDS.labor_pct; else NOISE_THRESHOLDS.labor_pct = saved;
    }
  });

  it('returns null when baseline or result is missing, never guesses', () => {
    NOISE_THRESHOLDS.labor_pct = 0.01;
    try {
      expect(computeVerdict(null, 0.22, 'labor_pct')).toBeNull();
      expect(computeVerdict(0.24, null, 'labor_pct')).toBeNull();
    } finally { delete NOISE_THRESHOLDS.labor_pct; }
  });
});

describe('recordCoachingResult', () => {
  it('captures result via the same auto-capture path and leaves verdict null in v1', () => {
    const qsrFobRows = [{ loc: '10422', date: '2026-08-10', prodSalesAmt: 1000, condimentsAmt: 15 }];
    const cycle = { loc: '10422', metric: 'condiment_pct', baseline: 0.02, coachedAt: '2026-07-11', reviewAt: '2026-08-10', result: null, verdict: null };
    const updated = recordCoachingResult({ qsrFobRows }, cycle, ASOF);
    expect(updated.result).toBeCloseTo(0.015, 5);
    expect(updated.verdict).toBeNull();
    expect(cycle.result).toBeNull(); // input not mutated
  });
});

describe('toAttentionItem', () => {
  it('builds a standard attention-feed item shape tagged kind:coaching-review', () => {
    const cycle = { loc: '10422', metric: 'condiment_pct', baseline: 0.02, coachedAt: '2026-07-11', note: 'talked to GM', reviewAt: '2026-08-10', result: null, verdict: null };
    const item = toAttentionItem(cycle, loc => 'Store ' + loc);
    expect(item.kind).toBe('coaching-review');
    expect(item.severity).toBe('info');
    expect(item.category).toBe('Coaching');
    expect(item.loc).toBe('10422');
    expect(item.title).toContain('Condiment %');
    expect(item.title).toContain('Store 10422');
    expect(item.detail).toContain('talked to GM');
    expect(item.detail).toContain('2.00%');
    expect(item.dollars).toBe(0);
    expect(typeof item.id).toBe('string');
  });

  it('accepts a plain string for storeName too, not just a lookup function', () => {
    const cycle = { loc: '3708', metric: 'labor_pct', baseline: 0.22, coachedAt: '2026-07-11', note: '', reviewAt: '2026-08-10' };
    const item = toAttentionItem(cycle, 'Freeport');
    expect(item.title).toContain('Freeport');
  });
});
