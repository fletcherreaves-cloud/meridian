// @ts-nocheck
// Dispatch #174 — mo.salesVsTgt (Performance Review Sales actual) now sources through
// metric-source.js's already-registered auto-first 'sales' chain (qsrActSummaryRows
// sales/allNetSales, THEN ds.laborRows last), summed over the review month via
// Object.values(metricSeries(...)).reduce(...) — the same pattern already used elsewhere
// (src/views/sage.js, src/views/store-analytics.js) — instead of hand-summing ONLY the
// manual ds.laborRows array unconditionally, with zero auto/cloud fallback.
//
// Root cause (owner report, 2026-08-27, follow-up to #159): the live `labor_rows` table's
// most recent upload is 2026-07-23 — nearly 5 weeks stale — so Sales actual (and anything
// derived from it, incl. mo.foodOBTgt) silently went blank for every month after it, since
// mo.salesVsTgt previously had NO auto path at all, unlike oepe/r2p/kvs/laborPct (already
// auto-first per dispatch #109 item #3) or foodOB (switched to the auto qsr_fob stream by
// dispatch #161).
//
// Fixtures follow dispatch #159's own convention: a `ds` shaped to match each real side of
// the gap (auto stream present / auto stream absent), not a synthetic case invented to fit
// a theory.
import { describe, it, expect } from 'vitest';
import { autoPopulateKPIs } from '../engine/review-engine.js';

const YEAR = 2026;
const LOC = '3708'; // has a real DEFAULT_TARGETS entry (tFOBTarget: 0.0385) for the foodOBTgt test

function blankMonths() {
  const m = {};
  for (let i = 1; i <= 12; i++) m[i] = {};
  return m;
}
function review() {
  return { loc: LOC, year: YEAR, role: 'gm', name: 'Test GM', kpis: { months: blankMonths() } };
}

