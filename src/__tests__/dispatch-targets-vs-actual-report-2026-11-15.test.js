// @vitest-environment happy-dom
// @ts-nocheck
// Owner request (2026-11-15): "a new report that focuses solely on the monthly targets and
// daily targets (separate tabs) that shows clearly what the current target is vs the actual
// results. For the date picker, seed it with 7,14,21 & 28 day options plus MTD please."
//
// Engine tests use the REAL fixture shape proven by fob-reference-table-panel.test.js (same
// 30-day September data for store 3708) so the FOB-leg delta-reconstruction math is exercised
// exactly the same way that already-shipped report exercises it, not a re-derived shortcut.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DEFAULT_TARGETS } from '../constants.js';
import { resolveDatePreset, MTD_PRESET, DATE_RANGE_PRESETS } from '../components/PanelControls.js';
import {
  effectiveMonthlyTarget, effectiveYearlyTarget, targetStatus, computeTargetsVsActual, monthEndPace,
  MONTHLY_TARGET_METRICS, DAILY_TARGET_METRICS, YEARLY_TARGET_METRICS, _blendedMonthlyTarget,
} from '../engine/targets-vs-actual.js';
import { resolveMetricForRange } from '../engine/fob-reference.js';
import { TargetsVsActualReportPanel } from '../views/targets-vs-actual-report.js';

