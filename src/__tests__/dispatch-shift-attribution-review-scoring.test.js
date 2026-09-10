// @ts-nocheck
// Backlog item "DM/shift-role review wiring — link a review to geid, decide which
// manager-attributed metrics score it" was marked open ("the only real open piece" left of
// that feature) as of the 2026-09-06 backlog cut. Reading engine/review-engine.js directly
// (autoPopulateKPIs, ~line 1620-1833) shows this is actually fully built: review.geid links a
// review to a manager, SHIFT_ATTRIBUTABLE_ROLES (['AM','DM','SM']) gates which roles can
// attribute at all (GM/AS/OM always stay store-total), and the manager's own
// ds.shiftManagerRows figures for OEPE/R2P/KVS/Labor% (the rate/time metrics that compare
// fairly to a store target) override the store-total value after it's filled -- sales/
// digital/delivery deliberately stay store-total (notes-33-queue A#3's own rationale: "a
// shift lead isn't graded on the store's monthly sales target").
//
// No existing test exercised this end-to-end (dispatch-152's own geid tests only cover
// blankReview's default-null state, not autoPopulateKPIs actually reading shiftManagerRows) --
// per this repo's "would this verification still pass if reverted" rule, that means a
// regression here (e.g. the override silently stops firing, or GM/AS/OM start attributing too)
// would ship unnoticed. This closes that gap; it does not change any behavior.
import { describe, it, expect } from 'vitest';
import { autoPopulateKPIs, SHIFT_ATTRIBUTABLE_ROLES } from '../engine/review-engine.js';

function blankMonths() {
  const m = {};
  for (let i = 1; i <= 12; i++) m[i] = {};
  return m;
}
const shiftManagerRow = (overrides) => ({
  loc: '3708', month: '2026-06', geid: 555,
  oepe: 90, r2p: 30, kvs: 4.2, laborPct: 0.24,
  ...overrides,
});

describe('DM/shift-role review scoring attribution (autoPopulateKPIs, notes-33-queue A#3)', () => {
  it('a shift-attributable role (DM/AM/SM) linked via geid gets the MANAGER\'S OWN OEPE/R2P/KVS/Labor%, not the store total', () => {
    const review = {
      loc: '3708', year: 2026, role: 'DM', geid: 555, kpis: { months: blankMonths() },
    };
    const ds = { loaded: true, shiftManagerRows: [shiftManagerRow()] };
    const r = autoPopulateKPIs(review, ds);
    const mo = r.kpis.months[6];
    expect(mo.oepe).toBe(90);
    expect(mo.r2p).toBe(30);
    expect(mo.kvs).toBe(4.2);
    expect(mo.labor).toBe(0.24);
  });

  it('every SHIFT_ATTRIBUTABLE_ROLES entry attributes -- exhaustive over the real list, not a hardcoded single case', () => {
    for (const role of SHIFT_ATTRIBUTABLE_ROLES) {
      const review = { loc: '3708', year: 2026, role, geid: 555, kpis: { months: blankMonths() } };
      const ds = { loaded: true, shiftManagerRows: [shiftManagerRow()] };
      const mo = autoPopulateKPIs(review, ds).kpis.months[6];
      expect(mo.oepe, `role "${role}" should attribute to the manager's own OEPE`).toBe(90);
    }
  });

  it('a GM review is NEVER attributed even with a matching geid+shiftManagerRows -- GM owns the whole store', () => {
    const review = {
      loc: '3708', year: 2026, role: 'GM', geid: 555, kpis: { months: blankMonths() },
    };
    const ds = { loaded: true, shiftManagerRows: [shiftManagerRow()] };
    const mo = autoPopulateKPIs(review, ds).kpis.months[6];
    // Store-total resolvers have nothing else in this fixture (no qsrActSummaryRows etc.),
    // so a GM review must stay null/undefined here -- if it picked up 90, the role gate broke.
    expect(mo.oepe).not.toBe(90);
  });

  it('a shift-attributable role with NO geid set (store-total review) is not attributed either', () => {
    const review = {
      loc: '3708', year: 2026, role: 'DM', geid: null, kpis: { months: blankMonths() },
    };
    const ds = { loaded: true, shiftManagerRows: [shiftManagerRow()] };
    const mo = autoPopulateKPIs(review, ds).kpis.months[6];
    expect(mo.oepe).not.toBe(90);
  });

  it('a geid that matches no row in shiftManagerRows (wrong manager) does not attribute', () => {
    const review = {
      loc: '3708', year: 2026, role: 'DM', geid: 999, kpis: { months: blankMonths() },
    };
    const ds = { loaded: true, shiftManagerRows: [shiftManagerRow()] }; // geid: 555, not 999
    const mo = autoPopulateKPIs(review, ds).kpis.months[6];
    expect(mo.oepe).not.toBe(90);
  });

  it('sales stays store-total even for an attributed shift review -- volume metrics are deliberately NOT overridden', () => {
    const review = {
      loc: '3708', year: 2026, role: 'DM', geid: 555, kpis: { months: blankMonths() },
    };
    // Store-wide sales source (qsrActSummaryRows, auto-first) -- confirms this month's sales
    // actual comes from the STORE stream, not shiftManagerRows (which carries no sales field
    // at all in this fixture, so a wrongly-wired override would leave it null, not wrong --
    // the real assertion is that the store total DOES land here untouched).
    const ds = {
      loaded: true,
      shiftManagerRows: [shiftManagerRow()],
      qsrActSummaryRows: [{ loc: '3708', date: '2026-06-15', sales: 5000, allNetSales: 5000 }],
    };
    const mo = autoPopulateKPIs(review, ds).kpis.months[6];
    expect(mo.oepe).toBe(90); // rate metric: attributed
    expect(mo.salesVsTgt).toBeGreaterThan(0); // volume metric: store-total, not overridden to null/absent
  });

  it('padding-agnostic loc match: shiftManagerRows.loc unpadded still matches a review.loc the same way qsr_daily_activity zero-pads elsewhere', () => {
    const review = {
      loc: '0003708', year: 2026, role: 'DM', geid: 555, kpis: { months: blankMonths() },
    };
    const ds = { loaded: true, shiftManagerRows: [shiftManagerRow({ loc: '3708' })] }; // bare, review.loc zero-padded
    const mo = autoPopulateKPIs(review, ds).kpis.months[6];
    expect(mo.oepe).toBe(90);
  });
});
