// @ts-nocheck
// Pay raise / review cycle tracking, v1. Owner, live, 2026-10-15: detect an unexplained AROP
// (avg rate of pay) jump, let it be logged against a store with an effective date, and measure
// its before/after labor-cost impact. Mirrors coaching-loop.test.js's fixture conventions
// (unpadded loc, Date-object rows) so a reader familiar with that file recognizes this one.
import { describe, it, expect } from 'vitest';
import { detectAropJumps, payRaiseImpact, AROP_WINDOW_DAYS, AROP_JUMP_THRESHOLD, PAY_EVENT_TYPES } from '../engine/pay-events.js';

const addDays = (dateStr, n) => { const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const ASOF = '2026-08-11T12:00:00'; // matches coaching-loop.test.js's anchor -> lastClosedBusinessDay = 2026-08-10

// Builds laborRows+qsrActSummaryRows for `loc` over [start,end] inclusive, holding sales/actHrs
// fixed and deriving laborPct from the desired avgRate (avgRate = laborPct*sales/actHrs).
function rateRows(loc, start, end, avgRate, sales = 10000, actHrs = 250) {
  const laborPct = (avgRate * actHrs) / sales;
  const laborRows = [], qsrActSummaryRows = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    laborRows.push({ loc, date: new Date(d + 'T00:00:00'), laborPct, sales });
    qsrActSummaryRows.push({ loc, date: new Date(d + 'T00:00:00'), actHrs });
  }
  return { laborRows, qsrActSummaryRows };
}
function mergeDs(...parts) {
  return { laborRows: parts.flatMap(p => p.laborRows), qsrActSummaryRows: parts.flatMap(p => p.qsrActSummaryRows) };
}

describe('detectAropJumps', () => {
  it('flags a store whose trailing AROP stepped up by >= AROP_JUMP_THRESHOLD with no logged reason', () => {
    // prior window 07-14..07-27 at $10/hr, current window 07-28..08-10 at $10.50/hr -> delta 0.50
    const ds = mergeDs(
      rateRows('10422', '2026-07-14', '2026-07-27', 10),
      rateRows('10422', '2026-07-28', '2026-08-10', 10.5),
    );
    const out = detectAropJumps(ds, ['10422'], [], ASOF);
    expect(out).toHaveLength(1);
    expect(out[0].loc).toBe('10422');
    expect(out[0].current).toBeCloseTo(10.5, 5);
    expect(out[0].prior).toBeCloseTo(10, 5);
    expect(out[0].delta).toBeCloseTo(0.5, 5);
  });

  it('does not flag a jump smaller than AROP_JUMP_THRESHOLD', () => {
    const smallJump = AROP_JUMP_THRESHOLD - 0.05;
    const ds = mergeDs(
      rateRows('10422', '2026-07-14', '2026-07-27', 10),
      rateRows('10422', '2026-07-28', '2026-08-10', 10 + smallJump),
    );
    expect(detectAropJumps(ds, ['10422'], [], ASOF)).toHaveLength(0);
  });

  it('never flags a DROP in AROP, however large', () => {
    const ds = mergeDs(
      rateRows('10422', '2026-07-14', '2026-07-27', 11),
      rateRows('10422', '2026-07-28', '2026-08-10', 9), // dropped $2/hr
    );
    expect(detectAropJumps(ds, ['10422'], [], ASOF)).toHaveLength(0);
  });

  it('stays quiet once a pay_events row already explains the jump', () => {
    const ds = mergeDs(
      rateRows('10422', '2026-07-14', '2026-07-27', 10),
      rateRows('10422', '2026-07-28', '2026-08-10', 10.5),
    );
    const payEvents = [{ loc: '10422', effectiveDate: '2026-08-01' }]; // inside the lookback window
    expect(detectAropJumps(ds, ['10422'], payEvents, ASOF)).toHaveLength(0);
  });

  it('a pay event logged OUTSIDE the lookback window does not suppress the flag', () => {
    const ds = mergeDs(
      rateRows('10422', '2026-07-14', '2026-07-27', 10),
      rateRows('10422', '2026-07-28', '2026-08-10', 10.5),
    );
    const payEvents = [{ loc: '10422', effectiveDate: '2026-01-01' }]; // long before the lookback window
    expect(detectAropJumps(ds, ['10422'], payEvents, ASOF)).toHaveLength(1);
  });

  it('returns null-safe empty list with no data, and sorts multiple flagged stores biggest-delta-first', () => {
    expect(detectAropJumps(null, ['10422'], [], ASOF)).toEqual([]);
    expect(detectAropJumps({}, ['10422'], [], ASOF)).toEqual([]);
    const ds = mergeDs(
      rateRows('10422', '2026-07-14', '2026-07-27', 10),
      rateRows('10422', '2026-07-28', '2026-08-10', 10.3), // delta 0.30
      rateRows('13113', '2026-07-14', '2026-07-27', 10),
      rateRows('13113', '2026-07-28', '2026-08-10', 11),   // delta 1.00
    );
    const out = detectAropJumps(ds, ['10422', '13113'], [], ASOF);
    expect(out.map(o => o.loc)).toEqual(['13113', '10422']);
  });
});

