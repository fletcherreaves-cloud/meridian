// @ts-nocheck
// Owner report (2026-09-02): "Performance Reviews aren't populating data for Q3/Q4."
//
// MEASURED against live Supabase (service-role curl + the REAL autoPopulateKPIs/
// mergedTargetsForLocMonth, fed real July/August 2026 rows for store 3708): Q3's primary
// weighted metrics (OEPE/R2P/KVS/Labor%/Sales — all sourced from App.js's "T1" tier:
// qsrActSummaryRows/glimpseRows) DO auto-fill correctly from real cloud data once T1 has
// landed, and Q4's targets for every yearly-workbook-backed metric (OEPE/R2P/KVS/TPPH/FOB/
// OSAT/EAD/Digital/Delivery/Headcount/Turnover/Shift-Cert) already fall back to the yearly
// tier correctly (mergedTargetsForLocMonth's DEFAULT < yearly < monthly < override cascade)
// — Q4 target cells are NOT stuck blank for those. Q4's ACTUALS are correctly blank (no data
// exists yet — Oct/Nov/Dec 2026 haven't happened; confirmed zero rows across
// qsr_daily_activity_rollup/daily_glimpse_daily/lifelenz_schedule for that window). Q4's Sales$
// and Labor% TARGETS stay blank only because yearly_targets.prod_sales/crew_labor_pct are
// null for every one of the 27 live stores — a genuine, structural upstream gap (these two
// figures have never had a yearly-tier source; only the monthly workbook ever carries them),
// not a review-engine bug — see dispatch-perf-review-q4-target-fallback.test.js.
//
// What THIS file guards: a real, narrower race dispatch #159 (v-era) fixed for App.js's T1
// tier (qsrActSummaryRows/glimpseRows/opsServiceRows — the OEPE/R2P/KVS/Labor%/Sales chains)
// but left open for App.js's T2 tier, which autoPopulateKPIs ALSO reads: ds.smgFullscale
// (osat/eap), ds.rosterStatsRows/rosterRoleCounts/turnoverRows (headcount/shiftCert/
// turnover90), ds.digitalAppRows/mcdeliveryRows (digitalGC/delivGC/delivWait), ds.ebosRows
// (opSupplies), ds.qsrFobRows (the auto foodOB path). Before this session's App.js fix
// (cloudStreamsReady now flips after T2, not T1 — see App.js's `_t2.then` block), a click on
// "Auto-fill from Uploaded Data" in the window between T1 landing (button enables) and T2
// landing left these fields silently blank for any month T2 would have covered — same failure
// MODE as #159's original finding, just for a different set of sources, and not period-specific
// (any review, any month, not only Q3/Q4).
//
// This file exercises the REAL autoPopulateKPIs (the exact function doAutoFill() calls) with a
// `ds` shaped to match each side of that race for the T2-only sources.
import { describe, it, expect } from 'vitest';
import { autoPopulateKPIs } from '../engine/review-engine.js';

const YEAR = 2026;
const LOC = '3708';

function blankMonths() {
  const m = {};
  for (let i = 1; i <= 12; i++) m[i] = {};
  return m;
}
function review() {
  return { loc: LOC, year: YEAR, role: 'GM', name: 'Test GM', geid: null, kpis: { months: blankMonths() } };
}

// Real shapes (field names) each T2 loader produces (src/lib/supabase.js): loadSmgFullscale,
// loadRosterStatistics, loadRosterRoleCounts, loadTurnoverMonthly, loadDigitalAppMonthly,
// loadMcdeliveryMonthly, loadEbosDaily — reduced to the fields autoPopulateKPIs actually reads.
const T2_ROWS = {
  smgFullscale: [{ loc: LOC, year: YEAR, month: 8, osat5: 0.86, overallProblem: 0.05 }],
  rosterStatsRows: [{ loc: LOC, month: '2026-08', rosterActive: 62 }],
  rosterRoleCounts: [{ loc: LOC, month: '2026-08', shiftMgr: 9 }],
  turnoverRows: [{ loc: LOC, month: '2026-08', turnover090Pct: 0.24 }],
  digitalAppRows: [{ loc: LOC, month: '2026-08', appGcRd: 270.4 }],
  mcdeliveryRows: [{ loc: LOC, month: '2026-08', deliveryGcRd: 58.2, restaurantTimeSec: 240 }],
  ebosRows: [{ loc: LOC, date: new Date('2026-08-15T00:00:00'), opsPurchases: 1200 }],
};

describe('T2 auto-fill race (extends dispatch #159 to the sources it left uncovered)', () => {
  it('BEFORE T2 lands: ds.loaded=true and T1 sources present, but the T2-only sources ' +
     '(smgFullscale/roster*/turnover/digital/mcdelivery/ebos) are absent — OSAT, EAP, ' +
     'Headcount, Shift-Cert, Turnover, Digital GC/R/D, Delivery GC/R/D, Op Supplies all ' +
     'resolve to nothing for August, even though real data exists for that month', () => {
    const ds = { loaded: true, glimpseRows: [], qsrActSummaryRows: [], opsRows: [] };
    // No smgFullscale / rosterStatsRows / rosterRoleCounts / turnoverRows / digitalAppRows /
    // mcdeliveryRows / ebosRows keys at all — the honest shape of ds in the window between T1
    // landing (button enables under the old, T1-only gate) and T2 landing.
    const filled = autoPopulateKPIs(review(), ds);
    const aug = filled.kpis.months[8];

    expect(aug.osat).toBeUndefined();
    expect(aug.eap).toBeUndefined();
    expect(aug.headcount).toBeUndefined();
    expect(aug.shiftCert).toBeUndefined();
    expect(aug.turnover90).toBeUndefined();
    expect(aug.digitalGC).toBeUndefined();
    expect(aug.delivGC).toBeUndefined();
    expect(aug.delivWait).toBeUndefined();
    expect(aug.opSupplies).toBeUndefined();
  });

  it('AFTER T2 lands: the SAME August data, now present in ds, resolves correctly on every ' +
     'one of those fields — proving the resolver/math is not the bug, only the timing of ' +
     'when T2 sources are present in `ds`', () => {
    const ds = { loaded: true, glimpseRows: [], qsrActSummaryRows: [], opsRows: [], ...T2_ROWS };
    const filled = autoPopulateKPIs(review(), ds);
    const aug = filled.kpis.months[8];

    expect(aug.osat).toBe(0.86);
    expect(aug.eap).toBe(0.05);
    expect(aug.headcount).toBe(62);
    expect(aug.shiftCert).toBe(9);
    expect(aug.turnover90).toBe(0.24);
    expect(aug.digitalGC).toBe(270.4);
    expect(aug.delivGC).toBe(58.2);
    expect(aug.delivWait).toBe(240);
    expect(aug.opSupplies).toBe(1200);
  });
});
