// @ts-nocheck
// Mass-review notes 70 (2026-10-13) — owner-reported live: District View store tile's
// "Controls Integrity" scorecard showed "—" for every 2-Wk/4-Wk/6-Wk cell despite Target being
// populated, AND separately a Date-Range Comprehensive Report screenshot showed every one of 26
// stores at an identical "75/100" CTRL score regardless of wildly different real performance.
//
// Root cause, confirmed live (Supabase service-role read of qsr_cash_sheet for store 3708,
// 2026-10-13): compute6wk()'s `_cov` coverage map counted ONLY raw manual ctrlRows/opsRows,
// never the auto-first metric-source.js chain (glimpseRows/opsCashRows/cashRows) that the
// VALUES themselves (via M()) already resolve through. A store with zero manual Controls
// uploads — the normal case per this repo's "Auto/emailed-first" standing rule — read cov=0 for
// every field even when real data existed, which (a) blanked CtrlScorecard's UI to all "—" and
// (b) made computeCtrlScore (pipeline.js) skip every component, collapsing to the same
// degenerate 75/100 (3 of 40 points — the one flat allowance — over the 4 points left once
// every "else max-=N" branch fires) for every store, real performance notwithstanding.
//
// This test renders the REAL compute6wk -> computeCtrlScore chain (not a mocked _cov), per this
// repo's "would this verification still pass if reverted?" standing rule — a test that only
// hand-built a correct _cov object (like pipeline-ctrl-score.test.js's existing suite) would
// still pass even if compute6wk's own _cov construction regressed back to manual-rows-only.
import { describe, it, expect } from 'vitest';
import { compute6wk } from '../engine/forecast.js';
import { DEF_SETTINGS } from '../constants.js';

globalThis.window = globalThis.window || {};
const { computeCtrlScore } = await import('../engine/pipeline.js');

const LOC = '3708';
function makeDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d;
}

describe('compute6wk _cov -- auto-sourced Controls data, zero manual ctrlRows (dispatch 2026-10-13)', () => {
  it('a store with real opsCashRows but NO manual ctrlRows gets real coverage, not cov=0', () => {
    // Mirrors the real shape loadOpsCashSheet() produces (src/lib/supabase.js) -- camelCase
    // fields, no ctrlRows counterpart at all.
    // cashOSPct's own metric-source.js chain resolves via a DERIVE (cashOSAmt ÷ netSalesAmt),
    // not a direct opsCashRows read -- cashOSAmt/netSalesAmt are what the real loadOpsCashSheet()
    // loader (src/lib/supabase.js) actually aliases onto the row, same as here.
    const opsCashRows = Array.from({ length: 10 }, (_, i) => ({
      loc: LOC, date: makeDate(i + 1),
      cashOSAmt: 3.5, netSalesAmt: 3500, tRedAPct: 0.001, tRedBPct: 0.02, drawerOpens: 60,
      discPct: 0.03, cashRefCnt: 1, posOverCnt: 2,
    }));
    const ds = {
      opsRows: [], opsByLoc: {}, ctrlRows: [], ctrlByLoc: {}, laborRows: [], laborByLoc: {},
      opsCashRows,
    };
    const r = compute6wk(LOC, ds, 6);

    // Before the fix: every one of these read 0 (obs6(ctrlL,...) on an empty ctrlRows array),
    // even though the value itself (r.cashOSPct etc, via M()) was already real and nonzero.
    expect(r._cov.cashOSPct).toBeGreaterThan(0);
    expect(r._cov.tRedAPct).toBeGreaterThan(0);
    expect(r._cov.drawerOpens).toBeGreaterThan(0);
    expect(r._cov.cashRefCnt).toBeGreaterThan(0);
    expect(r._cov.discPct).toBeGreaterThan(0);
    expect(r.cashOSPct).toBeCloseTo(0.001, 5);
    expect(r.drawerOpens).toBeCloseTo(60, 5);
  });

  it('end-to-end: computeCtrlScore no longer collapses to the degenerate 75/100 for a well-performing auto-sourced store', () => {
    const opsCashRows = Array.from({ length: 10 }, (_, i) => ({
      loc: LOC, date: makeDate(i + 1),
      cashOSAmt: 0.7, netSalesAmt: 3500, tRedAPct: 0.0005, tRedBPct: 0.01, drawerOpens: 40,
      discPct: 0.02, cashRefCnt: 0, posOverCnt: 1,
    }));
    const ds = {
      opsRows: [], opsByLoc: {}, ctrlRows: [], ctrlByLoc: {}, laborRows: [], laborByLoc: {},
      opsCashRows,
    };
    const r = compute6wk(LOC, ds, 6);
    const cs = computeCtrlScore(r, DEF_SETTINGS.scoring);
    // A genuinely excellent, fully-auto-covered store must score as excellent -- not the flat
    // 75/100 every store read regardless of performance (the owner's live screenshot: 26 stores,
    // 26 identical CTRL scores).
    expect(cs).not.toBe(75);
    expect(cs).toBeGreaterThanOrEqual(85);
  });

  it('a store with genuinely NO data anywhere (auto or manual) still reads the pre-fix no-data floor, not a crash', () => {
    const ds = { opsRows: [], opsByLoc: {}, ctrlRows: [], ctrlByLoc: {}, laborRows: [], laborByLoc: {} };
    const r = compute6wk(LOC, ds, 6);
    expect(r._cov.cashOSPct).toBe(0);
    const cs = computeCtrlScore(r, DEF_SETTINGS.scoring);
    expect(cs).toBe(75); // the documented no-coverage-anywhere floor (3/4 flat-allowance points) -- a real absence, not a bug
  });
});
