// @ts-nocheck
// Opportunity $ v1 (memory/design-opportunity-dollars.md) — the district-wide ds-adapter.
// The pure 3-pillar math (opportunity.js) and the ds->inputs mapping (buildOnePagerInputs,
// one-pager-data.js) are each already covered by their own test files; this file only proves
// this NEW layer's own job: picking MTD/trailing-6mo windows deterministically, and wiring
// buildOnePagerInputs -> computeOpportunity -> rankByOpportunity into one call.
import { describe, it, expect } from 'vitest';
import { mtdRange, trailing6moRange, districtOpportunity, annualizedFromSixMo } from '../engine/opportunity-district.js';

const d = s => new Date(s + 'T12:00:00');

describe('mtdRange', () => {
  it('is first-of-month through the given day, inclusive', () => {
    expect(mtdRange(d('2026-08-23'))).toEqual({ s: '2026-08-01', e: '2026-08-23' });
  });
});

describe('trailing6moRange', () => {
  it('is 6 FULL calendar months, excluding the current partial month', () => {
    // Today = Aug 23 -> last FULL month is July; 6 full months back from Aug 1 = Feb 1.
    expect(trailing6moRange(d('2026-08-23'))).toEqual({ s: '2026-02-01', e: '2026-07-31' });
  });
  it('correctly rolls the year back when the window crosses January', () => {
    // Today = Feb 10, 2026 -> last full month Jan 2026; 6 months back from Jan = Aug 2025.
    expect(trailing6moRange(d('2026-02-10'))).toEqual({ s: '2025-08-01', e: '2026-01-31' });
  });
});

describe('districtOpportunity — wiring', () => {
  // Real DEFAULT_TARGETS store so laborPctTarget/fobPctTarget actually resolve (unlike a
  // fictitious loc, which would leave both null and silently floor every pillar at $0 --
  // that would test nothing about the wiring itself).
  const LOC = '3708'; // tCrewLabor:0.21, tFOBTarget:0.0385 (constants.js)
  const ds = {
    laborRows: [
      { loc: LOC, date: d('2026-06-01'), sales: 10000, gc: 1000, laborPct: 0.26 }, // 5pp over target
      { loc: LOC, date: d('2026-06-02'), sales: 10000, gc: 1000, laborPct: 0.26 },
    ],
  };
  const fobRows = [{ loc: LOC, date: '2026-06-01', prodSalesAmt: 20000, compWasteAmt: 1770 }]; // 8.85% vs 3.85% target
  const range = { s: '2026-06-01', e: '2026-06-02' };

  it('returns a district total that is the sum of the pillar totals, and ranks stores by it', () => {
    const result = districtOpportunity(ds, fobRows, [LOC], range);
    expect(result.district.total$).toBeCloseTo(result.district.labor$ + result.district.food$ + result.district.gc$, 6);
    expect(result.district.labor$).toBeGreaterThan(0); // 0.26 actual vs 0.21 target, over
    expect(result.ranked[0].loc).toBe(LOC);
    expect(result.ranked[0].total$).toBe(result.perStore[0].total$);
  });

  it('is in target mode by default (each store vs its OWN target, not a shared BIC rate)', () => {
    const result = districtOpportunity(ds, fobRows, [LOC], range);
    expect(result.mode).toBe('target');
  });

  it('carries the resolved range through on the result', () => {
    const result = districtOpportunity(ds, fobRows, [LOC], range);
    expect(result.range).toEqual(range);
  });

  it('ranks multiple stores biggest-$ first', () => {
    const dsTwo = {
      laborRows: [
        { loc: '3708', date: d('2026-06-01'), sales: 10000, gc: 1000, laborPct: 0.26 }, // over target
        { loc: '5183', date: d('2026-06-01'), sales: 10000, gc: 1000, laborPct: 0.10 }, // under target (5183's own tCrewLabor)
      ],
    };
    const result = districtOpportunity(dsTwo, [], ['3708', '5183'], { s: '2026-06-01', e: '2026-06-01' });
    expect(result.ranked[0].loc).toBe('3708'); // the store actually over target ranks first
  });
});

describe('annualizedFromSixMo', () => {
  it('doubles a 6-month total for a $/year figure', () => {
    expect(annualizedFromSixMo(50000)).toBe(100000);
    expect(annualizedFromSixMo(null)).toBe(0);
  });
});