vi.mock('../utils/print-html.js', () => ({ printHtml: vi.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '3708';
const STORES = [{ loc: LOC }];

function buildDs() {
  const qsrFobRows = [];
  const laborRows = [];
  const opsLaborRows = [];
  const ebosRows = [];
  for (let day = 1; day <= 30; day++) {
    const iso = `2026-09-${String(day).padStart(2, '0')}`;
    qsrFobRows.push({
      loc: '0003708', date: iso, prodSalesAmt: 10000 * day, compWasteAmt: 150 * day,
      rawWasteAmt: 100 * day, condimentsAmt: 80 * day, empMgrMealsAmt: 40 * day,
      statVarianceAmt: 60 * day, unexplainedAmt: 10 * day, discountCouponsAmt: 120 * day,
      totalBaseFood: 4000 * day, pnlFoodCostPurchases: 2800 * day, pnlPaperCostPurchases: 350 * day,
    });
    const d = new Date(iso + 'T00:00:00');
    laborRows.push({ loc: LOC, date: d, sales: 10000, gc: 1000, tpph: 5.5 });
    opsLaborRows.push({ loc: LOC, date: d, laborDollar: 2100 });
    ebosRows.push({ loc: LOC, date: d, opsPurchases: 80 });
  }
  return { qsrFobRows, laborRows, opsLaborRows, ebosRows, storeIds: [LOC], allMonthlyTargets: {} };
}

const RANGE = { s: '2026-09-01', e: '2026-09-30' };

describe('PanelControls: MTD preset', () => {
  it('resolves to [1st of the month, last closed business day]', () => {
    // Noon on the 15th: the business day doesn't close until 4am the 16th, so the last
    // CLOSED business day is still the 14th — same ABC-cutover rule every other preset here
    // already follows (lastClosedBusinessDay(), CLAUDE.md's "signature #4").
    const r = resolveDatePreset('mtd', [MTD_PRESET], new Date('2026-09-15T12:00:00'));
    expect(r.s).toBe('2026-09-01');
    expect(r.e).toBe('2026-09-14');
  });

  it('is additive — the shared DATE_RANGE_PRESETS list is untouched', () => {
    expect(DATE_RANGE_PRESETS.find(p => p.id === 'mtd')).toBeUndefined();
  });
});

describe('monthEndPace()', () => {
  it('projects the month-end total as actual / fraction-of-month-elapsed', () => {
    // 5 of September's 30 days elapsed -- same run-rate math as the live Projection Workspace's
    // Actuals-vs-Target pace table (analytics.js's CurrentMonthPaceSection).
    expect(monthEndPace(50000, '2026-09-05', '2026-9')).toBe(300000);
  });
  it('a full-month window (frac=1) paces to exactly the actual', () => {
    expect(monthEndPace(300000, '2026-09-30', '2026-9')).toBe(300000);
  });
  it('returns null when the range end falls outside the target month — nothing to project', () => {
    expect(monthEndPace(50000, '2026-10-01', '2026-9')).toBeNull(); // next month over
    expect(monthEndPace(50000, '2026-08-31', '2026-9')).toBeNull(); // prior month
  });
  it('returns null on any missing input rather than guessing', () => {
    expect(monthEndPace(null, '2026-09-05', '2026-9')).toBeNull();
    expect(monthEndPace(50000, null, '2026-9')).toBeNull();
    expect(monthEndPace(50000, '2026-09-05', null)).toBeNull();
  });
});

describe('targetStatus()', () => {
  it('a store beating its target (lower-is-better) is ok even if not exact', () => {
    expect(targetStatus(0.21, 0.19, 'lower')).toBe('ok');
  });
  it('a small miss within ~10% relative is watch', () => {
    expect(targetStatus(5.6, 5.5, 'higher')).toBe('watch'); // 1.8% short
  });
  it('a large miss is a miss', () => {
    expect(targetStatus(0.04, 0.40, 'lower')).toBe('miss'); // 10x over target
  });
  it('a near-zero target (e.g. tUnex: 0.0) uses an absolute, not relative, threshold', () => {
    expect(targetStatus(0, 0.005, 'lower')).toBe('watch');
    expect(targetStatus(0, 0.05, 'lower')).toBe('miss');
  });
  it('missing target or actual is none', () => {
    expect(targetStatus(null, 5, 'higher')).toBe('none');
    expect(targetStatus(5, null, 'higher')).toBe('none');
  });
});

describe('effectiveMonthlyTarget()', () => {
  it('falls back to DEFAULT_TARGETS when no monthly override exists', () => {
    const t = effectiveMonthlyTarget(LOC, '2026-9', {});
    expect(t.tProdSales).toBe(DEFAULT_TARGETS[LOC].tProdSales);
  });
  it('a real monthly override wins field-by-field over DEFAULT_TARGETS', () => {
    const t = effectiveMonthlyTarget(LOC, '2026-9', { '2026-9': { [LOC]: { tProdSales: 999999 } } });
    expect(t.tProdSales).toBe(999999);
    expect(t.tCrewLabor).toBe(DEFAULT_TARGETS[LOC].tCrewLabor); // untouched field still falls back
  });
});

describe('computeTargetsVsActual() — monthly tab', () => {
  it('computes real target-vs-actual rows reusing fob-reference.js\'s own proven resolvers', () => {
    const rows = computeTargetsVsActual(buildDs(), [LOC], { which: 'monthly', range: RANGE, allMonthlyTargets: {}, targetMonthYm: '2026-9' });
    expect(rows).toHaveLength(1);
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));

    expect(byKey.salesAmt.actual).toBe(300000); // 30 days * $10,000
    expect(byKey.salesAmt.target).toBe(DEFAULT_TARGETS[LOC].tProdSales);

    // Σ laborDollar (2100*30) / Σ sales (10000*30) = 0.21 exactly — matches tCrewLabor (0.21)
    // exactly, so this metric is a clean 'ok'.
    expect(byKey.crewLaborPct.actual).toBeCloseTo(0.21, 6);
    expect(byKey.crewLaborPct.status).toBe('ok');

    expect(byKey.tpph.actual).toBeCloseTo(5.5, 6);
    expect(byKey.tpph.target).toBe(5.6);
    expect(byKey.tpph.status).toBe('watch');

    // Same FOB fixture fob-reference-table-panel.test.js already proves resolves compWaste to
    // exactly 1.50% in every window (150/10000) — baseFoodPct here is 4000/10000 = 40%, badly
    // over the 4% target.
    expect(byKey.baseFoodPct.actual).toBeCloseTo(0.40, 6);
    expect(byKey.baseFoodPct.target).toBe(0.04);
    expect(byKey.baseFoodPct.status).toBe('miss');
  });

  it('every MONTHLY_TARGET_METRICS entry\'s targetField is a real DEFAULT_TARGETS field', () => {
    for (const m of MONTHLY_TARGET_METRICS) {
      expect(DEFAULT_TARGETS[LOC][m.targetField]).not.toBeUndefined();
    }
  });

  // Owner follow-up (2026-11-15), same day: "for the sales target can you come up with a way to
  // pace it based on what the actual is MTD vs projected." Only 5 of September's 30 days are in
  // the window -- MTD actual (5*$10,000=$50,000) is well under the $111,513.16 target, which
  // would read as a 'miss' on a flat actual-vs-target grade even though the store's real run
  // rate ($300,000/mo, same as the full-month fixture resolves to) clears the target comfortably.
  it('salesAmt grades against the month-end pace, not the raw partial-month actual', () => {
    const partial = { s: '2026-09-01', e: '2026-09-05' };
    const rows = computeTargetsVsActual(buildDs(), [LOC], { which: 'monthly', range: partial, allMonthlyTargets: {}, targetMonthYm: '2026-9' });
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
    expect(byKey.salesAmt.actual).toBe(50000); // the honest, unpaced MTD number is still exposed
    expect(byKey.salesAmt.pace).toBe(300000); // 50000 / (5/30)
    expect(byKey.salesAmt.diff).toBeCloseTo(300000 - DEFAULT_TARGETS[LOC].tProdSales, 2); // diff is pace-based
    expect(byKey.salesAmt.status).toBe('ok'); // pace clears target even though the raw actual alone would not
  });

  it('a metric not marked `paced` is never pace-graded, even on the same partial-month window', () => {
    const partial = { s: '2026-09-01', e: '2026-09-05' };
    const rows = computeTargetsVsActual(buildDs(), [LOC], { which: 'monthly', range: partial, allMonthlyTargets: {}, targetMonthYm: '2026-9' });
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
    expect(byKey.crewLaborPct.pace).toBeNull();
    expect(byKey.crewLaborPct.diff).toBeCloseTo(byKey.crewLaborPct.actual - byKey.crewLaborPct.target, 6);
  });

  // Owner follow-up (2026-11-15): "can we wire in the Food cost items on monthly" — the one
  // Food Cost field DEFAULT_TARGETS/monthly_targets carries that wasn't already in
  // MONTHLY_TARGET_METRICS was tFOBBonusBase (Bonus Food Threshold). It's not a separate
  // measured actual — analytics.js's own Monthly Projections workbook grid (PROJ_FIELDS) shows
  // it sitting right after tFOBTotal in the same Food Cost group with no actual column of its
  // own — so it reuses the exact same Total Food Cost % actual as tFOBTotal.
  it('fobBonusBase reuses the same real Total Food Cost % actual as fobTotal (two targets, one actual)', () => {
    const rows = computeTargetsVsActual(buildDs(), [LOC], { which: 'monthly', range: RANGE, allMonthlyTargets: {}, targetMonthYm: '2026-9' });
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
    expect(byKey.fobBonusBase).toBeDefined();
    expect(byKey.fobBonusBase.target).toBe(DEFAULT_TARGETS[LOC].tFOBBonusBase);
    expect(byKey.fobBonusBase.actual).toBe(byKey.totalFoodCostPct.actual);
  });
});

// Owner follow-up (2026-11-15): "Would like suggestions when 7, 14, 21 & 28 day cross months as
// to how to handle targets... smartly determine, through math, what the aggregated target would
// be while making it clear targets are blended across multiple periods." A 7-day window of
// Sep 28 - Oct 4 spans 3 days in September (30-day month) + 4 days in October (31-day month).
describe('_blendedMonthlyTarget() — cross-month target blending (owner follow-up, 2026-11-15)', () => {
  const CROSS_RANGE = { s: '2026-09-28', e: '2026-10-04' };
  const salesDef = MONTHLY_TARGET_METRICS.find(m => m.key === 'salesAmt');
  const laborDef = MONTHLY_TARGET_METRICS.find(m => m.key === 'crewLaborPct');
  const allMonthlyTargets = {
    '2026-9':  { [LOC]: { tProdSales: 300000, tCrewLabor: 0.21 } },
    '2026-10': { [LOC]: { tProdSales: 310000, tCrewLabor: 0.23 } },
  };

  it('a single-month window is unaffected — blend is null, value is the plain monthly target', () => {
    const r = _blendedMonthlyTarget(salesDef, RANGE, allMonthlyTargets, LOC); // RANGE = all of September
    expect(r.blend).toBeNull();
    expect(r.value).toBe(300000);
  });

  it('a dollar target (Sales $) is day-prorated per month then SUMMED across the window', () => {
    // Sep: 300000 * (3/30) = 30000. Oct: 310000 * (4/31) = 40000. Total = 70000.
    const r = _blendedMonthlyTarget(salesDef, CROSS_RANGE, allMonthlyTargets, LOC);
    expect(r.value).toBeCloseTo(70000, 6);
    expect(r.blend).toEqual([
      { ym: '2026-9', days: 3, missing: false },
      { ym: '2026-10', days: 4, missing: false },
    ]);
  });

  it('a rate/pct target (Crew Labor %) is day-weighted AVERAGED across the window, never a flat average of the two months', () => {
    // (0.21*3 + 0.23*4) / 7 = 1.55/7
    const r = _blendedMonthlyTarget(laborDef, CROSS_RANGE, allMonthlyTargets, LOC);
    expect(r.value).toBeCloseTo(1.55 / 7, 10);
    // Proves it's NOT a naive (0.21+0.23)/2 = 0.22 flat average -- the day-weighted real answer
    // skews toward October (4 of 7 days), which a flat average would miss entirely.
    expect(r.value).not.toBeCloseTo(0.22, 4);
  });

  it('one month missing a target is excluded from the blend (not treated as 0) and flagged `missing`', () => {
    // An unknown loc with no DEFAULT_TARGETS entry and an override for October only -- September
    // resolves to {} (no DEFAULT_TARGETS fallback for this loc), so tProdSales is genuinely absent.
    const FAKE_LOC = '99999';
    const partial = { '2026-10': { [FAKE_LOC]: { tProdSales: 310000 } } };
    const r = _blendedMonthlyTarget(salesDef, CROSS_RANGE, partial, FAKE_LOC);
    expect(r.value).toBeCloseTo(310000 * (4 / 31), 6); // October's own prorated share only
    expect(r.blend).toEqual([
      { ym: '2026-9', days: 3, missing: true },
      { ym: '2026-10', days: 4, missing: false },
    ]);
  });

  it('both months missing a target resolves to null, same as the existing no-target case', () => {
    const FAKE_LOC = '99999';
    const r = _blendedMonthlyTarget(salesDef, CROSS_RANGE, {}, FAKE_LOC);
    expect(r.value).toBeNull();
    expect(r.blend).toBeNull();
  });

  it('computeTargetsVsActual() wires the blend through end-to-end for the monthly tab', () => {
    const rows = computeTargetsVsActual(buildDs(), [LOC], {
      which: 'monthly', range: CROSS_RANGE, allMonthlyTargets, targetMonthYm: '2026-10',
    });
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
    expect(byKey.salesAmt.target).toBeCloseTo(70000, 6);
    expect(byKey.salesAmt.blend).toHaveLength(2);
    expect(byKey.crewLaborPct.target).toBeCloseTo(1.55 / 7, 10);
  });
});

describe('YEARLY_TARGET_METRICS / effectiveYearlyTarget() / computeTargetsVsActual() — yearly tab', () => {
  it('effectiveYearlyTarget() reads the keyed-by-year allYearlyTargets shape loadAllYearlyTargets() produces, with no DEFAULT_TARGETS fallback', () => {
    expect(effectiveYearlyTarget(LOC, 2026, {})).toEqual({});
    const t = effectiveYearlyTarget(LOC, 2026, { 2026: { [LOC]: { tProdSales: 4000000 } } });
    expect(t.tProdSales).toBe(4000000);
    expect(t.tCrewLabor).toBeUndefined(); // no silent DEFAULT_TARGETS fill-in, unlike the monthly tab
  });

  it('every YEARLY_TARGET_METRICS entry has a verified actual resolver and a plausible yearly_targets field name', () => {
    const YEARLY_FIELDS = new Set(['tOepe', 'tPark', 'tKvst', 'tKvsu', 'tR2p', 'tOsat', 'tOsatB2B', 'tVoiceEAD',
      't1800Contacts', 'tDigAppPct', 'tDigAppGCRD', 'tMcdGCRD', 'tMcdWait', 'tMcdStars', 'tCrewStaffing',
      'tShiftLeaders', 'tManagers', 'tHeadcount', 'tToShiftLeader', 'tToCrew090', 'tToCrewYTD', 'tTpph',
      'tLabor', 'tFOBTarget', 'tProdSales', 'tCrewLabor']);
    for (const m of YEARLY_TARGET_METRICS) {
      expect(typeof m.actual).toBe('function');
      expect(YEARLY_FIELDS.has(m.targetField)).toBe(true);
    }
  });

  it('computes real target-vs-actual rows for the yearly tab using the same fixture/proven resolvers', () => {
    const allYearlyTargets = { 2026: { [LOC]: { tProdSales: 3500000, tOepe: 135, tTpph: 6.0, tCrewLabor: 0.20, tFOBTarget: 0.04 } } };
    const rows = computeTargetsVsActual(buildDs(), [LOC], { which: 'yearly', range: RANGE, allYearlyTargets, targetYear: 2026 });
    expect(rows).toHaveLength(1);
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));

    expect(byKey.yProdSales.target).toBe(3500000);
    expect(byKey.yProdSales.actual).toBe(300000); // same fixture as the monthly-tab test above
    expect(byKey.yProdSales.pace).toBe(300000); // a full month paces to itself (frac=1)

    expect(byKey.yLabor.target).toBe(0.20);
    expect(byKey.yLabor.actual).toBeCloseTo(0.21, 6);
    expect(byKey.yLabor.status).toBe('watch'); // 0.01/0.20 = 5% over target, inside the 10% watch band

    // Not hardcoded — proves reuse of the exact same resolver, rather than guessing the number.
    // The engine widens the picker's range to the full Jan-1-through-asOf YTD window for the
    // yearly tab (see computeTargetsVsActual's own comment) -- this fixture's only data is in
    // September, so the two windows are numerically equivalent here, but the real YTD window is
    // what's actually compared against, not the raw RANGE.
    const ytdRange = { s: new Date(2026, 0, 1), e: new Date(2026, 8, 30) };
    expect(byKey.yFobTarget.actual).toBe(resolveMetricForRange(buildDs(), LOC, 'fobTargetPct', ytdRange));
  });

  it('with no yearly workbook uploaded for the year, every target is null and every status is none', () => {
    const rows = computeTargetsVsActual(buildDs(), [LOC], { which: 'yearly', range: RANGE, allYearlyTargets: {}, targetYear: 2026 });
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
    expect(byKey.yProdSales.target).toBeNull();
    expect(byKey.yProdSales.status).toBe('none');
  });
});

