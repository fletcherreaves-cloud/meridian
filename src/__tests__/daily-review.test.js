// @ts-nocheck
// Notes 75 (2026-11-12 night) — the GM Daily Review engine. Mocks metric-source.js/vs-ly.js
// (both already have their own full test suites covering real row-sourcing) so these tests
// isolate THIS module's own logic: status thresholds, severity rollup, the sumMs composition
// for Refund/Empl+Mgr Meal, the deliberate Paper Cost gap, vs-LY wiring, and the daypart
// breakdown's best/worst-daypart detection.
import { describe, it, expect, vi } from 'vitest';

const metricDailyMock = vi.fn();
const metricDirectionMock = vi.fn();
const autoFirstDailyMock = vi.fn();

vi.mock('../engine/metric-source.js', () => ({
  metricDaily: (...a) => metricDailyMock(...a),
  metricDirection: (...a) => metricDirectionMock(...a),
}));
vi.mock('../engine/vs-ly.js', () => ({
  autoFirstDaily: (...a) => autoFirstDailyMock(...a),
}));

const { buildDailyReview, buildServiceDaypartBreakdown } = await import('../engine/daily-review.js');

const LOC = '10422';
const DATE = new Date(2026, 10, 11); // 2026-11-11

function baseStubs({ labor = 0.22, tpph = 5.4, oepe = 120, park = 0.12, cashRefAmt = 10, cashlessRefAmt = 5,
                      empMealAmt = 8, mgrMealAmt = 4, compWaste = 0.002, paperCost = null } = {}) {
  metricDirectionMock.mockImplementation(key => ({
    laborPct: 'lower', tpph: 'higher', oepe: 'lower', r2p: 'lower', kvst: 'lower',
    kvsHealthy: 'higher', posOverPct: 'lower', promoPct: 'lower', tRedAPct: 'lower',
    tRedBPct: 'lower', compWaste: 'lower', rawWaste: 'lower', condiment: 'lower',
    empMeal: 'lower', statVar: 'lower', unexplained: 'lower', discPct: 'lower',
    fobPct: 'lower', cashOSAmt: 'lower',
  }[key] ?? null));
  metricDailyMock.mockImplementation((ds, loc, date, key) => ({
    laborPct: labor, tpph, oepe, park, r2p: 85, kvst: 40, kvsHealthy: 0.95,
    cashRefAmt, cashlessRefAmt, empMealAmt, mgrMealAmt, compWaste, rawWaste: 0.003,
    condiment: 0.02, empMeal: 0.002, statVar: 0.01, unexplained: 0, discPct: 0.013,
    fobPct: 0.038, cashOSAmt: -10, promoPct: 0.03, tRedAPct: 0.002, tRedBPct: 0.04,
    posOverPct: 0.003, actHrs: 180, otHrs: 4, actVsSched: 2, actVsNeed: -1,
    dtMixPct: 0.45, bfMixPct: 0.12, mopMixPct: 0.05, kioskMixPct: 0.03, delivMixPct: 0.02,
    paperCost,
  }[key] ?? null));
  autoFirstDailyMock.mockImplementation((ds, loc, range, kind) => {
    const dk = '2026-11-11';
    return kind === 'gc'
      ? { curByDate: { [dk]: 300 }, lyByDate: { [dk]: 280 } }
      : { curByDate: { [dk]: 11000 }, lyByDate: { [dk]: 10000 } };
  });
}

const TARGETS = {
  tLabor: 0.21, tTpph: 5.6, tOepe: 125, tPark: 0.14, tR2p: 90, tKvst: 45, tKvsu: 0.9,
  tCompWaste: 0.002, tRawWaste: 0.004, tCondiment: 0.019, tEmpFood: 0.003, tStatLoss: 0.012,
  tUnex: 0, tDiscCoupPct: 0.013, tFOBTarget: 0.04, tPaperCost: 0.035, tCashOSAmt: -5,
  tPromoPct: 0.03, tRedAPct: 0.0033, tRedBPct: 0.057, tPosOverPct: 0.004, tRefundAmt: 15,
};