describe('dispatch #174 — autoPopulateKPIs salesVsTgt sources the auto sales chain (metric-source.js) over ds.laborRows (manual)', () => {
  it('populates mo.salesVsTgt from the auto qsrActSummaryRows stream for a month with NO manual ds.laborRows row at all — the real regression case', () => {
    const ds = { loaded: true,
      // Auto stream (qsr_daily_activity_rollup, loaded app-wide as ds.qsrActSummaryRows) —
      // three August days, no ds.laborRows for this store/month whatsoever (matching the
      // owner's live measurement: labor_rows' newest upload is 2026-07-23, nothing in
      // August).
      qsrActSummaryRows: [
        { loc: LOC, date: new Date('2026-08-03T00:00:00'), sales: 10000 },
        { loc: LOC, date: new Date('2026-08-04T00:00:00'), sales: 11000 },
        { loc: LOC, date: new Date('2026-08-05T00:00:00'), sales: 9500 },
      ],
      // No laborRows key at all — the honest shape of ds past the manual upload's real
      // last-upload date.
    };
    const filled = autoPopulateKPIs(review(), ds);
    expect(filled.kpis.months[8].salesVsTgt).toBe(10000 + 11000 + 9500);
  });

  it('falls back to the manual ds.laborRows sum unchanged when ONLY ds.laborRows has data (no auto source at all) — must not regress a genuinely manual-only store/month', () => {
    const ds = { loaded: true,
      laborRows: [
        { loc: LOC, date: new Date('2026-06-05T00:00:00'), sales: 12000 },
        { loc: LOC, date: new Date('2026-06-12T00:00:00'), sales: 13500 },
      ],
      // No qsrActSummaryRows / salesLedgerRows / any auto sales source for this store.
    };
    const filled = autoPopulateKPIs(review(), ds);
    expect(filled.kpis.months[6].salesVsTgt).toBe(12000 + 13500);
  });

  it('auto source wins over a DIVERGING manual ds.laborRows figure for the SAME day (per-day auto-first precedence inside metric-source.js\'s own registered chain)', () => {
    const ds = { loaded: true,
      qsrActSummaryRows: [
        { loc: LOC, date: new Date('2026-06-15T00:00:00'), sales: 20000 },
      ],
      laborRows: [
        // Same date, deliberately different figure — metric-source.js's per-day resolver
        // must pick the auto source (qsrActSummaryRows is earlier in the 'sales' chain),
        // not sum or average the two.
        { loc: LOC, date: new Date('2026-06-15T00:00:00'), sales: 500 },
      ],
    };
    const filled = autoPopulateKPIs(review(), ds);
    expect(filled.kpis.months[6].salesVsTgt).toBe(20000);
  });

  it('a day the auto source has nothing for, but ds.laborRows DOES cover, still contributes to the monthly total (per-day blend within the SAME chain, not an all-or-nothing month choice)', () => {
    const ds = { loaded: true,
      qsrActSummaryRows: [
        { loc: LOC, date: new Date('2026-06-15T00:00:00'), sales: 20000 },
      ],
      laborRows: [
        // A DIFFERENT day than the auto row — no auto coverage for the 5th, so that day's
        // manual figure fills the gap (metric-source.js's chain already carries laborRows
        // as its own last-resort source, per-day).
        { loc: LOC, date: new Date('2026-06-05T00:00:00'), sales: 500 },
      ],
    };
    const filled = autoPopulateKPIs(review(), ds);
    expect(filled.kpis.months[6].salesVsTgt).toBe(20000 + 500);
  });

  it('does not leak another store\'s qsrActSummaryRows rows into this review\'s loc (falls back to this loc\'s own manual figure instead)', () => {
    const ds = { loaded: true,
      qsrActSummaryRows: [
        // Different store, same month — must NOT be picked up for LOC.
        { loc: '9999', date: new Date('2026-06-15T00:00:00'), sales: 99999 },
      ],
      laborRows: [
        { loc: LOC, date: new Date('2026-06-05T00:00:00'), sales: 500 },
      ],
    };
    const filled = autoPopulateKPIs(review(), ds);
    expect(filled.kpis.months[6].salesVsTgt).toBe(500);
  });

  it('mo.foodOBTgt (FOB $ target, derived FROM salesVsTgt) resolves correctly once salesVsTgt does, for a month that was previously blank under the bug', () => {
    // LOC '3708' DEFAULT_TARGETS carries tFOBTarget: 0.0385 (src/constants.js). Before this
    // fix, a month with no ds.laborRows row left mo.salesVsTgt (and therefore mo.foodOBTgt,
    // which multiplies officialTgts.tFOBTarget * mo.salesVsTgt) both null/undefined.
    const ds = { loaded: true,
      qsrActSummaryRows: [
        { loc: LOC, date: new Date('2026-08-03T00:00:00'), sales: 10000 },
        { loc: LOC, date: new Date('2026-08-04T00:00:00'), sales: 11000 },
      ],
      // No laborRows for August — this is exactly the month the bug used to blank.
    };
    const filled = autoPopulateKPIs(review(), ds);
    const mo = filled.kpis.months[8];
    expect(mo.salesVsTgt).toBe(21000);
    expect(mo.foodOBTgt).toBeCloseTo(0.0385 * 21000, 5);
  });

  it('the legacy manual-only salesVsTgtTgt/laborTgt lr-based TARGET fallback (dispatch #142, already dead per its own comment) is unaffected by this change', () => {
    // No parser or Supabase table ever emits salesTgt/tSales/laborTgt/tCombLabor on a labor
    // row (confirmed by dispatch #142's own comment in review-engine.js), so this stays a
    // no-op today either way — this test just confirms the salesVsTgt fix didn't disturb it:
    // officialTgts (DEFAULT_TARGETS-derived, since no ds.targets/allMonthlyTargets/snapshot
    // is provided here) still wins the salesVsTgtTgt slot via the generic target-fill loop,
    // not the dead lr-based fallback below it.
    const ds = { loaded: true,
      qsrActSummaryRows: [
        { loc: LOC, date: new Date('2026-08-03T00:00:00'), sales: 10000 },
      ],
      laborRows: [
        // Same day as the auto row, so the auto figure must win for it outright; the
        // legacy salesTgt field must not leak into salesVsTgt (a different, ACTUAL-side
        // field) even if a labor row somehow carried one.
        { loc: LOC, date: new Date('2026-08-03T00:00:00'), sales: 1, salesTgt: 999999 },
      ],
    };
    const filled = autoPopulateKPIs(review(), ds);
    // salesVsTgt resolves to the auto figure for the day both sources cover (10000, not
    // 1), and the dead salesTgt field never contaminates it.
    expect(filled.kpis.months[8].salesVsTgt).toBe(10000);
  });
});
