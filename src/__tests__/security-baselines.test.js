// @ts-nocheck
// src/engine/security-baselines.js — personal/peer/store/network baseline computation +
// exposureRate normalization, against fixture data covering 2 stores, 3 employees, a 4-day
// window. Every expected value below is hand-computed in each test's comment; this proves the
// functions reproduce known arithmetic, not just "runs without throwing."
//
// Fixture (cashOSDollar $-short / drawerSales $, normalized per $1,000 sales):
//   Alice (loc 1): days -5,-3,-7,-1 on $1000 sales each -> |sum|=16, sales=4000, overall=4
//                  per-day rates: 5,3,7,1 -> mean=4, stdev=sqrt(((5-4)^2+(3-4)^2+(7-4)^2+(1-4)^2)/4)=sqrt(5)
//   Bob   (loc 1): days -2,-2,-2,-2 on $2000 sales each -> |sum|=8, sales=8000, overall=1 (flat, stdev=0)
//   Carol (loc 2): days -9,-3        on $1500 sales each -> |sum|=12, sales=3000, overall=4
import { describe, it, expect } from 'vitest';
import { exposureRate, personalBaseline, peerBaseline, storeBaseline, networkBaseline } from '../engine/security-baselines.js';

const ROWS = [
  { loc: '0000001', emp: 'Alice', date: '2026-08-01', drawerSales: 1000, cashOSDollar: -5 },
  { loc: '0000001', emp: 'Alice', date: '2026-08-02', drawerSales: 1000, cashOSDollar: -3 },
  { loc: '0000001', emp: 'Alice', date: '2026-08-03', drawerSales: 1000, cashOSDollar: -7 },
  { loc: '0000001', emp: 'Alice', date: '2026-08-04', drawerSales: 1000, cashOSDollar: -1 },
  { loc: '0000001', emp: 'Bob',   date: '2026-08-01', drawerSales: 2000, cashOSDollar: -2 },
  { loc: '0000001', emp: 'Bob',   date: '2026-08-02', drawerSales: 2000, cashOSDollar: -2 },
  { loc: '0000001', emp: 'Bob',   date: '2026-08-03', drawerSales: 2000, cashOSDollar: -2 },
  { loc: '0000001', emp: 'Bob',   date: '2026-08-04', drawerSales: 2000, cashOSDollar: -2 },
  { loc: '0000002', emp: 'Carol', date: '2026-08-01', drawerSales: 1500, cashOSDollar: -9 },
  { loc: '0000002', emp: 'Carol', date: '2026-08-02', drawerSales: 1500, cashOSDollar: -3 },
];
const OPTS = { numField: 'cashOSDollar', denField: 'drawerSales', scale: 1000, abs: true, start: '2026-08-01', end: '2026-08-04' };

describe('exposureRate() — the shared normalization primitive', () => {
  it('dollar-weights across rows (sum/sum*scale), never averages per-row percentages', () => {
    // Alice: |sum|=16, sales=4000 -> 16/4000*1000 = 4. A naive mean of [5,3,7,1] would ALSO be
    // 4 here by coincidence of this fixture -- the assertion that matters is denominatorSum,
    // proven directly in the ratio-interpreter tests. Confirmed here as a sanity baseline.
    expect(exposureRate(ROWS.filter(r => r.emp === 'Alice'), { numField: 'cashOSDollar', denField: 'drawerSales', scale: 1000, abs: true })).toBeCloseTo(4, 6);
  });
  it('returns null, not 0 or Infinity, when there is no exposure to normalize against', () => {
    expect(exposureRate([{ drawerSales: 0, cashOSDollar: -5 }], { numField: 'cashOSDollar', denField: 'drawerSales' })).toBeNull();
    expect(exposureRate([], { numField: 'cashOSDollar', denField: 'drawerSales' })).toBeNull();
  });
});

describe('personalBaseline() — per-day distribution + separate dollar-weighted overall', () => {
  it("Alice: per-day mean=4, stdev=sqrt(5), overall=4 (matches exposureRate)", () => {
    const b = personalBaseline(ROWS, { emp: 'Alice', loc: '0000001', ...OPTS });
    expect(b.n).toBe(4);
    expect(b.values.sort((a, c) => a - c)).toEqual([1, 3, 5, 7]);
    expect(b.mean).toBeCloseTo(4, 6);
    expect(b.stdev).toBeCloseTo(Math.sqrt(5), 6);
    expect(b.overall).toBeCloseTo(4, 6);
    expect(b.recordCount).toBe(4);
  });
  it('Bob: a perfectly flat rate has stdev=0', () => {
    const b = personalBaseline(ROWS, { emp: 'Bob', loc: '0000001', ...OPTS });
    expect(b.mean).toBeCloseTo(1, 6);
    expect(b.stdev).toBeCloseTo(0, 6);
    expect(b.overall).toBeCloseTo(1, 6);
  });
});

describe('peerBaseline() — distribution across OTHER employees at the same store', () => {
  it("Alice's peer group at loc 1 is just Bob (overall=1) — self excluded by default", () => {
    const b = peerBaseline(ROWS, { emp: 'Alice', loc: '0000001', ...OPTS });
    expect(b.memberCount).toBe(1);
    expect(b.values).toEqual([1]);
    expect(b.mean).toBeCloseTo(1, 6);
    expect(b.stdev).toBeCloseTo(0, 6);
  });
  it('excludeSelf:false includes the subject in their own peer distribution', () => {
    const b = peerBaseline(ROWS, { emp: 'Alice', loc: '0000001', excludeSelf: false, ...OPTS });
    expect(b.memberCount).toBe(2);
    expect(b.values.sort((a, c) => a - c)).toEqual([1, 4]);
  });
  it('never crosses the store boundary — Carol (loc 2) never appears in loc 1 peers', () => {
    const b = peerBaseline(ROWS, { emp: 'Alice', loc: '0000001', ...OPTS });
    expect(b.values).not.toContain(4);
  });
});

