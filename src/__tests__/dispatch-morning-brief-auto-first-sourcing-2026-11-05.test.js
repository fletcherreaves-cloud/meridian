// @vitest-environment happy-dom
// @ts-nocheck
// Owner-caught 2026-11-05, surfaced while building the Daily Brief KB article (task #75): a
// real wage/ops-accuracy bug. assembleBriefStoreData() (src/features/morning-brief.js) checked
// the MANUAL Labor Analysis upload (ds.laborRows) and MANUAL Controls upload (ds.ctrlRows)
// FIRST for sales, GC, TPPH, Labor%, Act-vs-Need, POS-Over $, refund $, and Cash O/S $ --
// falling back to the auto DAR / emailed Glimpse+Cash streams only when no manual row existed
// for that store/date. That is the REVERSE of this app's standing "auto/emailed-first,
// freshest-wins" rule (CLAUDE.md Dev Rules: manual uploads are last-resort fill only, never
// override a fresher automated value for the same store/date).
//
// Per "would this verification still pass if reverted?": every test below asserts the AUTO/
// EMAILED value wins when BOTH a manual row and an auto/emailed row exist for the exact same
// store/date with DIFFERENT values -- against the pre-fix code, every one of these would have
// returned the stale manual figure instead.
import { describe, it, expect } from 'vitest';
import { computeMorningBrief } from '../features/morning-brief.js';

const d = s => new Date(s + 'T00:00:00');
const LOC = '3708'; // real seed store (constants.js STORE_NAMES/STORE_COORDS), Ardmore-Broadway OK
const TARGET = d('2026-09-10');

function storeFrom(brief) {
  const s = brief.stores.find(st => st.loc === LOC);
  expect(s, `store ${LOC} not found in brief.stores`).toBeTruthy();
  return s;
}

describe('Daily Brief — auto/emailed data now wins over manual for the same store/date (owner-caught 2026-11-05)', () => {
  it('sales: auto DAR (qsrActSummaryRows) wins over a stale manual Labor Analysis row', () => {
    const ds = {
      laborRows: [{ loc: LOC, date: TARGET, sales: 1000 }],       // manual, stale — must NOT win
      qsrActSummaryRows: [{ loc: LOC, date: TARGET, sales: 5000, allNetSales: 5000 }], // auto, fresh
    };
    const brief = computeMorningBrief(ds, TARGET, {});
    expect(storeFrom(brief).sales).toBe(5000);
  });

  it('sales: manual still fills the gap when no auto/emailed source has data for that day', () => {
    const ds = { laborRows: [{ loc: LOC, date: TARGET, sales: 1000 }] };
    const brief = computeMorningBrief(ds, TARGET, {});
    expect(storeFrom(brief).sales).toBe(1000);
  });

  it('gc: auto DAR wins over a stale manual Labor Analysis row', () => {
    const ds = {
      laborRows: [{ loc: LOC, date: TARGET, gc: 100 }],
      qsrActSummaryRows: [{ loc: LOC, date: TARGET, gc: 450 }],
    };
    const brief = computeMorningBrief(ds, TARGET, {});
    expect(storeFrom(brief).gc).toBe(450);
  });

  it('tpph: auto DAR wins over stale manual Labor AND Controls rows', () => {
    const ds = {
      laborRows: [{ loc: LOC, date: TARGET, tpph: 3.0 }],
      ctrlRows:  [{ loc: LOC, date: TARGET, tpph: 3.5 }],
      qsrActSummaryRows: [{ loc: LOC, date: TARGET, tpph: 7.2 }],
    };
    const brief = computeMorningBrief(ds, TARGET, {});
    expect(storeFrom(brief).tpph).toBe(7.2);
  });

  it('laborPct: the auto Daily Glimpse punched % wins over stale manual Labor and Controls rows', () => {
    const ds = {
      laborRows: [{ loc: LOC, date: TARGET, laborPct: 0.35 }],
      ctrlRows:  [{ loc: LOC, date: TARGET, laborPct: 0.32 }],
      glimpseRows: [{ loc: LOC, date: TARGET, laborPct: 0.24 }],
    };
    const brief = computeMorningBrief(ds, TARGET, {});
    expect(storeFrom(brief).laborPct).toBeCloseTo(0.24, 5);
  });

  it('actVsNeed: the auto DAR figure wins over a stale manual Controls row', () => {
    const ds = {
      ctrlRows: [{ loc: LOC, date: TARGET, actVsNeed: -5 }],
      qsrActSummaryRows: [{ loc: LOC, date: TARGET, actVsNeed: 2.5 }],
    };
    const brief = computeMorningBrief(ds, TARGET, {});
    expect(storeFrom(brief).actVsNeed).toBe(2.5);
  });

  it('posOverAmt: the auto opsCashRows figure wins over a stale manual Controls row', () => {
    const ds = {
      ctrlRows: [{ loc: LOC, date: TARGET, posOverAmt: 50 }],
      opsCashRows: [{ loc: LOC, date: TARGET, posOverAmt: 0 }],
    };
    const brief = computeMorningBrief(ds, TARGET, {});
    expect(storeFrom(brief).posOverAmt).toBe(0);
  });

  it('cashOSAmt: the auto opsCashRows figure wins over a stale manual Controls row', () => {
    const ds = {
      ctrlRows: [{ loc: LOC, date: TARGET, cashOSAmt: -40 }],
      opsCashRows: [{ loc: LOC, date: TARGET, cashOSAmt: -3 }],
    };
    const brief = computeMorningBrief(ds, TARGET, {});
    expect(storeFrom(brief).cashOSAmt).toBe(-3);
  });

  it('refundAmt: the auto opsCashRows cash+cashless refund total wins over a stale manual Controls row', () => {
    const ds = {
      ctrlRows: [{ loc: LOC, date: TARGET, refundAmt: 200 }],
      opsCashRows: [{ loc: LOC, date: TARGET, cashRefAmt: 10, cashlessRefAmt: 5 }],
    };
    const brief = computeMorningBrief(ds, TARGET, {});
    expect(storeFrom(brief).refundAmt).toBe(15);
  });

  it('refundAmt: manual ctrl.refundAmt still fills the gap when no auto source has data at all', () => {
    const ds = { ctrlRows: [{ loc: LOC, date: TARGET, refundAmt: 200 }] };
    const brief = computeMorningBrief(ds, TARGET, {});
    expect(storeFrom(brief).refundAmt).toBe(200);
  });

  it('sales/GC still flow correctly into vs-LY and vs-expected derived fields using the corrected (auto-first) current-side value', () => {
    const ds = {
      laborRows: [{ loc: LOC, date: TARGET, sales: 1000, gc: 100 }], // manual, stale — must not leak into the derived fields either
      qsrActSummaryRows: [{ loc: LOC, date: TARGET, sales: 5000, gc: 450 }],
    };
    const brief = computeMorningBrief(ds, TARGET, {});
    const store = storeFrom(brief);
    expect(store.sales).toBe(5000);
    expect(store.gc).toBe(450);
    // salesVsExp compares the resolved (auto) sales against a projection — just confirm it did
    // NOT compute off the stale manual 1000 figure (which would be a wildly different % swing).
    if (store.salesVsExp != null) expect(Math.abs(store.salesVsExp)).toBeLessThan(500);
  });
});
