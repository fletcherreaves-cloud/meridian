// @ts-nocheck
// Dispatch #161 — mo.foodOB (Performance Review FOB $ actual) now sources through
// fobByRange() against the auto-pulled qsr_fob stream (ds.qsrFobRows), same canonical
// aggregator the One-Pagers already use (v5.203), instead of hand-summing the manual
// ds.fobRows array unconditionally. Manual ds.fobRows stays as an explicit fallback ONLY
// for a month the auto source has nothing for.
//
// This is a fixture-based reproduction of this dispatch's own live reconciliation
// measurement (PR body): a real service-role Supabase read of qsr_fob vs fob_rows for
// loc 3708 (Dec'25–May'26) and loc 5183 (May'26) found the two sources matched to the
// penny for every store-month checked. The fixtures below encode a case where they
// DIVERGE, to prove the auto source is the one that wins, not merely that both happen
// to agree in production today.
import { describe, it, expect } from 'vitest';
import { autoPopulateKPIs } from '../engine/review-engine.js';

function blankMonths() {
  const m = {};
  for (let i = 1; i <= 12; i++) m[i] = {};
  return m;
}
const review = () => ({ loc: '3708', year: 2026, half: 'H1', role: 'GM', kpis: { months: blankMonths() } });

describe('dispatch #161 — autoPopulateKPIs foodOB sources qsr_fob (auto) over ds.fobRows (manual)', () => {
  it('auto qsr_fob wins over a DIVERGING manual ds.fobRows figure for the same month', () => {
    const ds = { loaded: true,
      // Auto stream (qsr_fob, loaded app-wide as ds.qsrFobRows) — dollar-amount shape.
      // A single mid-month snapshot is enough: fobByRange diffs against nothing for a
      // FULL calendar-month range (baseSnap stays null when segStart===monthStart), so
      // the raw component amounts on this one row ARE the month's fob$.
      qsrFobRows: [
        { loc: '3708', date: '2026-06-15', prodSalesAmt: 100000, compWasteAmt: 1000,
          rawWasteAmt: 0, condimentsAmt: 0, empMgrMealsAmt: 0, statVarianceAmt: 0, unexplainedAmt: 0 },
      ],
      // Manual Ops Report upload — different shape (fobPct/fobDollar, no *Amt fields),
      // deliberately set to a DIFFERENT dollar figure than the auto source above.
      fobRows: [
        { loc: '3708', date: new Date('2026-06-05T00:00:00'), fobPct: 0.05, fobDollar: 500 },
      ],
    };
    const r = autoPopulateKPIs(review(), ds);
    // Auto: Σcomponents = 1000 (only compWasteAmt is non-zero) — NOT the manual 500.
    expect(r.kpis.months[6].foodOB).toBe(1000);
  });

  it('falls back to manual ds.fobRows for a month the auto qsr_fob stream has nothing for', () => {
    const ds = { loaded: true,
      // Auto stream only covers a DIFFERENT month (May) — June has no qsr_fob rows at all.
      qsrFobRows: [
        { loc: '3708', date: '2026-05-15', prodSalesAmt: 90000, compWasteAmt: 900,
          rawWasteAmt: 0, condimentsAmt: 0, empMgrMealsAmt: 0, statVarianceAmt: 0, unexplainedAmt: 0 },
      ],
      fobRows: [
        { loc: '3708', date: new Date('2026-06-05T00:00:00'), fobPct: 0.05, fobDollar: 500 },
      ],
    };
    const r = autoPopulateKPIs(review(), ds);
    // June: auto has nothing → falls back to the manual figure.
    expect(r.kpis.months[6].foodOB).toBe(500);
    // May: auto DOES have data → auto wins (no manual row exists for May here, so this
    // also confirms the auto path alone, independent of any fallback, fills correctly).
    expect(r.kpis.months[5].foodOB).toBe(900);
  });

  it('falls back to manual ds.fobRows when ds.qsrFobRows is entirely absent (undefined)', () => {
    const ds = { loaded: true,
      fobRows: [
        { loc: '3708', date: new Date('2026-06-05T00:00:00'), fobPct: 0.05, fobDollar: 500 },
      ],
    };
    const r = autoPopulateKPIs(review(), ds);
    expect(r.kpis.months[6].foodOB).toBe(500);
  });

  it('does not leak another store\'s qsr_fob rows into this review\'s loc', () => {
    const ds = { loaded: true,
      qsrFobRows: [
        // Different store (5183), same month — must NOT be picked up for loc 3708.
        { loc: '5183', date: '2026-06-15', prodSalesAmt: 200000, compWasteAmt: 5000,
          rawWasteAmt: 0, condimentsAmt: 0, empMgrMealsAmt: 0, statVarianceAmt: 0, unexplainedAmt: 0 },
      ],
      fobRows: [
        { loc: '3708', date: new Date('2026-06-05T00:00:00'), fobPct: 0.05, fobDollar: 500 },
      ],
    };
    const r = autoPopulateKPIs(review(), ds);
    // qsr_fob has nothing for loc 3708 → falls back to 3708's own manual figure, not
    // 5183's auto figure.
    expect(r.kpis.months[6].foodOB).toBe(500);
  });
});
