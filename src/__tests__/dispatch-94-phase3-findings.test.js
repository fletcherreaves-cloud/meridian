import { describe, it, expect } from 'vitest';
import { DEFAULT_TARGETS, DEF_SETTINGS } from '../constants.js';

// pipeline.js transitively imports morning-brief.js, which assigns `window.onerror` at module
// top level — harmless in a browser, but this suite runs under vitest's `node` environment
// (vite.config.ts), so `window` doesn't exist yet. Stub it before a dynamic import (NOT
// hoisted, unlike a static import) so that assignment has somewhere to land. Same pattern as
// pipeline-sales-decline.test.js / pipeline-ctrl-score.test.js.
globalThis.window = globalThis.window || {};
const { buildStore } = await import('../engine/pipeline.js');
const { tolStatus } = await import('../engine/tolerance-status.js');

// Dispatch #94 Phase 3 -- an out-of-tolerance metric (using Phase 1's tol comparison,
// engine/tolerance-status.js's tolStatusesForStore/tolStatus, one implementation) becomes a
// finding in the SAME buildBrief/findings pipeline GMCoachingBrief already reads off
// store.findings — not a separate code path bolted onto coaching.js.
//
// Per this repo's "would this verification still pass if reverted" rule, this calls the real
// buildStore() consumer (which internally calls buildBrief and attachFindingMeta, exactly the
// path App.js and GMCoachingBrief use to build `store.findings`) rather than testing
// tolStatusesForStore in isolation — a revert of pipeline.js's wiring to it fails here, not
// just a revert of tolerance-status.js's own math.
//
// Only metrics with NO existing dedicated buildBrief finding get a tol-based one (see
// pipeline.js's TOL_FINDING_ACTION comment) — Comp Waste % is one of those, so it's the
// vehicle here, mirroring dispatch-94-phase2-rollup.test.js's own choice for the same reason
// (isolatable via ds.fobRows, one field per metric, no shared-aggregate contamination).

const loc = Object.keys(DEFAULT_TARGETS).find(l => DEFAULT_TARGETS[l].tCompWaste > 0);
const target = DEFAULT_TARGETS[loc].tCompWaste;
const TOL = 0.001; // compW's declared tol, engine/tolerance-status.js TOL_METRICS

const settings = { ...DEF_SETTINGS, targets: {}, weeksBack: 6 };

function dsWithCompWaste(compWaste) {
  const d = new Date(Date.now() - 10 * 86400000);
  return {
    loaded: true,
    // Needs at least one resolvable metric elsewhere so compute6wk doesn't treat the store as
    // fully empty — matches the shape real ds arrives in (multiple streams, one row here).
    qsrActSummaryRows: [{ loc, date: d, sales: 1000, gc: 100 }],
    fobRows: [{ loc, date: d, compWaste }],
  };
}

describe('buildStore findings (dispatch #94 Phase 3 -- tol-based findings)', () => {
  it('a red Comp Waste % (clearly past tol*2) produces a tolCompW crit finding with correct metadata', () => {
    const cur = target + TOL * 3; // red, per tolStatus's own tol*2 boundary
    expect(tolStatus(cur, target, TOL)).toBe('red'); // sanity: this really is red per Phase 1's own math

    const store = buildStore(loc, dsWithCompWaste(cur), settings);
    const hit = store.findings.find(f => f.rule === 'tolCompW');
    expect(hit).toBeTruthy();
    expect(hit.t).toBe('crit');
    expect(hit.severity).toBe('crit');       // attachFindingMeta ran (T_TO_SEVERITY)
    expect(hit.category).toBe('Food Cost');  // finding-rules.js's FINDING_RULES entry
    expect(hit.m).toMatch(/CRITICAL — COMP WASTE %/);
    expect(hit.m).toContain(TOL_PCT(cur));
    expect(hit.m).toContain(TOL_PCT(target));
  });

  it('a yellow Comp Waste % (between tol and tol*2) produces a WATCH, not a CRITICAL', () => {
    const cur = target + TOL * 1.5; // yellow, per tolStatus's own tol boundary
    expect(tolStatus(cur, target, TOL)).toBe('yellow');

    const store = buildStore(loc, dsWithCompWaste(cur), settings);
    const hit = store.findings.find(f => f.rule === 'tolCompW');
    expect(hit).toBeTruthy();
    expect(hit.t).toBe('watch');
    expect(hit.m).toMatch(/WATCH — COMP WASTE %/);
  });

  it('a green Comp Waste % (within tol) produces no tolCompW finding at all', () => {
    const store = buildStore(loc, dsWithCompWaste(target), settings); // exactly on target
    expect(store.findings.find(f => f.rule === 'tolCompW')).toBeFalsy();
  });

  it('metrics with an existing dedicated finding (oepe/labor/park/tpph/r2p) never get a duplicate tol-prefixed rule', () => {
    // Phase 3 deliberately skips these five -- pipeline.js's TOL_FINDING_ACTION comment names
    // them as already covered by their own richer rules. A regression that re-added them would
    // double-flag the same metric under two different thresholds.
    const store = buildStore(loc, dsWithCompWaste(target + TOL * 3), settings);
    for (const skipped of ['tolOepe', 'tolLabor', 'tolPark', 'tolTpph', 'tolR2p']) {
      expect(store.findings.find(f => f.rule === skipped)).toBeFalsy();
    }
  });
});

function TOL_PCT(v) { return (v * 100).toFixed(2) + '%'; }
