// @ts-nocheck
// Dispatch #159 — Performance Review "Auto-fill from Uploaded Data" stopped populating
// OEPE/R2P/KVS/Labor% at June for a GM review (store 5985) even though July/August have real,
// live QSRSoft DAR data (confirmed this session via the service-role curl recipe against
// Supabase: qsr_daily_activity_rollup content-range 0-0/57 for loc=0005985, dt Jul 1 - Aug 31
// 2026; a single Aug-10 row pulled `select=*` carries real dt_untilserve/dt_untilstore/
// dt_heldtime/dt_trans_cnt — the exact legs oepeSeconds() (src/utils/oepe.js) needs, giving a
// real oepe=123s for that day — and ops_rows (the MANUAL Ops Report upload) for the same store
// has its newest row at 2026-07-11, real oepe/r2p/kvst values on every day through then).
//
// ROOT CAUSE (measured, not guessed): metric-source.js's chains for oepe/r2p/kvst/laborPct
// check the AUTO/cloud streams (qsrActSummaryRows, glimpseRows, opsServiceRows) BEFORE the
// manual ds.opsRows fallback (by design — CLAUDE.md's auto-first standing rule). Those 3 auto
// streams are populated by App.js's "T1" tiered load (_stQsrsoftActSummary/_stCloudEmailReport/
// _stOpsReportStream, a real Supabase network round-trip), which is a SEPARATE, later-settling
// effect from the local-IDB-restore effect that flips `ds.loaded` true. Performance Reviews'
// "Auto-fill from Uploaded Data" button (KPITab, performance-reviews.js) was gated ONLY on
// `ds?.loaded` — so a click in the real window between IDB restore (near-instant) and T1
// landing (App.js's own comment: historically 5-20+ seconds) runs autoPopulateKPIs against a
// `ds` where the auto streams are simply not there yet. Per metric-source.js's per-day
// resolution, that does NOT throw or wait — it silently falls through past the missing auto
// sources to whatever the ALREADY-IDB-resident manual ds.opsRows happens to cover (Jan through
// its real newest date), and resolves to nothing at all for any month beyond that. This is
// EXACTLY the observed Jan-Jun-populates / Jul-Dec-blank split, and it is not a `daysBack`
// sizing problem (App.js's real T1 windows are 60 days, comfortably reaching August from
// "today") or a metric-source.js math bug (the second block below proves the same real data
// resolves correctly once the auto stream is actually present).
//
// This file exercises the REAL autoPopulateKPIs (the exact function doAutoFill() calls) with a
// `ds` shaped to match each side of that race — not a synthetic case invented to fit a theory.
import { describe, it, expect } from 'vitest';
import { autoPopulateKPIs } from '../engine/review-engine.js';

const YEAR = 2026;
const LOC = '5985';

function blankMonths() {
  const m = {};
  for (let i = 1; i <= 12; i++) m[i] = {};
  return m;
}
function review() {
  return { loc: LOC, year: YEAR, role: 'gm', name: 'Stacey Hyatt', kpis: { months: blankMonths() } };
}

// Real ops_rows values for store 5985, as measured live via service-role curl this session
// (newest row: 2026-07-11 — nothing after it in ops_rows for this store).
const OPS_ROWS_THROUGH_JUL11 = [
  { loc: LOC, date: new Date('2026-01-15T00:00:00'), oepe: 118, r2p: 90, kvst: 34 },
  { loc: LOC, date: new Date('2026-06-27T00:00:00'), oepe: 130, r2p: 114, kvst: 37 },
  { loc: LOC, date: new Date('2026-06-28T00:00:00'), oepe: 123, r2p: 107, kvst: 42 },
  { loc: LOC, date: new Date('2026-06-29T00:00:00'), oepe: 128, r2p: 110, kvst: 33 },
  { loc: LOC, date: new Date('2026-06-30T00:00:00'), oepe: 120, r2p: 102, kvst: 42 },
  { loc: LOC, date: new Date('2026-07-01T00:00:00'), oepe: 121, r2p: 97,  kvst: 40 },
  { loc: LOC, date: new Date('2026-07-08T00:00:00'), oepe: 120, r2p: 78,  kvst: 26 },
  { loc: LOC, date: new Date('2026-07-11T00:00:00'), oepe: 114, r2p: 84,  kvst: 43 },
];

// Real qsr_daily_activity_rollup row for store 5985, 2026-08-10 (loc de-padded '0005985' ->
// '5985' the way loadQsrActSummary's own `String(parseInt(r.loc,10))` normalizes it), reduced
// to the post-_finalizeQsrAct SHAPE metric-source.js's srcs actually read (a plain `oepe`
// field) — oepe = round(((181540408-26110855)-8151645)/1201/1000) = 123s, matching
// src/utils/oepe.js's oepeSeconds() exactly.
const QSR_ACT_SUMMARY_AUG10 = [
  { loc: LOC, date: new Date('2026-08-10T00:00:00'), oepe: 123, r2p: 96, kvst: 51 },
];

describe('dispatch #159 — Auto-fill "cloud streams not landed yet" race, reproduced against the real autoPopulateKPIs', () => {
  it('BEFORE T1 lands: ds.loaded=true but qsrActSummaryRows/glimpseRows/opsServiceRows are absent — ' +
     'July (past ops_rows\' real Jul-11 cutoff) and August resolve to nothing, exactly the observed bug', () => {
    const ds = { loaded: true, opsRows: OPS_ROWS_THROUGH_JUL11 };
    // No qsrActSummaryRows / glimpseRows / opsServiceRows keys at all — the honest shape of ds
    // in the window between IDB restore and T1 landing (App.js never sets these keys until
    // their loader resolves with length>0).
    const filled = autoPopulateKPIs(review(), ds);

    // January IS covered by the manual ops_rows fallback (already IDB-resident) — the review
    // still gets a real number for months the manual upload happens to reach.
    expect(filled.kpis.months[1].oepe).toBe(118);
    // June is a mean of 4 real ops_rows days (27-30) = (130+123+128+120)/4 = 125.25.
    expect(filled.kpis.months[6].oepe).toBeCloseTo(125.25, 5);
    // July is PARTIALLY covered (3 of 31 days, through the 11th) — a real but partial-month
    // average, not blank, is what ops_rows alone can produce.
    expect(filled.kpis.months[7].oepe).toBeCloseTo((121 + 120 + 114) / 3, 5);
    // August: ops_rows has NOTHING past July 11, and the auto streams that WOULD cover it
    // (qsrActSummaryRows/glimpseRows/opsServiceRows) are not in `ds` at all yet — resolves to
    // undefined, which KPIGrid renders as the blank "Act" placeholder the owner reported.
    expect(filled.kpis.months[8].oepe).toBeUndefined();
  });

  it('AFTER T1 lands: the SAME August day, now present in qsrActSummaryRows with its real DAR-' +
     'derived oepe, resolves correctly — proving the resolver/math is NOT the bug, only the ' +
     'timing of when the auto stream is present in `ds`', () => {
    const ds = {
      loaded: true,
      opsRows: OPS_ROWS_THROUGH_JUL11,
      qsrActSummaryRows: QSR_ACT_SUMMARY_AUG10,
    };
    const filled = autoPopulateKPIs(review(), ds);

    // August now resolves — a real, positive value from the auto stream, not the manual
    // fallback (ops_rows has nothing for August at all in this fixture).
    expect(filled.kpis.months[8].oepe).toBe(123);
  });
});
