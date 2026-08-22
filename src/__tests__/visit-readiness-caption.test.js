// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #69 — the Model Check caption used to say "Weak agreement so far" at n=27, which
// memory/notes-visit-readiness-backlog-2026-08-22.md computed a 95% CI for (rank corr
// [-0.16, 0.56]) wide enough to be consistent with either a useless model or a good one. That
// asserted more certainty than the data supports. Per the standing "would this verification
// still pass if the change were reverted" rule, this renders the ACTUAL VisitReadinessPanel
// consumer — an engine-level check of calibrateReadiness's returned fields alone can't tell
// "the pairsNeeded math is right" from "the panel actually shows the honest caption instead of
// the old verdict-y one," which is exactly the gap here (same class as dispatch #68/#64).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { VisitReadinessPanel } from '../views/visit-readiness.js';
import { CALIBRATION_PAIRS_FOR_POWER } from '../engine/visit-readiness.js';
import { DEFAULT_TARGETS } from '../constants.js';

const LOCS = Object.keys(DEFAULT_TARGETS);
const recent = n => new Date(Date.now() - n * 864e5);

// A store beating its targets by a margin that VARIES per store (idx), matching the existing
// engine test file's own goodRows() fixture shape. A fixed margin for every store would give
// every store an identical predicted readiness (each store scored against its OWN target) --
// zero variance across stores makes _spearman's denominator 0, returning r=null and masking
// the very branch this file exists to test (r==null short-circuits before pairsNeeded is
// checked). Varying the margin is what makes rank corr computable at all.
function goodRows(loc, idx) {
  const t = DEFAULT_TARGETS[loc];
  const days = [recent(1), recent(3), recent(6)];
  // 0.55..1.45 across the 27 stores -- a narrower band (e.g. 0.75-0.93) saturates every
  // store's per-metric score near the ceiling regardless of exact margin (the scoring
  // function tolerates a wide beat-target range as "perfect"), which was producing an
  // IDENTICAL rounded readiness for all 27 stores and a zero-variance rank corr (r=null,
  // masking the very branch under test). This spread genuinely varies store standing.
  const m = 0.55 + (idx / (LOCS.length - 1)) * 0.9;
  return {
    glimpse: days.map(d => ({ loc, date: d, oepe: t.tOepe * m, kvst: t.tKvst * m, laborPct: t.tCrewLabor * 0.92 })),
    ops: days.map(d => ({ loc, date: d, park: t.tPark * m, r2p: t.tR2p * m })),
    labor: days.map(d => ({ loc, date: d, tpph: t.tTpph * (2 - m), laborPct: t.tCrewLabor * 0.92 })),
    sched: days.map(d => ({ loc, date: d, schVsIdealDiff: 1 })),
  };
}
function mkDsWithVisits(locs) {
  const ds = { glimpseRows: [], opsRows: [], laborRows: [], schedRows: [], gradedVisits: [] };
  locs.forEach((loc, idx) => {
    const r = goodRows(loc, idx);
    ds.glimpseRows.push(...r.glimpse); ds.opsRows.push(...r.ops); ds.laborRows.push(...r.labor); ds.schedRows.push(...r.sched);
    ds.gradedVisits.push({ store: loc, dateISO: '2026-06-15', reportType: 'CFV', score: 60 + (idx % 30), pass: true });
  });
  return ds;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('VisitReadinessPanel Model Check caption (dispatch #69)', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('below the power threshold, shows pairs-needed progress instead of a strength verdict', () => {
    expect(LOCS.length).toBeLessThan(CALIBRATION_PAIRS_FOR_POWER); // precondition: this fixture is underpowered
    const ds = mkDsWithVisits(LOCS);
    act(() => {
      root.render(React.createElement(VisitReadinessPanel, { ds, onClose: () => {} }));
    });
    const text = container.textContent;
    expect(text).toContain(`${LOCS.length} of ~${CALIBRATION_PAIRS_FOR_POWER} visits needed to tell`);
    expect(text).toContain('next check ~');
    // Must NOT show the old verdict-y strength language for an underpowered sample.
    expect(text).not.toContain('Weak agreement');
    expect(text).not.toContain('Strong agreement');
    expect(text).not.toContain('Moderate agreement');
    // The underlying rank-corr number is still shown (say the number AND the decision) —
    // only the caption's CLAIM changed, not the data.
    expect(text).toMatch(/rank corr/);
  });
});

// The >=pairsForPower branch (falls back to the strength ladder) is exercised at the engine
// level in visit-readiness.test.js's calibrateReadiness suite — mkDsWithVisits here can't reach
// 46 distinct real store locs (only 27 exist in DEFAULT_TARGETS, and calibrateReadiness dedupes
// lastVisit per store), so a render-level test of that branch isn't buildable from real store
// data without inventing fake loc IDs the rest of the panel can't resolve names for.
