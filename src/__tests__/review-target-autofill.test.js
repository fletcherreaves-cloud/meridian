// @ts-nocheck
import { describe, it, expect } from 'vitest';
import {
  autoPopulateKPIs, mergedTargetsForLoc, missingReviewTargets,
  REVIEW_METRIC_TARGET_FIELD, DEFAULT_REVIEW_CONFIG,
} from '../engine/review-engine.js';

// Minimal review skeleton for loc 3708 (which carries full DEFAULT_TARGETS).
function blankMonths() {
  const m = {};
  for (let i = 1; i <= 12; i++) m[i] = {};
  return m;
}
const review = () => ({ loc: '3708', year: 2026, half: 'H1', role: 'GM', kpis: { months: blankMonths() } });

describe('mergedTargetsForLoc — monthly wins over yearly wins over default', () => {
  it('layers DEFAULT < yearly < monthly', () => {
    const ds = {
      targets:        { '3708': { tLabor: 0.23 } },          // yearly override
      monthlyTargets: { '3708': { tLabor: 0.215 } },         // monthly override (wins)
    };
    const t = mergedTargetsForLoc(ds, '3708');
    expect(t.tLabor).toBe(0.215);          // monthly wins
    expect(t.tOepe).toBe(140);             // falls through to DEFAULT_TARGETS
  });

  // Dispatch #107 Part 4 verification: tOsatB2B has NO monthly_targets column (checked —
  // it isn't one of that table's fields), so it's a yearly-only field with no tier above it
  // to test the "monthly wins" half against for free. This confirms both halves explicitly:
  // the yearly (ds.targets) value surfaces with no monthly override present, and a monthly
  // override for the SAME field still supersedes it once one exists — without touching
  // mergedTargetsForLoc's own logic, per the dispatch's "verify, don't rebuild" instruction.
  it('surfaces a yearly-only field (tOsatB2B) with no monthly tier, then lets a monthly override win once set', () => {
    const dsYearlyOnly = { targets: { '3708': { tOsatB2B: 0.02 } } };
    expect(mergedTargetsForLoc(dsYearlyOnly, '3708').tOsatB2B).toBe(0.02);

    const dsWithMonthlyOverride = {
      targets:        { '3708': { tOsatB2B: 0.02 } },
      monthlyTargets: { '3708': { tOsatB2B: 0.015 } },
    };
    expect(mergedTargetsForLoc(dsWithMonthlyOverride, '3708').tOsatB2B).toBe(0.015);
  });
});

describe('autoPopulateKPIs target auto-fill (Notes 32 A)', () => {
  it('fills OEPE/R2P/KVS/Labor/Sales/OpSupplies/TPPH targets from official targets', () => {
    const r = autoPopulateKPIs(review(), { loaded: true });
    const jun = r.kpis.months[6];
    expect(jun.oepeTgt).toBe(140);
    expect(jun.r2pTgt).toBe(95);
    expect(jun.kvsTgt).toBe(45);
    expect(jun.laborTgt).toBe(0.22);
    expect(jun.salesVsTgtTgt).toBe(111513.16);
    expect(jun.opSuppliesTgt).toBeCloseTo(2938.76, 1);
    expect(jun.tpphTgt).toBe(5.6);
  });

  it('monthly target overrides the DEFAULT during auto-fill', () => {
    const r = autoPopulateKPIs(review(), { loaded: true, monthlyTargets: { '3708': { tLabor: 0.20 } } });
    expect(r.kpis.months[3].laborTgt).toBe(0.20);
  });

  it('does not override a target already present on the month', () => {
    const rv = review(); rv.kpis.months[6].oepeTgt = 999;
    const r = autoPopulateKPIs(rv, { loaded: true });
    expect(r.kpis.months[6].oepeTgt).toBe(999);
  });

  it('every DEFAULT_TARGETS-native mapped target field actually exists for a real store', () => {
    // These 7 predate dispatch #109 and live in DEFAULT_TARGETS (constants.js) itself.
    const NATIVE = ['tOepe', 'tR2p', 'tKvst', 'tLabor', 'tProdSales', 'tOpSupply', 'tTpph'];
    const t = mergedTargetsForLoc({}, '3708');
    for (const tf of NATIVE) {
      expect(t[tf], `missing ${tf}`).not.toBeUndefined();
    }
  });

  // Dispatch #109 items #1/#2/#6 — these 6 fields were added to REVIEW_METRIC_TARGET_FIELD
  // for the yearly-workbook targets (dispatch #107). They have NO DEFAULT_TARGETS entry —
  // they resolve only from ds.targets (yearly) or ds.monthlyTargets, never the hard-coded
  // per-store fallback — so they're verified against a ds carrying them, not an empty one.
  it('resolves the dispatch #109 target mappings from ds.targets (yearly workbook), not DEFAULT_TARGETS', () => {
    const yearly = {
      tMcdWait: 240, tDigAppGCRD: 180, tMcdGCRD: 30,
      tShiftLeaders: 8, tHeadcount: 60, tToCrew090: 0.25,
    };
    const t = mergedTargetsForLoc({ targets: { '3708': yearly } }, '3708');
    for (const [key, tf] of Object.entries({
      delivWait: 'tMcdWait', digitalGC: 'tDigAppGCRD', delivGC: 'tMcdGCRD',
      shiftCert: 'tShiftLeaders', headcount: 'tHeadcount', turnover90: 'tToCrew090',
    })) {
      expect(REVIEW_METRIC_TARGET_FIELD[key], `no mapping for ${key}`).toBe(tf);
      expect(t[tf], `missing ${tf}`).toBe(yearly[tf]);
    }
    // Absent ds.targets, these fields resolve to undefined (no DEFAULT_TARGETS fallback) —
    // confirms they are genuinely yearly-only, not silently backed by a hard-coded default.
    const noYearly = mergedTargetsForLoc({}, '3708');
    expect(noYearly.tMcdWait).toBeUndefined();
  });
});

