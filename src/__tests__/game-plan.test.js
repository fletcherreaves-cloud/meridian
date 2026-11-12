// @ts-nocheck
// Game Plan engine (owner request 2026-11-07) -- computeGamePlanWeek()/gamePlanActions().
import { describe, it, expect } from 'vitest';
import { computeGamePlanWeek, gamePlanActions, WIN_VS_LY_FLOOR_PCT } from '../engine/game-plan.js';
import { lastClosedBusinessDay } from '../utils/date.js';

const LOC = '3708';

function rowsFor(days) {
  // days: [{offsetFromLastClosed, sales, projSales, lySales}]
  const lastClosed = lastClosedBusinessDay(new Date('2026-11-07T15:00:00'));
  return days.map(d => {
    const dt = new Date(lastClosed);
    dt.setDate(dt.getDate() + d.offset);
    return { loc: LOC, date: dt, sales: d.sales, projSales: d.projSales, lySales: d.lySales };
  });
}

describe('computeGamePlanWeek', () => {
  it('builds one bar per day actually covered by the auto-first sales series, pct = sales/plan*100', () => {
    const qsrActSummaryRows = rowsFor([
      { offset: -6, sales: 9000,  projSales: 10000, lySales: 8500 },
      { offset: -5, sales: 11000, projSales: 10000, lySales: 9500 },
      { offset: 0,  sales: 10500, projSales: 10000, lySales: 9800 },
    ]);
    const ds = { loaded: true, qsrActSummaryRows };
    const asOf = new Date('2026-11-07T15:00:00');
    const result = computeGamePlanWeek(ds, LOC, asOf);
    expect(result.bars.length).toBe(3);
    const pctByOffset = result.bars.map(b => Math.round(b.pct));
    expect(pctByOffset).toEqual([90, 110, 105]);
  });

  it('reports a real, clearly-positive vs-LY win (matched-day, same-row lySales)', () => {
    const qsrActSummaryRows = rowsFor([
      { offset: -1, sales: 10000, projSales: 10000, lySales: 9000 },
      { offset: 0,  sales: 10000, projSales: 10000, lySales: 9000 },
    ]);
    const ds = { loaded: true, qsrActSummaryRows };
    const result = computeGamePlanWeek(ds, LOC, new Date('2026-11-07T15:00:00'));
    expect(result.vsLYPct).toBeCloseTo(((20000 - 18000) / 18000) * 100, 5);
    expect(result.vsLYPct).toBeGreaterThanOrEqual(WIN_VS_LY_FLOOR_PCT);
    expect(result.isWin).toBe(true);
  });

  it('does NOT report a win on a flat or negative vs-LY week (never a forced celebration)', () => {
    const qsrActSummaryRows = rowsFor([
      { offset: 0, sales: 9000, projSales: 10000, lySales: 9200 },
    ]);
    const ds = { loaded: true, qsrActSummaryRows };
    const result = computeGamePlanWeek(ds, LOC, new Date('2026-11-07T15:00:00'));
    expect(result.isWin).toBe(false);
  });

  it('vsLYPct is null (not 0 or NaN) when there is no real LY data to compare against', () => {
    const qsrActSummaryRows = rowsFor([{ offset: 0, sales: 9000, projSales: 10000, lySales: null }]);
    const ds = { loaded: true, qsrActSummaryRows };
    const result = computeGamePlanWeek(ds, LOC, new Date('2026-11-07T15:00:00'));
    expect(result.vsLYPct).toBeNull();
    expect(result.isWin).toBe(false);
  });

  it('a day with sales but no plan gets a null pct, not a fabricated one', () => {
    const qsrActSummaryRows = rowsFor([{ offset: 0, sales: 9000, projSales: 0, lySales: null }]);
    const ds = { loaded: true, qsrActSummaryRows };
    const result = computeGamePlanWeek(ds, LOC, new Date('2026-11-07T15:00:00'));
    expect(result.bars[0].pct).toBeNull();
  });

  it('with zero rows for this store, returns an empty bars list and null rangeLabel rather than throwing', () => {
    const ds = { loaded: true, qsrActSummaryRows: [] };
    const result = computeGamePlanWeek(ds, LOC, new Date('2026-11-07T15:00:00'));
    expect(result.bars).toEqual([]);
    expect(result.rangeLabel).toBeNull();
    expect(result.isWin).toBe(false);
  });

  it('excludes the in-progress business day — the window ends at lastClosedBusinessDay, not "now"', () => {
    const lastClosed = lastClosedBusinessDay(new Date('2026-11-07T15:00:00'));
    const inProgress = new Date(lastClosed);
    inProgress.setDate(inProgress.getDate() + 1); // the still-open day
    const qsrActSummaryRows = [
      { loc: LOC, date: lastClosed, sales: 9000, projSales: 10000, lySales: 8000 },
      { loc: LOC, date: inProgress, sales: 4000, projSales: 10000, lySales: 3500 },
    ];
    const ds = { loaded: true, qsrActSummaryRows };
    const result = computeGamePlanWeek(ds, LOC, new Date('2026-11-07T15:00:00'));
    expect(result.bars.length).toBe(1);
    expect(result.bars[0].sales).toBe(9000);
  });
});

describe('gamePlanActions', () => {
  it('returns the top 3 items, in whatever order buildCuratedHomeItems already ranked them', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    expect(gamePlanActions(items).map(i => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('never pads with invented items when fewer than 3 real ones exist', () => {
    expect(gamePlanActions([{ id: 'a' }]).length).toBe(1);
    expect(gamePlanActions([]).length).toBe(0);
    expect(gamePlanActions(null).length).toBe(0);
  });
});

describe('computeGamePlanWeek — rolling-lookback fallback (owner feedback 2026-11-11)', () => {
  it('with real sales outside the trailing week but none inside it, falls back to a wider rollup instead of a blank week', () => {
    const qsrActSummaryRows = rowsFor([
      { offset: -20, sales: 9000, projSales: 10000, lySales: 8000 },
      { offset: -15, sales: 11000, projSales: 10000, lySales: 9000 },
    ]);
    const ds = { loaded: true, qsrActSummaryRows };
    const result = computeGamePlanWeek(ds, LOC, new Date('2026-11-07T15:00:00'));
    expect(result.bars).toEqual([]);
    expect(result.fallback).not.toBeNull();
    expect(result.fallback.days).toBe(2);
    expect(result.fallback.totalSales).toBe(20000);
    expect(result.fallback.pct).toBeCloseTo(100, 5);
  });

  it('with truly zero sales on file anywhere, fallback stays null (the plain empty state is the honest one)', () => {
    const ds = { loaded: true, qsrActSummaryRows: [] };
    const result = computeGamePlanWeek(ds, LOC, new Date('2026-11-07T15:00:00'));
    expect(result.bars).toEqual([]);
    expect(result.fallback).toBeNull();
  });

  it('fallback pct is null when there is no plan data to compare against, never a fabricated percentage', () => {
    const qsrActSummaryRows = rowsFor([{ offset: -20, sales: 9000, projSales: 0, lySales: null }]);
    const ds = { loaded: true, qsrActSummaryRows };
    const result = computeGamePlanWeek(ds, LOC, new Date('2026-11-07T15:00:00'));
    expect(result.fallback).not.toBeNull();
    expect(result.fallback.pct).toBeNull();
  });
});
