// @ts-nocheck
import { describe, it, expect } from 'vitest';
import {
  autoPopulateKPIs, mergedTargetsForLoc, mergedTargetsForLocMonth, missingReviewTargets,
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

// Dispatch #109 item #4 — the pre-April-targets fix. mergedTargetsForLoc (above) is a
// single review-wide snapshot; mergedTargetsForLocMonth resolves PER (year, month) from
// ds.allMonthlyTargets, so a target uploaded for one month can never silently apply to
// another month in the same review.
describe('mergedTargetsForLocMonth — per-period lookup, no cross-month leakage', () => {
  const ds = {
    targets: { '3708': { tLabor: 0.23 } }, // yearly floor under every month
    allMonthlyTargets: {
      '2026-4': { '3708': { tLabor: 0.21, _year: 2026, _month: 4 } }, // April only
      '2026-6': { '3708': { tLabor: 0.19, _year: 2026, _month: 6 } }, // June only
    },
  };

  it("resolves each month's OWN target, not a neighboring month's", () => {
    expect(mergedTargetsForLocMonth(ds, '3708', 2026, 4).tLabor).toBe(0.21);
    expect(mergedTargetsForLocMonth(ds, '3708', 2026, 6).tLabor).toBe(0.19);
  });

  it('falls through to the yearly target for a month with no allMonthlyTargets entry at all (the pre-April case)', () => {
    // No 2026-1 entry in allMonthlyTargets → falls to ds.targets, not April's or June's value.
    expect(mergedTargetsForLocMonth(ds, '3708', 2026, 1).tLabor).toBe(0.23);
  });

  it('falls through to DEFAULT_TARGETS when neither yearly nor monthly has the field', () => {
    expect(mergedTargetsForLocMonth(ds, '3708', 2026, 1).tOepe).toBe(140);
  });

  it('does not let an un-stamped/different-period ds.monthlyTargets snapshot leak into a month it does not belong to', () => {
    const dsWithStaleSnap = {
      ...ds,
      monthlyTargets: { '3708': { tLabor: 0.99, _year: 2026, _month: 4 } }, // stamped for April
    };
    // Requesting June: the April-stamped snapshot must NOT apply; June's own allMonthlyTargets wins.
    expect(mergedTargetsForLocMonth(dsWithStaleSnap, '3708', 2026, 6).tLabor).toBe(0.19);
    // Requesting April: the (matching) snapshot DOES win, same as the old single-snapshot behavior.
    expect(mergedTargetsForLocMonth(dsWithStaleSnap, '3708', 2026, 4).tLabor).toBe(0.99);
  });
});

describe('autoPopulateKPIs — per-month targets do not leak across months (dispatch #109 item #4)', () => {
  it("fills each month's laborTgt from that SAME month's allMonthlyTargets entry", () => {
    // tCrewLabor, not tLabor — dispatch #142 items 2/3 switched REVIEW_METRIC_TARGET_FIELD.labor
    // to the org's authoritative labor basis (labor-basis.js), the field a real monthly
    // workbook upload actually persists (monthly_targets.crew_labor_pct).
    const ds = {
      loaded: true,
      allMonthlyTargets: {
        '2026-4': { '3708': { tCrewLabor: 0.24, _year: 2026, _month: 4 } },
        '2026-6': { '3708': { tCrewLabor: 0.19, _year: 2026, _month: 6 } },
        // 2026-5 deliberately absent — must fall through to DEFAULT_TARGETS.tCrewLabor (0.21),
        // NOT to April's 0.24 or June's 0.19.
      },
    };
    const r = autoPopulateKPIs(review(), ds);
    expect(r.kpis.months[4].laborTgt).toBe(0.24);
    expect(r.kpis.months[5].laborTgt).toBe(0.21); // DEFAULT_TARGETS fallback, not a neighbor's value
    expect(r.kpis.months[6].laborTgt).toBe(0.19);
  });
});

describe('autoPopulateKPIs target auto-fill (Notes 32 A)', () => {
  it('fills OEPE/R2P/KVS/Labor/Sales/OpSupplies/TPPH targets from official targets', () => {
    const r = autoPopulateKPIs(review(), { loaded: true });
    const jun = r.kpis.months[6];
    expect(jun.oepeTgt).toBe(140);
    expect(jun.r2pTgt).toBe(95);
    expect(jun.kvsTgt).toBe(45);
    // Dispatch #142 items 2/3: labor now resolves tCrewLabor (the org's authoritative labor
    // basis, labor-basis.js DEFAULT_LABOR_BASIS), not the legacy static-only tLabor — 3708's
    // DEFAULT_TARGETS carries tCrewLabor:0.21 vs tLabor:0.22, so this value is the tell that
    // the fix is wired to the right field.
    expect(jun.laborTgt).toBe(0.21);
    expect(jun.salesVsTgtTgt).toBe(111513.16);
    expect(jun.opSuppliesTgt).toBeCloseTo(2938.76, 1);
    expect(jun.tpphTgt).toBe(5.6);
  });

  it('monthly target overrides the DEFAULT during auto-fill', () => {
    // tCrewLabor (not tLabor) is the field a real monthly workbook upload actually persists
    // (monthly_targets.crew_labor_pct) — dispatch #142 items 2/3.
    const r = autoPopulateKPIs(review(), { loaded: true, monthlyTargets: { '3708': { tCrewLabor: 0.20 } } });
    expect(r.kpis.months[3].laborTgt).toBe(0.20);
  });

  it('a monthly tCrewLabor override wins over a yearly tLabor value for the SAME month (dispatch #142 item 3 — monthly supersedes yearly)', () => {
    const ds = {
      loaded: true,
      targets: { '3708': { tLabor: 0.23 } }, // yearly workbook value (legacy field, still resolves)
      allMonthlyTargets: { '2026-6': { '3708': { tCrewLabor: 0.195, _year: 2026, _month: 6 } } },
    };
    const r = autoPopulateKPIs(review(), ds);
    expect(r.kpis.months[6].laborTgt).toBe(0.195); // monthly wins, not the yearly 0.23
  });

  it('does not override a target already present on the month', () => {
    const rv = review(); rv.kpis.months[6].oepeTgt = 999;
    const r = autoPopulateKPIs(rv, { loaded: true });
    expect(r.kpis.months[6].oepeTgt).toBe(999);
  });

  it('every DEFAULT_TARGETS-native mapped target field actually exists for a real store', () => {
    // These predate dispatch #109 and live in DEFAULT_TARGETS (constants.js) itself.
    // tCrewLabor (not tLabor) since dispatch #142 items 2/3 — see REVIEW_METRIC_TARGET_FIELD.labor.
    const NATIVE = ['tOepe', 'tR2p', 'tKvst', 'tCrewLabor', 'tProdSales', 'tOpSupply', 'tTpph'];
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

// Dispatch #142 item 5 — osat had real workbook data (tOsat, from parseYearlyTargets' Voice
// OSAT PACE column) but no REVIEW_METRIC_TARGET_FIELD entry at all, so osatTgt never filled
// even when officialTgts.tOsat was populated.
describe('autoPopulateKPIs osat target wiring (dispatch #142 item 5)', () => {
  it('maps osat -> tOsat and fills osatTgt from a yearly-workbook value', () => {
    expect(REVIEW_METRIC_TARGET_FIELD.osat).toBe('tOsat');
    const ds = { loaded: true, targets: { '3708': { tOsat: 0.82 } } };
    const r = autoPopulateKPIs(review(), ds);
    expect(r.kpis.months[6].osatTgt).toBeCloseTo(0.82, 6);
  });

  it('a monthly tOsat value wins over yearly for that month, same precedence as every other metric', () => {
    const ds = {
      loaded: true,
      targets: { '3708': { tOsat: 0.80 } },
      allMonthlyTargets: { '2026-6': { '3708': { tOsat: 0.85, _year: 2026, _month: 6 } } },
    };
    const r = autoPopulateKPIs(review(), ds);
    expect(r.kpis.months[6].osatTgt).toBeCloseTo(0.85, 6);
  });

  it('actual (SMG FullScale osat5) and target (tOsat, via parsePct) are on the same 0-1 scale — no unit mismatch', () => {
    const ds = {
      loaded: true,
      targets: { '3708': { tOsat: 0.82 } },
      smgFullscale: [{ loc: '3708', year: 2026, month: 6, osat5: 0.79 }],
    };
    const r = autoPopulateKPIs(review(), ds);
    const jun = r.kpis.months[6];
    expect(jun.osat).toBeCloseTo(0.79, 6);
    expect(jun.osatTgt).toBeCloseTo(0.82, 6);
  });
});

// Dispatch #142 items 1-3 — the legacy lr-based fallback added after the generic auto-fill
// loop only ever applies when officialTgts left the slot unresolved, never overriding a real
// workbook target (the exact bug being fixed: the old code did the reverse).
describe('autoPopulateKPIs Sales/Labor target precedence (dispatch #142 items 1-3)', () => {
  it('a real officialTgts value always wins over an lr-carried salesTgt/laborTgt, even if lr has one', () => {
    const ds = {
      loaded: true,
      targets: { '3708': { tProdSales: 650000, tCrewLabor: 0.19 } },
      laborRows: [{ loc: '3708', date: new Date('2026-06-05T00:00:00'), sales: 500000, salesTgt: 1, laborTgt: 0.99 }],
    };
    const r = autoPopulateKPIs(review(), ds);
    const jun = r.kpis.months[6];
    expect(jun.salesVsTgtTgt).toBe(650000); // officialTgts, NOT the lr salesTgt of 1
    expect(jun.laborTgt).toBeCloseTo(0.19, 6); // officialTgts, NOT the lr laborTgt of 0.99
  });

  it('falls back to an lr-carried salesTgt/laborTgt only when officialTgts genuinely has nothing for that slot', () => {
    // No DEFAULT_TARGETS entry for this made-up loc, no yearly/monthly — officialTgts resolves
    // to {} for both fields.
    const loc = '99999';
    const rv = { loc, year: 2026, half: 'H1', role: 'GM', kpis: { months: blankMonths() } };
    const ds = {
      loaded: true,
      laborRows: [{ loc, date: new Date('2026-06-05T00:00:00'), sales: 50000, salesTgt: 48000, laborTgt: 0.21 }],
    };
    const r = autoPopulateKPIs(rv, ds);
    const jun = r.kpis.months[6];
    expect(jun.salesVsTgtTgt).toBe(48000);
    expect(jun.laborTgt).toBeCloseTo(0.21, 6);
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
    // fob$ = (tFOBTarget 0.0385 - 0.05) * 100000 = -1150; labor$ = (tCrewLabor 0.21 - 0.21) *
    // 100000 = 0 (dispatch #142 items 2/3 switched the labor target basis from tLabor 0.22 to
    // tCrewLabor 0.21 — 3708's DEFAULT_TARGETS carries both, and they legitimately differ);
    // opSupply$ = tOpSupply 2938.761005 - 3200 = -261.238995 → total = -1411.238995
    expect(jun.totalProfit).toBeCloseTo(-1411.24, 1);
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