describe('missingReviewTargets — flags scored metrics with no resolvable target', () => {
  it('lists metrics that have neither a namespace target nor a per-month target', () => {
    const miss = missingReviewTargets(review(), DEFAULT_REVIEW_CONFIG, {});
    const keys = miss.map(m => m.key);
    // These have no target field in DEFAULT_TARGETS → should be flagged for the user.
    expect(keys).toContain('osat');
    expect(keys).toContain('delivWait');
    expect(keys).toContain('headcount');
    // These resolve from official targets → should NOT be flagged.
    expect(keys).not.toContain('oepe');
    expect(keys).not.toContain('labor');
  });
});

import { deriveTotalProfitVsTarget } from '../engine/review-engine.js';

describe('deriveTotalProfitVsTarget (Notes 32 #5)', () => {
  it('sums favorable/unfavorable controllable variances in dollars', () => {
    const r = deriveTotalProfitVsTarget({
      fobPctActual: 0.05, fobPctTarget: 0.04,     // 1pt OVER → unfavorable
      laborPctActual: 0.21, laborPctTarget: 0.22, // 1pt UNDER → favorable
      opSuppliesActual: 3200, opSuppliesTarget: 3000, // $200 over → unfavorable
      netSales: 100000, prodSales: 100000,
    });
    expect(r.fob$).toBeCloseTo((0.04 - 0.05) * 100000, 5);   // -1000
    expect(r.labor$).toBeCloseTo((0.22 - 0.21) * 100000, 5); // +1000
    expect(r.opSupply$).toBeCloseTo(3000 - 3200, 5);          // -200
    expect(r.total$).toBeCloseTo(-200, 5);
    expect(r.components).toBe(3);
  });

  it('drops only the missing component (partial inputs)', () => {
    const r = deriveTotalProfitVsTarget({
      laborPctActual: 0.21, laborPctTarget: 0.22, netSales: 100000,
    });
    expect(r.fob$).toBeNull();
    expect(r.opSupply$).toBeNull();
    expect(r.labor$).toBeCloseTo(1000, 5);
    expect(r.total$).toBeCloseTo(1000, 5);
    expect(r.components).toBe(1);
  });

  it('returns null total when no component is computable', () => {
    expect(deriveTotalProfitVsTarget({}).total$).toBeNull();
  });
});

describe('autoPopulateKPIs op-supplies actual from eBOS (Notes 32 #4)', () => {
  it('sums the month eBOS ops_purchases into opSupplies + auto-fills the target', () => {
    const ds = { loaded: true, ebosRows: [
      { loc: '3708', date: new Date('2026-06-05T00:00:00'), opsPurchases: 1200 },
      { loc: '3708', date: new Date('2026-06-20T00:00:00'), opsPurchases: 900 },
      { loc: '3708', date: new Date('2026-05-10T00:00:00'), opsPurchases: 500 }, // other month
    ] };
    const r = autoPopulateKPIs(review(), ds);
    expect(r.kpis.months[6].opSupplies).toBe(2100);      // June only
    expect(r.kpis.months[6].opSuppliesTgt).toBeCloseTo(2938.76, 1); // tOpSupply auto-fill
    expect(r.kpis.months[5].opSupplies).toBe(500);       // May
  });
});

describe('autoPopulateKPIs People metrics (Notes 32 #1/#2/#3)', () => {
  it('fills headcount / shiftCert / turnover90 from monthly per-loc People rows', () => {
    const ds = { loaded: true,
      rosterStatsRows: [{ loc: '3708', month: '2026-06', rosterActive: 64, crewActive: 55 }],
      rosterRoleCounts: [{ loc: '3708', month: '2026-06', shiftMgr: 8, crew: 55 }],
      turnoverRows: [{ loc: '3708', month: '2026-06', turnover090Pct: 0.375 }],
    };
    const r = autoPopulateKPIs(review(), ds);
    expect(r.kpis.months[6].headcount).toBe(64);      // Roster Active
    expect(r.kpis.months[6].shiftCert).toBe(8);       // shiftMgr bucket
    expect(r.kpis.months[6].turnover90).toBeCloseTo(0.375, 6);
  });
  it('ignores rows from a different year and leaves other months empty', () => {
    const ds = { loaded: true,
      rosterStatsRows: [{ loc: '3708', month: '2025-06', rosterActive: 99 }], // wrong year (review is 2026)
    };
    const r = autoPopulateKPIs(review(), ds);
    expect(r.kpis.months[6].headcount).toBeUndefined();
  });
});