describe('buildDailyReview()', () => {
  it('builds all 5 sections with real lines', () => {
    baseStubs();
    const review = buildDailyReview({ loaded: true }, LOC, DATE, TARGETS);
    expect(review.loc).toBe(LOC);
    expect(review.date).toBe('2026-11-11');
    expect(review.sections.map(s => s.key)).toEqual(['sales', 'service', 'labor', 'cash', 'fob']);
  });

  it('Sales: wires Product Sales/GC through autoFirstDaily, not metricDaily directly', () => {
    baseStubs();
    const review = buildDailyReview({ loaded: true }, LOC, DATE, TARGETS);
    const sales = review.sections.find(s => s.key === 'sales');
    const prodSales = sales.lines.find(l => l.key === 'prodSales');
    const gc = sales.lines.find(l => l.key === 'gc');
    expect(prodSales.actual).toBe(11000);
    expect(prodSales.ly).toBe(10000);
    expect(prodSales.vsLYPct).toBeCloseTo(0.1, 5);
    expect(gc.actual).toBe(300);
    expect(gc.vsLYPct).toBeCloseTo((300 - 280) / 280, 5);
  });

  it('status: within target = good, within 10% band = watch, worse = bad', () => {
    baseStubs({ labor: 0.21, oepe: 130 }); // labor exactly at target (good); oepe 130 vs 125 target, lower-better, 4% over = watch
    const review = buildDailyReview({ loaded: true }, LOC, DATE, TARGETS);
    const labor = review.sections.find(s => s.key === 'labor').lines.find(l => l.key === 'laborPct');
    expect(labor.status).toBe('good');
    const oepe = review.sections.find(s => s.key === 'service').lines.find(l => l.key === 'oepe');
    expect(oepe.status).toBe('watch');
  });

  it('status: far outside the watch band is bad', () => {
    baseStubs({ oepe: 200 }); // 60% over a 125 target
    const review = buildDailyReview({ loaded: true }, LOC, DATE, TARGETS);
    const oepe = review.sections.find(s => s.key === 'service').lines.find(l => l.key === 'oepe');
    expect(oepe.status).toBe('bad');
  });

  it('park uses an explicit lower-is-better override (metric-source.js carries no direction for it)', () => {
    baseStubs({ park: 0.30 }); // way over tPark:0.14
    const review = buildDailyReview({ loaded: true }, LOC, DATE, TARGETS);
    const park = review.sections.find(s => s.key === 'service').lines.find(l => l.key === 'park');
    expect(park.status).toBe('bad'); // would wrongly read 'good' if direction defaulted to higher-is-better
  });

  it('Refund sums cashRefAmt + cashlessRefAmt (no single combined metric-source key exists)', () => {
    baseStubs({ cashRefAmt: 10, cashlessRefAmt: 5 });
    const review = buildDailyReview({ loaded: true }, LOC, DATE, TARGETS);
    const refund = review.sections.find(s => s.key === 'cash').lines.find(l => l.key === 'refundAmt');
    expect(refund.actual).toBe(15);
    expect(refund.status).toBe('good'); // exactly at tRefundAmt:15
  });

  it('Empl/Mgr Meal sums empMealAmt + mgrMealAmt, informational (no target)', () => {
    baseStubs({ empMealAmt: 8, mgrMealAmt: 4 });
    const review = buildDailyReview({ loaded: true }, LOC, DATE, TARGETS);
    const meal = review.sections.find(s => s.key === 'cash').lines.find(l => l.key === 'emplMgrMeal');
    expect(meal.actual).toBe(12);
    expect(meal.status).toBeNull();
  });

  it('Paper Cost %: target-only gap stays visible (actual null, target present) rather than being dropped', () => {
    baseStubs({ paperCost: null });
    const review = buildDailyReview({ loaded: true }, LOC, DATE, TARGETS);
    const paper = review.sections.find(s => s.key === 'fob').lines.find(l => l.key === 'paperCost');
    expect(paper.actual).toBeNull();
    expect(paper.target).toBe(0.035);
    expect(paper.status).toBeNull(); // no actual -> no verdict, not a false pass/fail
  });

  it('section severity is the worst line status in that section', () => {
    baseStubs({ labor: 0.21, tpph: 5.6, oepe: 200 }); // labor+tpph both good, oepe bad -> service section is bad
    const review = buildDailyReview({ loaded: true }, LOC, DATE, TARGETS);
    expect(review.sections.find(s => s.key === 'labor').severity).toBe('good');
    expect(review.sections.find(s => s.key === 'service').severity).toBe('bad');
  });

  it('a section with no targeted lines (e.g. Sales, all informational/vsLY) has null severity', () => {
    baseStubs();
    const review = buildDailyReview({ loaded: true }, LOC, DATE, TARGETS);
    expect(review.sections.find(s => s.key === 'sales').severity).toBeNull();
  });
});