describe('payRaiseImpact', () => {
  const EFF = '2026-08-01';
  function impactFixture(afterRate) {
    return mergeDs(
      rateRows('10422', '2026-07-18', '2026-07-31', 10),       // before window
      rateRows('10422', '2026-08-01', '2026-08-14', afterRate), // after window
    );
  }

  it('computes before/after AROP, labor% and dollar impact once the after-window has fully elapsed', () => {
    const ds = impactFixture(10.4);
    const res = payRaiseImpact(ds, { loc: '10422', effectiveDate: EFF }, '2026-08-20T12:00:00');
    expect(res.ready).toBe(true);
    expect(res.aropBefore).toBeCloseTo(10, 5);
    expect(res.aropAfter).toBeCloseTo(10.4, 5);
    expect(res.aropDelta).toBeCloseTo(0.4, 5);
    // weekly impact = aropDelta * actHrsAfter(250/day) * 7
    expect(res.weeklyLaborDollarImpact).toBeCloseTo(0.4 * 250 * 7, 2);
    expect(res.annualizedLaborDollarImpact).toBeCloseTo(0.4 * 250 * 7 * 52, 2);
    expect(res.laborPctDeltaPP).toBeGreaterThan(0); // labor% rose too, since hours held flat and rate rose
  });

  it('is not ready (and reports a shorter in-progress after-window) before AROP_WINDOW_DAYS have elapsed', () => {
    const ds = impactFixture(10.4);
    const res = payRaiseImpact(ds, { loc: '10422', effectiveDate: EFF }, '2026-08-05T12:00:00');
    expect(res.ready).toBe(false);
    // still measures SOMETHING from the partial window rather than refusing outright
    expect(res.aropAfter).toBeCloseTo(10.4, 5);
  });

  it('a flat AROP before vs after yields zero dollar impact, not null', () => {
    const ds = impactFixture(10); // no real raise took effect
    const res = payRaiseImpact(ds, { loc: '10422', effectiveDate: EFF }, '2026-08-20T12:00:00');
    expect(res.aropDelta).toBeCloseTo(0, 5);
    expect(res.weeklyLaborDollarImpact).toBeCloseTo(0, 5);
  });

  it('returns nulls, not fabricated zeros, when there is no data at all', () => {
    const res = payRaiseImpact({ laborRows: [], qsrActSummaryRows: [] }, { loc: '10422', effectiveDate: EFF }, '2026-08-20T12:00:00');
    expect(res.aropBefore).toBeNull();
    expect(res.aropAfter).toBeNull();
    expect(res.aropDelta).toBeNull();
    expect(res.weeklyLaborDollarImpact).toBeNull();
  });
});

describe('PAY_EVENT_TYPES', () => {
  it('every entry has a label', () => {
    for (const key of Object.keys(PAY_EVENT_TYPES)) expect(PAY_EVENT_TYPES[key].label).toBeTruthy();
  });
});