describe('autoPopulateKPIs Delivery Wait Time (dispatch #109 item #1)', () => {
  it('fills delivWait from mcdeliveryRows.restaurantTimeSec, NOT mcDeliveryTimeSec, + target from tMcdWait', () => {
    const ds = { loaded: true,
      mcdeliveryRows: [{ loc: '3708', month: '2026-06', deliveryGcRd: 40, restaurantTimeSec: 195, mcDeliveryTimeSec: 950 }],
      targets: { '3708': { tMcdWait: 240 } },
    };
    const r = autoPopulateKPIs(review(), ds);
    expect(r.kpis.months[6].delivWait).toBe(195);      // restaurant leg, not the courier leg (950)
    expect(r.kpis.months[6].delivWaitTgt).toBe(240);
  });
});

describe('autoPopulateKPIs OEPE/R2P/KVS/Labor% via the metric-source auto-first resolver (dispatch #109 item #3)', () => {
  it('prefers a fresh auto/emailed stream over a stale manual laborRows/opsRows value for the same day', () => {
    const ds = { loaded: true,
      glimpseRows: [{ loc: '3708', date: '2026-06-10', oepe: 128, kvst: 42, laborPct: 0.205 }],
      qsrActSummaryRows: [{ loc: '3708', date: '2026-06-10', r2p: 88 }],
      // Stale manual uploads that must NOT win once an auto stream covers the same day.
      opsRows: [{ loc: '3708', date: new Date('2026-06-10T00:00:00'), oepe: 999, r2p: 999, kvst: 999 }],
      laborRows: [{ loc: '3708', date: new Date('2026-06-10T00:00:00'), laborPct: 0.999 }],
    };
    const r = autoPopulateKPIs(review(), ds);
    const jun = r.kpis.months[6];
    expect(jun.oepe).toBe(128);
    expect(jun.kvs).toBe(42);
    expect(jun.labor).toBeCloseTo(0.205, 6);
    expect(jun.r2p).toBe(88);
  });

  it('falls back to the manual upload when no auto/emailed stream covers the day', () => {
    const ds = { loaded: true,
      opsRows: [{ loc: '3708', date: new Date('2026-06-11T00:00:00'), oepe: 150, r2p: 90, kvst: 48 }],
      laborRows: [{ loc: '3708', date: new Date('2026-06-11T00:00:00'), laborPct: 0.21 }],
    };
    const r = autoPopulateKPIs(review(), ds);
    const jun = r.kpis.months[6];
    expect(jun.oepe).toBe(150);
    expect(jun.r2p).toBe(90);
    expect(jun.kvs).toBe(48);
    expect(jun.labor).toBeCloseTo(0.21, 6);
  });
});

describe('autoPopulateKPIs Total Profit vs Target (dispatch #109 item #5)', () => {
  it("derives totalProfit from THIS month's already-resolved FOB%/Labor%/Op-Supplies — no separate pull", () => {
    const ds = { loaded: true,
      fobRows:     [{ loc: '3708', date: new Date('2026-06-05T00:00:00'), fobPct: 0.05, fobDollar: 500 }],
      glimpseRows: [{ loc: '3708', date: '2026-06-05', laborPct: 0.21 }],
      ebosRows:    [{ loc: '3708', date: new Date('2026-06-05T00:00:00'), opsPurchases: 3200 }],
      laborRows:   [{ loc: '3708', date: new Date('2026-06-05T00:00:00'), sales: 100000 }],
    };
    const r = autoPopulateKPIs(review(), ds);
    const jun = r.kpis.months[6];
    // fob$ = (tFOBTarget 0.0385 - 0.05) * 100000 = -1150; labor$ = (tLabor 0.22 - 0.21) * 100000 = +1000;
    // opSupply$ = tOpSupply 2938.761005 - 3200 = -261.238995 → total = -411.238995
    expect(jun.totalProfit).toBeCloseTo(-411.24, 1);
    expect(jun.totalProfitTgt).toBe(0);
    // The $-scale foodOB metric (fobDollar) is untouched by this — confirms no cross-contamination.
    expect(jun.foodOB).toBe(500);
  });

  it('does not overwrite an already-entered totalProfit', () => {
    const rv = review(); rv.kpis.months[6].totalProfit = 12345;
    const ds = { loaded: true,
      fobRows: [{ loc: '3708', date: new Date('2026-06-05T00:00:00'), fobPct: 0.05 }],
      laborRows: [{ loc: '3708', date: new Date('2026-06-05T00:00:00'), sales: 100000 }],
    };
    const r = autoPopulateKPIs(rv, ds);
    expect(r.kpis.months[6].totalProfit).toBe(12345);
  });
});