describe('storeBaseline() — this store vs OTHER stores, all employees pooled per store', () => {
  it('loc 1 compared against other stores sees only loc 2 (Carol, overall=4)', () => {
    const b = storeBaseline(ROWS, { loc: '0000001', ...OPTS });
    expect(b.memberCount).toBe(1);
    expect(b.values).toEqual([4]);
  });
  it("loc 2's own pooled rate (computed independently via exposureRate) is 4, matching Carol's solo numbers", () => {
    const loc2Pooled = exposureRate(ROWS.filter(r => r.loc === '0000002'), { numField: 'cashOSDollar', denField: 'drawerSales', scale: 1000, abs: true });
    expect(loc2Pooled).toBeCloseTo(4, 6);
  });
});

describe('networkBaseline() — every OTHER employee org-wide, ignoring store boundary', () => {
  it("Alice's network baseline pools Bob (1) AND Carol (4) — wider than her peer group", () => {
    const b = networkBaseline(ROWS, { emp: 'Alice', ...OPTS });
    expect(b.memberCount).toBe(2);
    expect(b.values.sort((a, c) => a - c)).toEqual([1, 4]);
    expect(b.mean).toBeCloseTo(2.5, 6);
    expect(b.stdev).toBeCloseTo(1.5, 6); // sqrt(((1-2.5)^2+(4-2.5)^2)/2) = sqrt(2.25) = 1.5
  });
});

// Dispatch #59 -- register_type joined audit_rows' grain, so one employee can now carry 2-3 rows
// for the same date (Cashier/Manager/Preparer). personalBaseline's own comment states the
// invariant it depends on: "one rate per qualifying row in the window" -- this is precisely what
// breaks if perDay keeps computing one observation per RAW ROW instead of one per DAY. The
// dispatch's own decision (stated in its addendum): COLLAPSE to one row per employee-day before
// rating, not keep per-register-type observations -- preserves cashier-only meaning exactly.
// Per the standing revert rule, this calls personalBaseline() itself (not a row builder), so it
// fails if the collapse decision is reverted back to one-observation-per-row.
describe('personalBaseline() — the register_type collapse decision (dispatch #59)', () => {
  const MULTI_TYPE_ROWS = [
    // Dave works BOTH a Cashier and a Manager drawer on 2026-08-05 -- this MUST count as one
    // day's observation, not two, or n inflates and the day gets double-weighted.
    { loc: '0000003', emp: 'Dave', registerType: 'cashier', date: '2026-08-05', drawerSales: 600, cashOSDollar: -3 },
    { loc: '0000003', emp: 'Dave', registerType: 'manager', date: '2026-08-05', drawerSales: 400, cashOSDollar: -2 },
    // A second, ordinary single-register day.
    { loc: '0000003', emp: 'Dave', registerType: 'cashier', date: '2026-08-06', drawerSales: 500, cashOSDollar: -1 },
  ];
  const OPTS2 = { emp: 'Dave', loc: '0000003', numField: 'cashOSDollar', denField: 'drawerSales', scale: 1000, abs: true, start: '2026-08-01', end: '2026-08-10' };

  it('n stays 2 (two DAYS), not 3 (three rows) -- the collapse decision, pinned', () => {
    const b = personalBaseline(MULTI_TYPE_ROWS, OPTS2);
    expect(b.n).toBe(2);
    expect(b.recordCount).toBe(3); // recordCount is the raw row count -- deliberately NOT collapsed, it's a different field for a different purpose (audit trail of rows seen)
  });

  it("the multi-type day's rate is the DAY'S combined dollars, not either register type alone", () => {
    // 2026-08-05 combined: |−3|+|−2| = 5 over 600+400 = 1000 sales -> 5/1000*1000 = 5. If this
    // were NOT collapsed (one obs per row instead), the two per-row rates would be 5 (cashier:
    // 3/600*1000) and 5 (manager: 2/400*1000) -- coincidentally identical in this fixture, which
    // is exactly why the n assertion above is the one that actually proves collapse happened.
    // 2026-08-06: |−1|/500*1000 = 2.
    const b = personalBaseline(MULTI_TYPE_ROWS, OPTS2);
    expect(b.values.sort((a, c) => a - c)).toEqual([2, 5]);
  });

  it('overall stays dollar-weighted across ALL rows regardless of register type -- unaffected by the collapse', () => {
    // overall is intentionally NOT collapsed -- exposureRate() already dollar-weights across
    // every row handed to it, register type notwithstanding. |−3|+|−2|+|−1|=6 over 600+400+500=1500.
    const b = personalBaseline(MULTI_TYPE_ROWS, OPTS2);
    expect(b.overall).toBeCloseTo((6 / 1500) * 1000, 6);
  });
});

describe('window bounds are honored — a row outside [start,end] never contributes', () => {
  it('narrowing the window to a single day changes personalBaseline', () => {
    const b = personalBaseline(ROWS, { emp: 'Alice', loc: '0000001', numField: 'cashOSDollar', denField: 'drawerSales', scale: 1000, abs: true, start: '2026-08-01', end: '2026-08-01' });
    expect(b.n).toBe(1);
    expect(b.overall).toBeCloseTo(5, 6);
  });
});
