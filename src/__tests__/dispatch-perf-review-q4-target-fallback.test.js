// @ts-nocheck
// Owner report (2026-09-02): "Performance Reviews aren't populating data for Q3/Q4," with a
// follow-up specifically about Q4 TARGETS — since targets are typically set in advance, should
// Q4 (Oct/Nov/Dec 2026 — not yet current, and monthly_targets genuinely has no rows for those
// months yet, measured live via service-role curl: content-range 0-0/34 for month=9, `*/0` for
// months 10-12) still show a target, falling back to the store's yearly workbook figure?
//
// MEASURED (service-role curl against the real Supabase project, `yearly_targets` table,
// year=2026, all 27 stores): oepe_pace/r2p_pace/kvs_pace/labor_pct/tpph_target/fob_target_pct/
// voice_osat_pct/voice_ead_pct/dig_app_gcrd/mcd_gcrd/shift_leader_target/headcount_target/
// turnover_crew_090_pct all carry real, non-null values for every store. prod_sales and
// crew_labor_pct are null for every one of the 27 rows — no pipeline has ever populated them
// (dispatch #142 added the COLUMNS; nothing has ever WRITTEN a non-null value into them,
// because the yearly workbook parser has no annual Sales$ or Labor% column to source them
// from — only the monthly workbook ever carries a Sales$/Labor% figure, which tracks real
// seasonal swings a single annual number couldn't represent honestly).
//
// This file proves mergedTargetsForLocMonth's existing DEFAULT < yearly < monthly < override
// cascade (review-engine.js) ALREADY does the right thing with that real data, for a month
// (October) with no monthly_targets row at all: every metric with a real yearly-tier value
// falls back to it correctly (the mechanism works end-to-end, exactly as designed — nothing to
// fix), and the two metrics with NO yearly-tier value anywhere in the live data (salesVsTgtTgt/
// tProdSales, laborTgt/tCrewLabor) correctly stay unresolved rather than being silently
// fabricated — there is no yearly figure to fall back TO for those two, so leaving them blank
// until a real monthly upload lands is correct, not a bug to paper over.
import { describe, it, expect } from 'vitest';
import { mergedTargetsForLocMonth } from '../engine/review-engine.js';

const LOC = '3708';
const YEAR = 2026;

// Real yearly_targets row for store 3708, year 2026 (measured live via service-role curl,
// reduced to the fields REVIEW_METRIC_TARGET_FIELD maps to) — App.js's _stYearlyTargets hydrates
// ds.targets from exactly this shape (loadAllYearlyTargets -> _yearlyRowToTargets).
const targets = {
  [LOC]: {
    tOepe: 140, tR2p: 95, tKvst: 45, tKvsu: 0.7, tLabor: 0.22, tTpph: 5.6, tFOBTarget: 0.04,
    tOsat: 0.82, tVoiceEAD: 0.75, tDigAppGCRD: 265.1, tMcdGCRD: 61.3491758241758,
    tShiftLeaders: 8.7, tHeadcount: 68, tToCrew090: 0.2889,
    // Measured live: both null for every one of the 27 stores — no yearly-tier source exists.
    tProdSales: null, tCrewLabor: null,
    _year: 2026, _source: 'upload',
  },
};

describe('Q4 target auto-fill falls back to the yearly workbook — verified against real data shapes', () => {
  it('October 2026 (no monthly_targets row at all): every metric with a real yearly figure ' +
     'resolves from it, unchanged from a month that DOES have a monthly row', () => {
    const ds = { targets, allMonthlyTargets: {}, monthlyTargets: {} };
    const oct = mergedTargetsForLocMonth(ds, LOC, YEAR, 10);

    expect(oct.tOepe).toBe(140);
    expect(oct.tR2p).toBe(95);
    expect(oct.tKvst).toBe(45);
    expect(oct.tLabor).toBe(0.22);
    expect(oct.tTpph).toBe(5.6);
    expect(oct.tFOBTarget).toBe(0.04);
    expect(oct.tOsat).toBe(0.82);
    expect(oct.tVoiceEAD).toBe(0.75);
    expect(oct.tDigAppGCRD).toBe(265.1);
    expect(oct.tMcdGCRD).toBeCloseTo(61.349, 2);
    expect(oct.tShiftLeaders).toBe(8.7);
    expect(oct.tHeadcount).toBe(68);
    expect(oct.tToCrew090).toBeCloseTo(0.2889, 5);
  });

  it('October 2026: Sales$ and Labor% targets stay unresolved — no yearly OR monthly source ' +
     'exists for them yet, so nothing fabricates a number (tProdSales/tCrewLabor are the ' +
     'REVIEW_METRIC_TARGET_FIELD keys for salesVsTgt/labor)', () => {
    const ds = { targets, allMonthlyTargets: {}, monthlyTargets: {} };
    const oct = mergedTargetsForLocMonth(ds, LOC, YEAR, 10);

    expect(oct.tProdSales).toBeNull();
    expect(oct.tCrewLabor).toBeNull();
  });

  it('a month that DOES have a monthly_targets row (August) — sanity check the same two ' +
     'fields DO resolve once the monthly tier has real data, proving the gap above is a data ' +
     'gap (no Q4 upload yet), not a cascade bug', () => {
    const ds = {
      targets,
      allMonthlyTargets: { '2026-8': { [LOC]: { tProdSales: 322756.8795, tCrewLabor: 0.225 } } },
      monthlyTargets: {},
    };
    const aug = mergedTargetsForLocMonth(ds, LOC, YEAR, 8);
    expect(aug.tProdSales).toBe(322756.8795);
    expect(aug.tCrewLabor).toBe(0.225);
  });
});