// Owner follow-up (2026-11-15), same day: "On the yearly, for sales[,] add the monthly actuals
// together [to] generate the yearly actual based on that for completed months and pace for any
// current month. For labor and fob, ... monthly maybe with a rollup based on dollars." A
// dedicated three-month fixture (July full, August full, September 1-10 only) with DIFFERENT
// sales/labor/FOB-leg magnitudes per month, so a naive average-of-monthly-ratios would give a
// visibly different (and wrong) number than the correct dollar-weighted rollup -- a single-month
// fixture can't distinguish the two.
function buildYtdDs() {
  const qsrFobRows = [], laborRows = [], opsLaborRows = [], opsRows = [];
  // tpph/oepe/kvst/park/r2p each get a DIFFERENT value per month, specifically so a mean
  // computed over the real per-day values across all three months reads differently than
  // either a single month's value or a naive average of the three monthly values would --
  // the only way to tell "uses the real widened window" apart from "coincidentally landed on
  // the same number" (metric-source.js's metricAvg is mean-of-daily, never mean-of-averages).
  const push = (y, mo, day, sales, laborDollar, tpph, oepe, kvst, park, r2p) => {
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const d = new Date(iso + 'T00:00:00');
    laborRows.push({ loc: LOC, date: d, sales, gc: 100, tpph });
    opsLaborRows.push({ loc: LOC, date: d, laborDollar });
    opsRows.push({ loc: LOC, date: d, oepe, kvst, park, r2p });
  };
  for (let day = 1; day <= 31; day++) push(2026, 7, day, 5000, 1000, 5.0, 200, 50, 0.10, 80);   // July
  for (let day = 1; day <= 31; day++) push(2026, 8, day, 20000, 6000, 6.0, 220, 55, 0.12, 85); // August
  for (let day = 1; day <= 10; day++) push(2026, 9, day, 10000, 2500, 7.0, 240, 60, 0.15, 90); // Sep 1-10 only
  // One qsr_fob row per month (each the sole/first row of its own calendar month, so
  // fobDailyDeltas treats it as that month's own total activity, not a diff against a
  // predecessor) -- rawWasteAmt is the only non-zero FOB leg, at a different $ magnitude per
  // month so the dollar-weighted rollup provably differs from a naive average of monthly %s.
  qsrFobRows.push({ loc: '0003708', date: '2026-07-31', prodSalesAmt: 155000, rawWasteAmt: 1000 });   // 0.645%
  qsrFobRows.push({ loc: '0003708', date: '2026-08-31', prodSalesAmt: 620000, rawWasteAmt: 20000 });  // 3.226%
  qsrFobRows.push({ loc: '0003708', date: '2026-09-10', prodSalesAmt: 100000, rawWasteAmt: 1500 });   // 1.5%
  return { qsrFobRows, laborRows, opsLaborRows, opsRows, storeIds: [LOC], allMonthlyTargets: {} };
}

