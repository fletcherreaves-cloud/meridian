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

// Owner-caught 2026-11-05 (real wage-accuracy bug): overtime is paid at 1.5x, measured directly
// against real lifelenz_payroll_readiness rows -- a week with ANY overtime would otherwise push
// the blended earnings/hours rate above the employee's real base rate by however much OT that
// week happened to carry, which detectRateSteps could mistake for a raise or a cut. These guard
// the straight-time rate the regular/overtime split (persisted once schema-lifelenz-shift-pay-
// ot-split.sql has run) makes possible.
describe('weeklyCrewRates — regular/overtime split (owner-caught 2026-11-05)', () => {
  const assignments = [
    { loc: '0010422', shiftId: 's1', date: '2026-08-03', assignedEmploymentId: 'E1', employeeName: 'Alice A' },
  ];

  it('a week with OT uses the STRAIGHT-TIME rate (regEarnings/regSeconds), not the OT-inflated blended rate', () => {
    // 6h regular @ $15 ($90) + 2h overtime @ $22.50 (1.5x $15, $45) = $135 blended over 8h = $16.875/hr blended --
    // that number is NOT this employee's real base rate; $15/hr (regEarnings/regSeconds) is.
    const pay = [{ loc: '0010422', shiftId: 's1', earnings: 135, seconds: 28800, regEarnings: 90, regSeconds: 21600, otEarnings: 45, otSeconds: 7200 }];
    const weekly = weeklyCrewRates(pay, assignments);
    const wk = weekly.find(w => w.weekStart === '2026-08-03');
    expect(wk.rate).toBeCloseTo(15, 6); // straight-time, not the 16.875 blended figure
    expect(wk.rateBasis).toBe('straight-time');
    expect(wk.earnings).toBeCloseTo(135, 6); // the blended total is still tracked, just not used for `rate`
  });

  it('pre-migration data (no split columns at all, regSeconds/regEarnings undefined) falls back to the old blended rate -- never breaks', () => {
    const pay = [{ loc: '0010422', shiftId: 's1', earnings: 60, seconds: 14400 }]; // no regEarnings/regSeconds/otEarnings/otSeconds keys
    const weekly = weeklyCrewRates(pay, assignments);
    const wk = weekly.find(w => w.weekStart === '2026-08-03');
    expect(wk.rate).toBeCloseTo(15, 6); // same as the blended rate here since there's nothing to split
    expect(wk.rateBasis).toBe('blended (pre-split data)');
  });

  it('a 100%-overtime week (split present but zero regular seconds) falls back to the blended rate rather than dividing by zero', () => {
    const pay = [{ loc: '0010422', shiftId: 's1', earnings: 90, seconds: 14400, regEarnings: 0, regSeconds: 0, otEarnings: 90, otSeconds: 14400 }];
    const weekly = weeklyCrewRates(pay, assignments);
    const wk = weekly.find(w => w.weekStart === '2026-08-03');
    expect(wk.rate).toBeCloseTo(90 / 4, 6); // blended fallback, not null/NaN
    expect(wk.rateBasis).toBe('blended (100% OT this week)');
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

  it('carries each side\'s rateBasis through, so a caller can tell a clean straight-time step from one that might still be an OT-mix swing', () => {
    const bumped = 15.0 + RATE_STEP_THRESHOLD + 0.05;
    const series = [
      { weekStart: '2026-08-03', rate: 15.0, hours: 20, rateBasis: 'straight-time' },
      { weekStart: '2026-08-10', rate: bumped, hours: 25, rateBasis: 'blended (100% OT this week)' },
    ];
    const steps = detectRateSteps(series);
    expect(steps[0].fromRateBasis).toBe('straight-time');
    expect(steps[0].toRateBasis).toBe('blended (100% OT this week)');
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