describe('buildServiceDaypartBreakdown()', () => {
  function row(loc, dt, hour_slot, fields) {
    return { loc, dt, hour_slot, ...fields };
  }

  it('finds the real worst/best daypart for OEPE from raw hourly rows', () => {
    const rows = [
      // Breakfast hours run fast (avg 100s = 1000us/10cnt); Dinner hours run slow (avg 300s =
      // 3000us/10cnt) — real DAYPART_SLOTS boundaries (Breakfast 6-11, Dinner 18-23).
      row(LOC, '2026-11-11', '06:00', { dt_untilserve: 1000, dt_trans_cnt: 10 }),
      row(LOC, '2026-11-11', '07:00', { dt_untilserve: 1000, dt_trans_cnt: 10 }),
      row(LOC, '2026-11-11', '18:00', { dt_untilserve: 3000, dt_trans_cnt: 10 }),
      row(LOC, '2026-11-11', '19:00', { dt_untilserve: 3000, dt_trans_cnt: 10 }),
      // A different store's rows must be excluded.
      row('99999', '2026-11-11', '18:00', { dt_untilserve: 10, dt_trans_cnt: 10 }),
      // A different date's rows must be excluded.
      row(LOC, '2026-11-10', '18:00', { dt_untilserve: 10, dt_trans_cnt: 10 }),
    ];
    const result = buildServiceDaypartBreakdown(rows, LOC, new Date(2026, 10, 11));
    const oepe = result.find(r => r.key === 'oepe');
    expect(oepe).toBeTruthy();
    expect(oepe.best.avgSec).toBe(100);
    expect(oepe.worst.avgSec).toBe(300);
    expect(oepe.worst.label).not.toBe(oepe.best.label);
  });

  it('excludes a metric with no matching rows entirely, rather than returning an empty-but-present entry', () => {
    const rows = [row(LOC, '2026-11-11', '06:00', { dt_untilserve: 100, dt_trans_cnt: 10 })];
    const result = buildServiceDaypartBreakdown(rows, LOC, new Date(2026, 10, 11));
    expect(result.find(r => r.key === 'r2p')).toBeUndefined();
    expect(result.find(r => r.key === 'kvst')).toBeUndefined();
  });

  // Dispatch 2026-11-14 (task #152) -- DAYPART_FIELDS.r2p/.kvst previously named fields that
  // don't exist on qsr_daily_activity at all ('fc_untilcloseddrawer' two-d typo; bare
  // 'mfy_time'/'mfy_trans_cnt' with no side suffix), so every call silently produced ZERO
  // dayparts for both -- indistinguishable from the "no matching rows" case the test above
  // covers, which is exactly how this went unnoticed. These rows carry the REAL column names
  // (fc_untilclosedrawer, mfy1_*/mfy2_*) and assert a real, non-empty, correctly-summed result,
  // closing the gap the other test's mock-shaped fixtures couldn't catch.
  it('computes real R2P and KVS dayparts from their actual qsr_daily_activity field names', () => {
    const rows = [
      row(LOC, '2026-11-11', '06:00', {
        fc_untilserve: 5000, fc_untilclosedrawer: 2000, fc_trans_cnt: 10, // R2P = (5000-2000)/10 = 300
        mfy1_untilserve: 1000, mfy1_trans_cnt: 5, mfy2_untilserve: 1000, mfy2_trans_cnt: 5, // KVS = 2000/10 = 200
      }),
    ];
    const result = buildServiceDaypartBreakdown(rows, LOC, new Date(2026, 10, 11));
    const r2p = result.find(r => r.key === 'r2p');
    const kvst = result.find(r => r.key === 'kvst');
    expect(r2p).toBeTruthy();
    expect(r2p.dayparts[0].avgSec).toBe(300);
    expect(kvst).toBeTruthy();
    expect(kvst.dayparts[0].avgSec).toBe(200);
  });
});
