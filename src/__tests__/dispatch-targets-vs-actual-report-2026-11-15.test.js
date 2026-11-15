// @vitest-environment happy-dom
// @ts-nocheck
// Owner request (2026-11-15): "a new report that focuses solely on the monthly targets and
// daily targets (separate tabs) that shows clearly what the current target is vs the actual
// results. For the date picker, seed it with 7,14,21 & 28 day options plus MTD please."
//
// Engine tests use the REAL fixture shape proven by fob-reference-table-panel.test.js (same
// 30-day September data for store 3708) so the FOB-leg delta-reconstruction math is exercised
// exactly the same way that already-shipped report exercises it, not a re-derived shortcut.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DEFAULT_TARGETS } from '../constants.js';
import { resolveDatePreset, MTD_PRESET, DATE_RANGE_PRESETS } from '../components/PanelControls.js';
import {
  effectiveMonthlyTarget, effectiveYearlyTarget, targetStatus, computeTargetsVsActual, monthEndPace,
  MONTHLY_TARGET_METRICS, DAILY_TARGET_METRICS, YEARLY_TARGET_METRICS, _blendedMonthlyTarget,
  FOB_COMPONENT_KEYS, FOB_SUMMARY_KEYS,
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
  it('a true MTD window (range starts day 1) projects the month-end total as actual / fraction-of-month-elapsed', () => {
    // 5 of September's 30 days elapsed -- same run-rate math as the live Projection Workspace's
    // Actuals-vs-Target pace table (analytics.js's CurrentMonthPaceSection).
    expect(monthEndPace(50000, { s: '2026-09-01', e: '2026-09-05' }, '2026-9')).toBe(300000);
  });
  it('a full-month window (frac=1) paces to exactly the actual', () => {
    expect(monthEndPace(300000, { s: '2026-09-01', e: '2026-09-30' }, '2026-9')).toBe(300000);
  });
  // Bug fixed 2026-11-15 (owner report, live): a non-MTD window (7/14/21/28D, doesn't start on
  // day 1) must use its OWN day count, never the end date's calendar day-of-month -- the old
  // formula divided a 7-day actual by a 14/30 "elapsed" fraction (assuming the actual covered
  // ALL 14 days through the end date), understating the true pace by roughly half.
  it('a non-MTD window (does not start on day 1) paces using its own day count, not the end date\'s calendar day-of-month', () => {
    // 7-day window (Sep 8-14), actual=$70,000 over those 7 days. Correct pace: $70,000 / (7/30)
    // = $300,000. The OLD (buggy) formula would have used 14/30 (Sep 14's day-of-month) and
    // produced $150,000 -- half the correct value -- so this also rules out the regression.
    const paced = monthEndPace(70000, { s: '2026-09-08', e: '2026-09-14' }, '2026-9');
    expect(paced).toBe(300000);
    expect(paced).not.toBe(150000);
  });
  // Bug fixed 2026-11-15 (owner report, live): a window crossing a month boundary mixes two
  // months' sales into one `actual` figure -- no single month's day fraction can validly scale
  // that back into a full-month pace. Observed live: a 28-day window (Oct 18-Nov 14) with a
  // $322,457 actual produced a $690,979 "pace" (roughly DOUBLE the true run rate) because the
  // old formula used November's day-of-month (14/30) against an actual that was mostly October.
  it('returns null when the window crosses a month boundary — actual blends two months, no valid single-month pace', () => {
    expect(monthEndPace(322457, { s: '2026-10-18', e: '2026-11-14' }, '2026-11')).toBeNull();
  });
  it('returns null when the range end falls outside the target month — nothing to project', () => {
    expect(monthEndPace(50000, { s: '2026-10-01', e: '2026-10-01' }, '2026-9')).toBeNull(); // next month over
    expect(monthEndPace(50000, { s: '2026-08-31', e: '2026-08-31' }, '2026-9')).toBeNull(); // prior month
  });
  it('returns null on any missing input rather than guessing', () => {
    expect(monthEndPace(null, { s: '2026-09-01', e: '2026-09-05' }, '2026-9')).toBeNull();
    expect(monthEndPace(50000, null, '2026-9')).toBeNull();
    expect(monthEndPace(50000, { s: '2026-09-01', e: '2026-09-05' }, null)).toBeNull();
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
    // Variance (diff) grades off the SAME number Status does -- the pace, for a paced metric mid-
    // window (owner follow-up 2026-11-15: "The sales target...should be pace vs actual[/target]
    // ...would make sense to anyone seeing it, for MTD especially") -- so the two can never
    // disagree. The raw actual stays fully exposed on the row (`actual` above), it's just not
    // what Variance itself subtracts from Target.
    expect(byKey.salesAmt.diff).toBeCloseTo(300000 - DEFAULT_TARGETS[LOC].tProdSales, 2);
    expect(byKey.salesAmt.status).toBe('ok'); // Status grades off pace, which clears target even though the raw actual alone would not
  });

  it('a metric not marked `paced` is never pace-graded, even on the same partial-month window', () => {
    const partial = { s: '2026-09-01', e: '2026-09-05' };
    const rows = computeTargetsVsActual(buildDs(), [LOC], { which: 'monthly', range: partial, allMonthlyTargets: {}, targetMonthYm: '2026-9' });
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
    expect(byKey.crewLaborPct.pace).toBeNull();
    expect(byKey.crewLaborPct.diff).toBeCloseTo(byKey.crewLaborPct.actual - byKey.crewLaborPct.target, 6);
  });

  // FOB Bonus Food Threshold % REMOVED (owner follow-up 2026-11-15) -- it graded a stricter
  // threshold field against the exact same Total Food Cost % actual as fobTotal, with no actual
  // of its own, producing a nonsensical double-digit "Miss" whenever the two thresholds simply
  // differed. See targets-vs-actual.js's MONTHLY_TARGET_METRICS comment for the full removal note.
  it('fobBonusBase is no longer a row on this report', () => {
    expect(MONTHLY_TARGET_METRICS.some(m => m.key === 'fobBonusBase')).toBe(false);
  });

  // Owner follow-up 2026-11-15: "while we are in there, let's also add com[p] sales line. only
  // one missing" / "comp sales %" -- the one FOB Reference Table field (fob-reference.js's
  // `compSalesPct`, a year-over-year sales growth %) this report hadn't picked up yet. Targeted
  // against DEFAULT_TARGETS' `tGrowth` field, the same comp-sales-growth target the FOB Reference
  // Table and Monthly Targets editor already carry. Its actual() reuses resolveMetricForRange
  // verbatim (the same resolver every FOB leg above already goes through), so its own number is
  // proven correct by fob-reference.js's/vs-ly.js's own test suites, not re-derived here -- this
  // just confirms the row is wired into the report with the right target field and direction.
  it('compSalesPct is a real row, targeted against tGrowth', () => {
    const row = MONTHLY_TARGET_METRICS.find(m => m.key === 'compSalesPct');
    expect(row, 'compSalesPct row not found').toBeTruthy();
    expect(row.targetField).toBe('tGrowth');
    expect(row.unit).toBe('pct');
    expect(row.better).toBe('higher');
    const rows = computeTargetsVsActual(buildDs(), [LOC], { which: 'monthly', range: RANGE, allMonthlyTargets: {}, targetMonthYm: '2026-9' });
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
    expect(byKey.compSalesPct.target).toBe(DEFAULT_TARGETS[LOC].tGrowth);
  });

  // Owner follow-up (2026-11-15): "put an outline or shade differently to denote FOB components
  // culminating with an even more visual drawing to the FOB line." The view groups rows by key
  // membership in FOB_COMPONENT_KEYS/FOB_SUMMARY_KEYS -- this just guards that the two lists stay
  // disjoint and every summary key is a real row, so the view's grouping can never silently point
  // at a key that doesn't exist or double-count a row as both a component and a summary.
  //
  // Narrowed same day (owner follow-up): "remove shading from Base Food, Disc Coupon and Total
  // Food Cost. This will help the stores focus on only what they are tasked or charged to
  // deliver." Base Food % and Disc Coupon % aren't store-controllable the way the other legs are,
  // and FOB Target % (w/o Disc Coupon) exists specifically to exclude Disc Coupon from what a
  // store is held to -- shading it back in would visually contradict that. Total Food Cost %
  // (which includes both excluded legs) is no longer a "summary" row either; FOB Target % alone is.
  it('FOB_COMPONENT_KEYS and FOB_SUMMARY_KEYS are disjoint and every key is a real monthly-tab row', () => {
    const rowKeys = new Set(MONTHLY_TARGET_METRICS.map(m => m.key));
    for (const k of FOB_COMPONENT_KEYS) expect(rowKeys.has(k)).toBe(true);
    for (const k of FOB_SUMMARY_KEYS) expect(rowKeys.has(k)).toBe(true);
    const overlap = FOB_COMPONENT_KEYS.filter(k => FOB_SUMMARY_KEYS.includes(k));
    expect(overlap).toEqual([]);
    expect(FOB_COMPONENT_KEYS).toEqual(['compWastePct', 'rawWastePct', 'condimentPct', 'empFoodPct', 'statLossPct', 'unexDiffPct']);
    expect(FOB_SUMMARY_KEYS).toEqual(['fobTargetPct']);
    expect(FOB_COMPONENT_KEYS).not.toContain('baseFoodPct');
    expect(FOB_COMPONENT_KEYS).not.toContain('discCouponPct');
    expect(FOB_SUMMARY_KEYS).not.toContain('totalFoodCostPct');
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

// Owner observation (2026-11-15), live, MTD preset: a true single-month window (Nov 1 - Nov 14)
// showed "Blended: 0d Oct + 14d Nov" -- a blend label for a window that never actually touches
// October. Root cause: _monthsInRange parsed a bare date-only string ('2026-11-01') with
// `new Date(...)`, which JS interprets as UTC MIDNIGHT -- in any timezone behind UTC (every US
// timezone this app serves, including this owner's own), that lands on the PREVIOUS calendar day
// LOCALLY, and .getFullYear()/.getMonth() read local fields. This sandbox's test runner is UTC
// (confirmed: `new Date('2026-11-01').getMonth()` reads October here with NO offset), which is
// exactly why this shipped undetected -- these tests force a real non-UTC zone to reproduce it.
describe('_monthsInRange() / _yearToDateRange() — UTC-midnight date-string parsing bug (owner observation, 2026-11-15)', () => {
  const ORIGINAL_TZ = process.env.TZ;
  beforeEach(() => { process.env.TZ = 'America/Chicago'; }); // Oklahoma/Florida are both behind UTC
  afterEach(() => { process.env.TZ = ORIGINAL_TZ; });

  it('a true single-month MTD window produces exactly one month entry, not a spurious prior-month one', () => {
    const salesDef = MONTHLY_TARGET_METRICS.find(m => m.key === 'salesAmt');
    const mtdWindow = { s: '2026-11-01', e: '2026-11-14' };
    const r = _blendedMonthlyTarget(salesDef, mtdWindow, {}, LOC);
    // Before the fix, this produced blend=[{ym:'2026-10',days:0,...},{ym:'2026-11',days:14,...}]
    // -- a real, visible "Blended: 0d Oct + 14d Nov" line for a window that never touches October.
    expect(r.blend).toBeNull();
    expect(r.value).toBe(DEFAULT_TARGETS[LOC].tProdSales); // the plain flat monthly target, unprorated
  });

  it('a true single-month 7/14/21/28D window (not just MTD) is also unaffected', () => {
    const salesDef = MONTHLY_TARGET_METRICS.find(m => m.key === 'salesAmt');
    const sameMonth28d = { s: '2026-11-01', e: '2026-11-28' };
    const r = _blendedMonthlyTarget(salesDef, sameMonth28d, {}, LOC);
    expect(r.blend).toBeNull();
  });

  it('a genuinely cross-month window still blends correctly under a non-UTC timezone', () => {
    const salesDef = MONTHLY_TARGET_METRICS.find(m => m.key === 'salesAmt');
    const allMonthlyTargets = { '2026-9': { [LOC]: { tProdSales: 300000 } }, '2026-10': { [LOC]: { tProdSales: 310000 } } };
    const r = _blendedMonthlyTarget(salesDef, { s: '2026-09-28', e: '2026-10-04' }, allMonthlyTargets, LOC);
    expect(r.blend).toHaveLength(2);
    expect(r.blend[0]).toEqual({ ym: '2026-9', days: 3, missing: false });
    expect(r.blend[1]).toEqual({ ym: '2026-10', days: 4, missing: false });
  });

  it('computeTargetsVsActual() — yearly tab — the YTD range\'s END boundary includes the full last day under a non-UTC timezone', () => {
    // _yearToDateRange had the identical UTC-midnight bug on range.e -- a picker end date string
    // of '2026-11-14' could silently resolve one tick into Nov 13 locally, clipping a real day's
    // sales out of the YTD sum. Minimal fixture ($1,000 * day for Nov 1-14) isolates exactly this
    // boundary question: a clipped range reads $91,000 (days 1-13); the correct range reads
    // $105,000 (days 1-14) -- the missing day 14 is a precise, unmistakable $14,000 gap.
    const laborRows = [], opsLaborRows = [];
    for (let day = 1; day <= 14; day++) {
      const d = new Date(2026, 10, day); // November (0-indexed month 10)
      laborRows.push({ loc: LOC, date: d, sales: 1000 * day, gc: 10, tpph: 5 });
      opsLaborRows.push({ loc: LOC, date: d, laborDollar: 200 });
    }
    const novDs = { laborRows, opsLaborRows, storeIds: [LOC], allMonthlyTargets: {} };
    const rows = computeTargetsVsActual(novDs, [LOC], {
      which: 'yearly', range: { s: '2026-11-01', e: '2026-11-14' }, allYearlyTargets: {}, targetYear: 2026,
    });
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
    expect(byKey.yProdSales.actual).toBe(105000);
    expect(byKey.yProdSales.actual).not.toBe(91000); // what the UTC-midnight bug would have produced
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

  it('with no yearly workbook uploaded for the year, a field with no Monthly-rollup fallback (OEPE) is null/none', () => {
    const rows = computeTargetsVsActual(buildDs(), [LOC], { which: 'yearly', range: RANGE, allYearlyTargets: {}, targetYear: 2026 });
    const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
    expect(byKey.yOepe.target).toBeNull();
    expect(byKey.yOepe.status).toBe('none');
    expect(byKey.yOepe.targetSource).toBeNull();
  });

  // Owner follow-up (2026-11-15), same thread: "can we fix the targets here as well like we did
  // for monthly" -- Sales $ and Crew Labor % showed "—" on real stores because the yearly
  // workbook never carries a standalone annual figure for either (both are genuinely
  // month-by-month numbers that already live in Monthly Targets). _yearlyTarget rolls those two
  // fields up from Monthly Targets instead of leaving them blank -- real uploaded yearly values
  // still always win; this is a fallback, not an override.
  describe('_yearlyTarget() — Monthly-rollup fallback for Sales $ / Crew Labor % (owner follow-up, 2026-11-15)', () => {
    it('a real uploaded yearly value always wins over the Monthly rollup', () => {
      const allYearlyTargets = { 2026: { [LOC]: { tProdSales: 3500000, tCrewLabor: 0.20 } } };
      const rows = computeTargetsVsActual(buildDs(), [LOC], { which: 'yearly', range: RANGE, allYearlyTargets, targetYear: 2026 });
      const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
      expect(byKey.yProdSales.target).toBe(3500000);
      expect(byKey.yProdSales.targetSource).toBe('yearly');
      expect(byKey.yProdSales.blend).toBeNull();
    });

    it('missing yearly values fall back to a Monthly Targets rollup, summing each month\'s FULL target (never prorated) for a PACED metric', () => {
      // No monthly_targets override for 2026 either -- effectiveMonthlyTarget() still merges in
      // DEFAULT_TARGETS['3708'].tProdSales (111513.16) for every month, so the rollup sums that
      // flat per-month figure across every YTD month through September (9 months).
      const rows = computeTargetsVsActual(buildDs(), [LOC], { which: 'yearly', range: RANGE, allYearlyTargets: {}, allMonthlyTargets: {}, targetYear: 2026 });
      const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
      expect(byKey.yProdSales.targetSource).toBe('monthly-rollup');
      expect(byKey.yProdSales.target).toBeCloseTo(111513.16 * 9, 2);
      expect(byKey.yProdSales.blend).toHaveLength(9);
    });

    it('a real monthly_targets override for a specific month is used in the rollup ahead of DEFAULT_TARGETS', () => {
      const allMonthlyTargets = { '2026-3': { [LOC]: { tProdSales: 200000 } } };
      const rows = computeTargetsVsActual(buildDs(), [LOC], { which: 'yearly', range: RANGE, allYearlyTargets: {}, allMonthlyTargets, targetYear: 2026 });
      const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
      // March (200000, the real override) + the other 8 YTD months at the DEFAULT_TARGETS flat
      // figure (111513.16 each).
      expect(byKey.yProdSales.target).toBeCloseTo(200000 + 111513.16 * 8, 2);
    });

    it('Crew Labor % (non-paced) rolls up via the day-weighted _blendedMonthlyTarget path unmodified', () => {
      const allMonthlyTargets = { '2026-9': { [LOC]: { tCrewLabor: 0.25 } } };
      const rows = computeTargetsVsActual(buildDs(), [LOC], { which: 'yearly', range: RANGE, allYearlyTargets: {}, allMonthlyTargets, targetYear: 2026 });
      const byKey = Object.fromEntries(rows[0].metrics.map(m => [m.key, m]));
      expect(byKey.yLabor.targetSource).toBe('monthly-rollup');
      // Non-null -- DEFAULT_TARGETS['3708'].tCrewLabor (0.21) fills every other YTD month, so
      // this is a day-weighted blend across 9 months, not a flat 0.25.
      expect(byKey.yLabor.target).not.toBeNull();
      expect(byKey.yLabor.target).not.toBeCloseTo(0.25, 6);
    });
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

  // Owner follow-up 2026-11-15, after seeing a real-data case where a plain actual-minus-target
  // Variance (a real $168,968 shortfall) visibly disagreed with a pace-graded Status ("On
  // Target"): "The sales target, i would think, should be pace vs actual[/target] ... would make
  // sense to anyone seeing it, for MTD especially." Variance and Status now both grade off the
  // SAME number (the pace, for a paced metric mid-window) so they can never disagree -- the real
  // to-date actual stays fully visible as its own number (the "Pace:" line's own base figure),
  // it's just not what Variance itself subtracts from Target anymore.
  it('Sales $ Variance grades off the PACE (not the raw to-date actual) for a paced mid-month window, matching Status', async () => {
    ({ container, root } = mount({ ds: buildDs(), stores: STORES, onClose: () => {} }));
    await setCustomRange(container, '2026-09-01', '2026-09-05');
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run Report');
    await act(async () => { runBtn.click(); await Promise.resolve(); });

    const salesRow = [...container.querySelectorAll('tr')].find(tr => tr.textContent.includes('Sales $'));
    expect(salesRow, 'Sales $ row not found').toBeTruthy();
    const [, , , varianceCell, statusCell] = salesRow.querySelectorAll('td'); // Metric,Target,Actual,Variance,Status
    expect(statusCell.textContent).toContain('On Target');
    // Target $111,513.16, Pace $300,000 -> Variance = 300,000 - 111,513.16 = +$188,487 (NOT the
    // real $50,000 actual minus target, which would read as a $-61,513 miss).
    expect(varianceCell.textContent).toMatch(/\+\$188,487/);
    expect(varianceCell.textContent).not.toMatch(/-61,513/);
    // Variance's color now matches Status exactly -- same basis, by construction.
    expect(varianceCell.style.color).toBe(statusCell.style.color);
    expect(varianceCell.style.color).toBe('#10b981');
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
