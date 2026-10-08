// @ts-nocheck
// Tracking to Plan (home-screen widgets, owner-requested 2026-10-08: hourly/daily/weekly/
// monthly/YTD). intradayPace is a verbatim extraction of signals.js's LiveOps `planPace` memo
// (CLAUDE.md: "diff the two computations" rule, applied before a duplicate could drift) --
// these tests pin its existing behavior. periodPace is new: weekly/monthly/YTD derived from
// each store's own official monthly $ target via a flat run-rate, since no separately-uploaded
// weekly/YTD budget exists anywhere in Meridian's data model.
import { describe, it, expect } from 'vitest';
import { intradayPace, periodPace } from '../engine/tracking-to-plan.js';

describe('intradayPace', () => {
  it('computes $ and GC pace from completed hours, and projects EOD from the remaining hours', () => {
    const rows = [
      { product_sales: 100, proj_sales_dollars: 120, transactions: 10, proj_total_transactions: 12 },
      { product_sales: 0, proj_sales_dollars: 80, transactions: 0, proj_total_transactions: 8 },
    ];
    const r = intradayPace(rows);
    expect(r.doneActual).toBe(100);
    expect(r.fullProj).toBe(200);
    expect(r.pacePct).toBeCloseTo(100 / 120 * 100, 5);
    expect(r.projectedEOD).toBe(100 + 80); // actual so far + remaining hour's projection
    expect(r.hasGC).toBe(true);
    expect(r.gcPacePct).toBeCloseTo(10 / 12 * 100, 5);
  });

  it('returns null when the day has no projection at all (regression guard)', () => {
    expect(intradayPace([])).toBeNull();
    expect(intradayPace([{ product_sales: 0, proj_sales_dollars: 0 }])).toBeNull();
  });

  it('degrades to $-only pace when GC projections are absent (narrower select, e.g. shared darRows)', () => {
    const rows = [{ product_sales: 50, proj_sales_dollars: 100 }];
    const r = intradayPace(rows);
    expect(r.pacePct).toBeCloseTo(50, 5);
    expect(r.hasGC).toBe(false);
    expect(r.gcPacePct).toBeNull();
  });
});

describe('periodPace', () => {
  const LOC = '3708'; // real DEFAULT_TARGETS store, tProdSales:111513.16

  it('derives weekly/monthly plan-to-date as a flat run-rate off the monthly target, with no actual sales loaded', () => {
    const today = new Date(2026, 9, 8); // Oct 8 2026, 31-day month, 8 days elapsed
    const r = periodPace({}, [LOC], { today });
    const dailyRate = 111513.16 / 31;
    expect(r.monthly.fullMonthTarget).toBeCloseTo(111513.16, 2);
    expect(r.monthly.plan).toBeCloseTo(dailyRate * 8, 2);
    expect(r.weekly.plan).toBeCloseTo(dailyRate * 7, 2);
    expect(r.monthly.actual).toBe(0);
    expect(r.monthly.pacePct).toBe(0);
  });

  it('sums actual sales from the real auto-first sales rows into weekly/monthly/YTD actual', () => {
    const today = new Date(2026, 9, 8);
    const ds = {
      qsrActSummaryRows: [
        { loc: LOC, date: new Date(2026, 9, 5), sales: 5000 },  // within trailing 7 days AND this month
        { loc: LOC, date: new Date(2026, 9, 8), sales: 4000 },  // today
        { loc: LOC, date: new Date(2026, 0, 15), sales: 3000 }, // January -- counts toward YTD only
      ],
    };
    const r = periodPace(ds, [LOC], { today });
    expect(r.weekly.actual).toBe(9000);
    expect(r.monthly.actual).toBe(9000);
    expect(r.ytd.actual).toBe(12000);
    // YTD target = 9 full months (Jan-Sep) + October's elapsed-day share
    const dailyRate = 111513.16 / 31;
    expect(r.ytd.plan).toBeCloseTo(111513.16 * 9 + dailyRate * 8, 1);
  });

  it('sums district-wide across multiple stores rather than averaging (dollar-weighted, never averaged)', () => {
    const today = new Date(2026, 9, 8);
    const ds = { qsrActSummaryRows: [
      { loc: '3708', date: new Date(2026, 9, 8), sales: 1000 },
      { loc: '5183', date: new Date(2026, 9, 8), sales: 2000 },
    ] };
    const r = periodPace(ds, ['3708', '5183'], { today });
    expect(r.monthly.actual).toBe(3000);
    // target is the SUM of both stores' monthly targets, not an average
    const dailyRate = (111513.16 + 162267.33) / 31;
    expect(r.monthly.plan).toBeCloseTo(dailyRate * 8, 1);
  });

  it('names the derivation method explicitly, so a UI consumer never mistakes it for an uploaded budget', () => {
    const r = periodPace({}, ['3708'], { today: new Date(2026, 9, 8) });
    expect(r.method).toMatch(/derived/i);
    expect(r.method).toMatch(/no separately-uploaded/i);
  });
});