describe('Yearly tab — year-to-date rollup + Sales $ pacing (owner follow-up, 2026-11-15)', () => {
  const asOf = { s: '2026-09-01', e: '2026-09-10' }; // the picker's own narrow window; asOf = Sep 10
  const allYearlyTargets = { 2026: { [LOC]: { tProdSales: 1000000, tCrewLabor: 0.20, tFOBTarget: 0.01 } } };

  it('Sales $ actual is the REAL sum of completed months + the current month\'s real MTD-so-far (no projection)', () => {
    const rows = computeTargetsVsActual(buildYtdDs(), [LOC], { which: 'yearly', range: asOf, allYearlyTargets, targetYear: 2026 });
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
    // July ($155,000) + August ($620,000) real, + Sep 1-10 real ($100,000) -- no pacing applied
    // to `actual` itself, matching the Monthly tab's own "nothing hidden" convention.
    expect(byKey.yProdSales.actual).toBe(875000);
  });

  it('Sales $ pace completes the current in-progress month\'s run rate, without projecting whole future months', () => {
    const rows = computeTargetsVsActual(buildYtdDs(), [LOC], { which: 'yearly', range: asOf, allYearlyTargets, targetYear: 2026 });
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
    // July + August unchanged (already complete) + September paced: $100,000 over 10 of 30 days
    // -> $300,000 projected for September. 155000 + 620000 + 300000 = 1,075,000.
    expect(byKey.yProdSales.pace).toBe(1075000);
    // Status grades off the pace, not the lower real actual.
    expect(byKey.yProdSales.status).toBe('ok'); // 1,075,000 clears the $1,000,000 target
  });

  it('Crew Labor % rolls up dollars across months — the dollar-weighted ratio, not an average of monthly %s', () => {
    const rows = computeTargetsVsActual(buildYtdDs(), [LOC], { which: 'yearly', range: asOf, allYearlyTargets, targetYear: 2026 });
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
    // Naive average of July 20% / August 30% / Sep 25% would be exactly 25% -- a plausible-
    // looking but WRONG number this test exists to rule out. The real dollar-weighted ratio:
    // Σlabor (31,000+186,000+25,000=242,000) / Σsales (155,000+620,000+100,000=875,000).
    const expected = 242000 / 875000;
    expect(byKey.yLabor.actual).toBeCloseTo(expected, 6);
    expect(byKey.yLabor.actual).not.toBeCloseTo(0.25, 2); // rules out the naive average
  });

  it('FOB Target % rolls up the same way, via fob-reference.js\'s real $ delta reconstruction', () => {
    const rows = computeTargetsVsActual(buildYtdDs(), [LOC], { which: 'yearly', range: asOf, allYearlyTargets, targetYear: 2026 });
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
    // Naive average of 0.645% / 3.226% / 1.5% ≈ 1.79% -- again, plausible but wrong.
    const expected = (1000 + 20000 + 1500) / (155000 + 620000 + 100000);
    expect(byKey.yFobTarget.actual).toBeCloseTo(expected, 6);
    expect(byKey.yFobTarget.actual).not.toBeCloseTo(0.0179, 3);
  });

  it('a window entirely within a single already-complete past year counts every month as real, no pacing', () => {
    // asOf (range.e) in a LATER year than targetYear clamps to Dec 31 of targetYear -- the whole
    // year is "complete," so Sep 1-10's real data is all there is and nothing paces further.
    const pastYearAsOf = { s: '2027-01-01', e: '2027-01-01' };
    const rows = computeTargetsVsActual(buildYtdDs(), [LOC], { which: 'yearly', range: pastYearAsOf, allYearlyTargets, targetYear: 2026 });
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
    expect(byKey.yProdSales.actual).toBe(875000); // same real total -- Sep 1-10 is all that exists
    expect(byKey.yProdSales.pace).toBe(875000); // September isn't "current" anymore -- no pacing
  });

  // Owner follow-up (2026-11-15): "yes, let's do what makes it make sense" -- confirming
  // TPPH/OEPE/Parked %/KVS Time/R2P ALSO grade against the year-to-date window on the Yearly
  // tab, not the narrow 7/14/21/28/MTD picker window. These are mean-of-daily rate metrics
  // (metricAvg), not dollar totals, so unlike Sales $ they need no pacing -- the YTD mean IS
  // the honest, complete "actual" already, the same way yLabor/yFobTarget's dollar-weighted
  // YTD sum needs no pacing either. computeTargetsVsActual already widens `actualRange`
  // uniformly for every yearly metric def, so this was already correct the moment the YTD
  // widening shipped -- this test exists because nothing had actually proven it with real
  // multi-month data until now (the single-month fixture used earlier couldn't tell a
  // YTD mean apart from a narrow-window one).
  it('TPPH/OEPE/Parked %/KVS Time/R2P grade against the year-to-date mean too, not the narrow picker window', () => {
    const rows = computeTargetsVsActual(buildYtdDs(), [LOC], { which: 'yearly', range: asOf, allYearlyTargets, targetYear: 2026 });
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
    // Mean of daily values across July (31d@5.0/200/50/.10/80) + August (31d@6.0/220/55/.12/85)
    // + Sep 1-10 (10d@7.0/240/60/.15/90) -- day-weighted, never a flat average of the three
    // monthly values (which would read 6.0/220/55/.1233/85 instead).
    expect(byKey.yTpph.actual).toBeCloseTo((31 * 5.0 + 31 * 6.0 + 10 * 7.0) / 72, 6);
    expect(byKey.yOepe.actual).toBeCloseTo((31 * 200 + 31 * 220 + 10 * 240) / 72, 6);
    expect(byKey.yKvst.actual).toBeCloseTo((31 * 50 + 31 * 55 + 10 * 60) / 72, 6);
    expect(byKey.yPark.actual).toBeCloseTo((31 * 0.10 + 31 * 0.12 + 10 * 0.15) / 72, 6);
    expect(byKey.yR2p.actual).toBeCloseTo((31 * 80 + 31 * 85 + 10 * 90) / 72, 6);
    // None of these read the narrow picker window's flat Sep 1-10 value (7.0/240/60/.15/90) --
    // ruling out the "coincidentally the same number" trap a single-month fixture can't catch.
    expect(byKey.yTpph.actual).not.toBeCloseTo(7.0, 2);
    expect(byKey.yOepe.actual).not.toBeCloseTo(240, 0);
  });
});

