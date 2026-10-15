// @ts-nocheck
// Owner request 2026-10-15: "a report... to show history of each employee's wages... see when
// a pay rate changes and be able to have analysis on its expected impact to overall labor."
// All fixtures synthetic (no real geid/name/rate), same PII-fixture discipline as the rest of
// this repo's tests.
import { describe, it, expect } from 'vitest';
import {
  weeklyCrewRates, detectRateSteps, RATE_STEP_THRESHOLD, managementRateChanges,
  payImpact, ASSUMED_MANAGEMENT_WEEKLY_HOURS,
} from '../engine/employee-pay-history.js';

describe('weeklyCrewRates', () => {
  const assignments = [
    { loc: '0010422', shiftId: 's1', date: '2026-08-03', assignedEmploymentId: 'E1', employeeName: 'Alice A' }, // Mon wk1
    { loc: '0010422', shiftId: 's2', date: '2026-08-05', assignedEmploymentId: 'E1', employeeName: 'Alice A' }, // Wed wk1
    { loc: '0010422', shiftId: 's3', date: '2026-08-10', assignedEmploymentId: 'E1', employeeName: 'Alice A' }, // Mon wk2
  ];
  const pay = [
    { loc: '0010422', shiftId: 's1', earnings: 60, seconds: 14400 },  // 4h @ $15
    { loc: '0010422', shiftId: 's2', earnings: 45, seconds: 10800 },  // 3h @ $15
    { loc: '0010422', shiftId: 's3', earnings: 70, seconds: 14400 },  // 4h @ $17.50
  ];

  it('dollar-weights within a week (Σearnings/Σhours), not a mean of two shift rates', () => {
    const weekly = weeklyCrewRates(pay, assignments);
    const wk1 = weekly.find(w => w.weekStart === '2026-08-03');
    expect(wk1.hours).toBeCloseTo(7, 6);
    expect(wk1.earnings).toBeCloseTo(105, 6);
    expect(wk1.rate).toBeCloseTo(15, 6); // both shifts were $15/hr -- a trivial check it's not double-counting
  });

  it('a later week with a different rate is a separate bucket', () => {
    const weekly = weeklyCrewRates(pay, assignments);
    const wk2 = weekly.find(w => w.weekStart === '2026-08-10');
    expect(wk2.rate).toBeCloseTo(17.5, 6);
  });

  it('a shift with no matching pay row (pull gap) is silently excluded, not a fabricated 0', () => {
    const assignmentsWithGap = [...assignments, { loc: '0010422', shiftId: 'missing', date: '2026-08-11', assignedEmploymentId: 'E1', employeeName: 'Alice A' }];
    const weekly = weeklyCrewRates(pay, assignmentsWithGap);
    const wk2 = weekly.find(w => w.weekStart === '2026-08-10');
    expect(wk2.hours).toBeCloseTo(4, 6); // only s3 counted, not a 3rd phantom shift
  });

  it('empty input yields an empty array, not a throw', () => {
    expect(weeklyCrewRates([], [])).toEqual([]);
    expect(weeklyCrewRates(null, null)).toEqual([]);
  });
});

describe('detectRateSteps', () => {
  it('flags a step clearly above the threshold, either direction', () => {
    const bumped = 15.0 + RATE_STEP_THRESHOLD + 0.05; // clear of the boundary -- avoids a float-precision false negative right at the threshold
    const series = [
      { weekStart: '2026-08-03', rate: 15.0, hours: 20 },
      { weekStart: '2026-08-10', rate: bumped, hours: 25 },
      { weekStart: '2026-08-17', rate: 15.0, hours: 20 }, // drops back -- still a real step
    ];
    const steps = detectRateSteps(series);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ weekStart: '2026-08-10', fromRate: 15.0, toRate: bumped, hoursAtNewRate: 25 });
    expect(steps[0].delta).toBeCloseTo(RATE_STEP_THRESHOLD + 0.05, 6);
    expect(steps[1].delta).toBeCloseTo(-(RATE_STEP_THRESHOLD + 0.05), 6);
  });

  it('ordinary week-to-week noise below the threshold is not a step', () => {
    const series = [
      { weekStart: '2026-08-03', rate: 15.00, hours: 20 },
      { weekStart: '2026-08-10', rate: 15.05, hours: 20 },
    ];
    expect(detectRateSteps(series)).toEqual([]);
  });

  it('a week with no rate (null, no data) is skipped, not treated as a drop to zero', () => {
    const series = [
      { weekStart: '2026-08-03', rate: 15.0, hours: 20 },
      { weekStart: '2026-08-10', rate: null, hours: 0 },
      { weekStart: '2026-08-17', rate: 15.0, hours: 20 },
    ];
    expect(detectRateSteps(series)).toEqual([]);
  });
});

describe('managementRateChanges', () => {
  it('reshapes qsr_tenure rows into the display shape, sorted newest-first', () => {
    const rows = [
      { source: 'qsr_tenure', loc: '0003708', personKey: 'g1', employeeName: 'B Mgr', jobTitle: 'General Manager', priorRate: 18, newRate: 19, effectiveDate: '2026-09-01' },
      { source: 'qsr_tenure', loc: '0003708', personKey: 'g1', employeeName: 'B Mgr', jobTitle: 'General Manager', priorRate: 19, newRate: 19.5, effectiveDate: '2026-10-01' },
    ];
    const out = managementRateChanges(rows);
    expect(out).toHaveLength(2);
    expect(out[0].effectiveDate).toBe('2026-10-01'); // newest first
    expect(out[0].delta).toBeCloseTo(0.5, 6);
    expect(out[1].delta).toBeCloseTo(1, 6);
  });

  it('ignores a non-qsr_tenure row (future crew-source rows, if that design ever changes)', () => {
    const rows = [{ source: 'something_else', loc: '0003708', personKey: 'x', priorRate: 1, newRate: 2, effectiveDate: '2026-10-01' }];
    expect(managementRateChanges(rows)).toEqual([]);
  });
});

describe('payImpact', () => {
  it('weekly = delta × hours; annualized = weekly × 52', () => {
    const { weeklyDollarImpact, annualizedDollarImpact } = payImpact(0.5, ASSUMED_MANAGEMENT_WEEKLY_HOURS);
    expect(weeklyDollarImpact).toBeCloseTo(20, 6); // $0.50 × 40h
    expect(annualizedDollarImpact).toBeCloseTo(1040, 6); // $20 × 52
  });

  it('a negative delta (a pay cut / role change) yields a negative impact, not clamped to zero', () => {
    const { weeklyDollarImpact } = payImpact(-0.5, 40);
    expect(weeklyDollarImpact).toBeCloseTo(-20, 6);
  });

  it('nulls, not fabricated zeros, when delta or hours is unknown', () => {
    expect(payImpact(null, 40)).toEqual({ weeklyDollarImpact: null, annualizedDollarImpact: null });
    expect(payImpact(0.5, null)).toEqual({ weeklyDollarImpact: null, annualizedDollarImpact: null });
  });
});
