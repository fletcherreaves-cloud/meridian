import { describe, it, expect } from 'vitest';
import { DEFAULT_TARGETS, DEF_SETTINGS } from '../constants.js';
import { TOL_METRICS, TOL_ROLLUP_METRICS, tolStatusesForStore } from '../engine/tolerance-status.js';

// pipeline.js transitively imports morning-brief.js, which assigns `window.onerror` at module
// top level -- same stub as dispatch-94-phase3-findings.test.js / pipeline-sales-decline.test.js.
globalThis.window = globalThis.window || {};
const { buildStore } = await import('../engine/pipeline.js');

// Dispatch #115 -- tolerance-status.js's baseFd check compared totalBaseFood/sales (the
// QSRSoft Food-Over-Base report's "Base Food" line -- a broad THEORETICAL food-cost basis,
// real district magnitude ~21-24% of sales) against tFOBBase (the yearly workbook's narrow
// "Base Food %" variance-tolerance target, ~3.8-4.6%, correctly paired with the MANUAL
// fobRows.baseFoodPct side of this same metric, which comes from a DIFFERENT report column).
// Live-measured against real qsr_fob data (27 stores, memory/dispatch-115.md Resolution):
// totalBaseFood/sales -- (compWaste+rawWaste+condiment+empMeal+statVar+unexplained)/sales
// reconstructs P&L Total Food Cost % (tFOBTotal) to within ~0.5pp on every store, confirming
// totalBaseFood really is the theoretical portion of total food cost -- not the same quantity
// as tFOBBase, and not close enough to tFOBTotal (P&L ACTUAL total, not theoretical base) for
// tFOBTotal to be a valid repoint target either (comparing against it still misses by a
// uniform ~4-5pp on every store -- the same systematic, non-signal failure mode). No target
// field in DEFAULT_TARGETS represents the theoretical-base quantity totalBaseFood actually is,
// so the fix disables the comparison (offKey:null, this file's own established convention for
// "no valid official target") rather than repointing to a still-wrong number.

describe('baseFd tolerance check (dispatch #115 -- metric-definition mismatch)', () => {
  it('TOL_METRICS baseFd has offKey:null -- no official-target field claimed', () => {
    const m = TOL_METRICS.find(x => x.id === 'baseFd');
    expect(m).toBeTruthy();
    expect(m.offKey).toBeNull();
  });

  it('baseFd is excluded from TOL_ROLLUP_METRICS (the set that can produce a tol status)', () => {
    expect(TOL_ROLLUP_METRICS.find(x => x.id === 'baseFd')).toBeUndefined();
  });

  it('tolStatusesForStore never returns a baseFd entry, for either the narrow manual value or the broad cloud value', () => {
    const loc = Object.keys(DEFAULT_TARGETS).find(l => DEFAULT_TARGETS[l].tFOBBase > 0);
    const d = new Date(Date.now() - 10 * 86400000);

    // Manual fobRows.baseFoodPct sits near the narrow ~4% target -- would have been green/red
    // depending on exact value under the old offKey; must produce NO status now either way.
    const dsManual = { loaded: true, fobRows: [{ loc, date: d, baseFoodPct: DEFAULT_TARGETS[loc].tFOBBase }] };
    expect(tolStatusesForStore(dsManual, loc).find(s => s.metricId === 'baseFd')).toBeUndefined();

    // Cloud qsr_fob totalBaseFood at real district magnitude (~23% of sales) -- this is the
    // exact shape that produced 27/27 false CRITICAL pre-fix (memory/dispatch-115.md).
    const dsCloud = {
      loaded: true, fobRows: [],
      qsrFobRows: [{ loc, date: d.toISOString().slice(0, 10), prodSalesAmt: 250000, totalBaseFood: 250000 * 0.233 }],
    };
    expect(tolStatusesForStore(dsCloud, loc).find(s => s.metricId === 'baseFd')).toBeUndefined();
  });

  it('the real Coaching pipeline (buildStore -> buildBrief, dispatch #94 Phase 3\'s consumer) never emits a tolBaseFd finding -- reproduces the original 27/27 false-CRITICAL shape and confirms it is gone', () => {
    const loc = Object.keys(DEFAULT_TARGETS).find(l => DEFAULT_TARGETS[l].tFOBBase > 0);
    const settings = { ...DEF_SETTINGS, targets: {}, weeksBack: 6 };
    const d = new Date(Date.now() - 10 * 86400000);
    const ds = {
      loaded: true,
      qsrActSummaryRows: [{ loc, date: d, sales: 1000, gc: 100 }], // keeps compute6wk from treating the store as empty
      fobRows: [],
      qsrFobRows: [{ loc, date: d.toISOString().slice(0, 10), prodSalesAmt: 250000, totalBaseFood: 250000 * 0.233 }],
    };
    const store = buildStore(loc, ds, settings);
    expect(store.findings.find(f => f.rule === 'tolBaseFd')).toBeUndefined();
  });

  // Per this repo's "would this verification still pass if reverted" rule: the assertions above
  // fail (i.e. correctly catch a regression) against the pre-fix offKey:'tFOBBase' -- checked by
  // hand against the code before this fix (memory/dispatch-115.md Resolution: reproduction script
  // run against the unmodified module showed 27/27 stores red; the same script post-fix showed
  // 0/0). Not re-asserted here as a live revert-and-rerun because TOL_METRICS is a static export,
  // not a toggle this suite can flip without editing the source file itself.
});