describe('computeTargetsVsActual() — daily tab', () => {
  it('reads DEFAULT_TARGETS directly (no monthly override lookup) and degrades to actual:null without ops data', () => {
    const rows = computeTargetsVsActual(buildDs(), [LOC], { which: 'daily', range: RANGE });
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
    expect(byKey.oepe.target).toBe(DEFAULT_TARGETS[LOC].tOepe);
    expect(byKey.oepe.actual).toBeNull();
    expect(byKey.oepe.status).toBe('none');
  });

  it('every DAILY_TARGET_METRICS key is distinct from every MONTHLY_TARGET_METRICS key', () => {
    const monthlyKeys = new Set(MONTHLY_TARGET_METRICS.map(m => m.key));
    for (const m of DAILY_TARGET_METRICS) expect(monthlyKeys.has(m.key)).toBe(false);
  });
});

// The fixture's rows are all dated September 2026; ReportShell's own default date range
// (whatever preset is active) resolves against the REAL clock at test-run time, which won't
// land anywhere near September — so every test that needs real (non-"—") actuals has to steer
// the report's own date-range control to a custom range first, exactly like a user would.
async function setCustomRange(container, s, e) {
  const select = [...container.querySelectorAll('select')].find(sel => [...sel.options].some(o => o.value === 'mtd'));
  const setSelectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => {
    setSelectValue.call(select, 'custom');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const [startInput, endInput] = [...container.querySelectorAll('input[type="date"]')];
  const setInputValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setInputValue.call(startInput, s);
    startInput.dispatchEvent(new Event('input', { bubbles: true }));
    setInputValue.call(endInput, e);
    endInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const applyBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Apply');
  await act(async () => { applyBtn.click(); });
}

function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(React.createElement(TargetsVsActualReportPanel, props)); });
  return { container, root };
}

describe('TargetsVsActualReportPanel', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  it('shows the pre-run empty state, and the date picker carries 7/14/21/28/MTD', () => {
    ({ container, root } = mount({ ds: {}, stores: STORES, onClose: () => {} }));
    expect(container.textContent).toContain('Choose a date range and location, then Run Report.');
    const select = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'mtd'));
    expect(select, 'date-range select with an MTD option not found').toBeTruthy();
    const optionValues = [...select.options].map(o => o.value).filter(v => v !== 'custom');
    expect(optionValues).toEqual(['7d', '14d', '21d', '28d', 'mtd']);
  });

  it('Run Report renders the Monthly tab by default, with real target/actual numbers', async () => {
    ({ container, root } = mount({ ds: buildDs(), stores: STORES, onClose: () => {} }));
    await setCustomRange(container, '2026-09-01', '2026-09-30');
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('Sales $');
    expect(container.textContent).toMatch(/\$300,000/);
  });

  // Owner-reported 2026-11-15: on mobile, backgrounding the app mid-startup commonly means
  // Run Report gets clicked before the FOB/labor streams' background fetch has landed -- rows
  // read blank, and nothing ever prompted a re-check once the data actually arrived a moment
  // later. Simulates that race: run against an empty ds (streams still loading), then "arrive
  // late" by re-rendering the SAME mounted panel with the real data -- the report should notice
  // and recompute on its own, without the user touching Run again.
  it('auto-refreshes the last run once a stream that was still loading at Run time later arrives', async () => {
    ({ container, root } = mount({ ds: {}, stores: STORES, onClose: () => {} }));
    await setCustomRange(container, '2026-09-01', '2026-09-30');
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(container.textContent).not.toMatch(/\$300,000/); // nothing loaded yet -- reads "—"

    // The real data "arrives" moments later -- same mounted instance, ds prop updates in place,
    // exactly like App.js's setDs merging a newly-landed stream into a live component tree.
    await act(async () => {
      root.render(React.createElement(TargetsVsActualReportPanel, { ds: buildDs(), stores: STORES, onClose: () => {} }));
      await Promise.resolve();
    });

    expect(container.textContent).toMatch(/\$300,000/); // recomputed on its own, no re-click needed
  });

  it('Sales $ shows a "Pace:" line alongside the real MTD actual on a partial-month window', async () => {
    ({ container, root } = mount({ ds: buildDs(), stores: STORES, onClose: () => {} }));
    await setCustomRange(container, '2026-09-01', '2026-09-05');
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    expect(container.textContent).toMatch(/\$50,000/); // the honest 5-day MTD actual
    expect(container.textContent).toMatch(/Pace: \$300,000/); // the projected month-end run rate
  });

  it('Print renders one page per store styled like the on-screen card, not the generic flat table', async () => {
    const { printHtml } = await import('../utils/print-html.js');
    printHtml.mockClear();
    ({ container, root } = mount({ ds: buildDs(), stores: STORES, onClose: () => {} }));
    await setCustomRange(container, '2026-09-01', '2026-09-30');
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    const exportBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Export'));
    await act(async () => { exportBtn.click(); });
    const printItem = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Print'));
    await act(async () => { printItem.click(); });

    expect(printHtml).toHaveBeenCalledTimes(1);
    const html = printHtml.mock.calls[0][0];
    expect(html).toContain('Ardmore-Broadway'); // the real store name, not a loc code
    expect(html).toContain('page-break-before:always'); // one page per store, the established convention
    expect(html).toContain('#DA291C'); // the McDonald's-red workbook accent, matching the on-screen card
    expect(html).toContain('Pace: $300,000'); // pace carries through to print, not just the on-screen view
  });

  it('switching to the Daily tab renders the daily metric set instead', async () => {
    ({ container, root } = mount({ ds: buildDs(), stores: STORES, onClose: () => {} }));
    await setCustomRange(container, '2026-09-01', '2026-09-30');
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    const dailyTabBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Daily Targets'));
    await act(async () => { dailyTabBtn.click(); });

    expect(container.textContent).toContain('OEPE (sec)');
    expect(container.textContent).not.toContain('Sales $');
  });

  it('switching to the Yearly tab renders the yearly metric set, reading ds.allYearlyTargets for the range\'s year', async () => {
    const ds = buildDs();
    ds.allYearlyTargets = { 2026: { [LOC]: { tProdSales: 3500000 } } };
    ({ container, root } = mount({ ds, stores: STORES, onClose: () => {} }));
    await setCustomRange(container, '2026-09-01', '2026-09-30');
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    const yearlyTabBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Yearly Targets'));
    await act(async () => { yearlyTabBtn.click(); });

    expect(container.textContent).toContain('Sales $');
    expect(container.textContent).toMatch(/\$3,500,000/);
    expect(container.textContent).toMatch(/\$300,000/); // the real actual, same fixture as the monthly tab
    expect(container.textContent).not.toContain('T-Red A %'); // a daily-only metric, confirming the daily rows aren't still rendered
  });

  it('after a run, CSV export fires for the active tab', async () => {
    let clicks = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };
    try {
      ({ container, root } = mount({ ds: buildDs(), stores: STORES, onClose: () => {} }));
      const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
      await act(async () => { runBtn.click(); await Promise.resolve(); });

      const exportBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Export'));
      await act(async () => { exportBtn.click(); });
      const csvItem = [...document.querySelectorAll('button')].find(b => b.textContent.includes('CSV'));
      await act(async () => { csvItem.click(); });

      expect(clicks).toHaveLength(1);
      expect(clicks[0]).toMatch(/^TargetsvsActual_/);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
