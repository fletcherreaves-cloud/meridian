// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #69 first fixed the Model Check caption from "Weak agreement so far" (n=27, 95% CI
// [-0.16, 0.56] -- can't distinguish a useless model from a good one) to a countdown toward a
// power threshold. Follow-up, same day: memory/finding-cfv-predictability-ceiling-2026-08-22.md
// measured that the threshold the countdown was powering toward (rank corr >= 0.4) is ABOVE the
// achievable ceiling for any store-level predictor of CFV outcomes (ICC=0.087 -> ceiling
// sqrt(ICC) ~= 0.30) -- so the countdown itself was an unsafe promise, not just an unreachable
// one, and re-pointing it at a lower threshold would repeat the same error. The fix is to show
// the ceiling beside the estimate instead. Per the standing "would this verification still pass
// if the change were reverted" rule, this renders the ACTUAL VisitReadinessPanel consumer — an
// engine-level check of calibrateReadiness's returned fields alone can't tell "byType.CFV.ceiling
// computes correctly" from "the panel actually shows it instead of the old countdown."
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { VisitReadinessPanel } from '../views/visit-readiness.js';
import { DEFAULT_TARGETS } from '../constants.js';

const LOCS = Object.keys(DEFAULT_TARGETS);
const recent = n => new Date(Date.now() - n * 864e5);

// A store beating its targets by a margin that VARIES per store (idx), matching the existing
// engine test file's own goodRows() fixture shape. A fixed margin for every store would give
// every store an identical predicted readiness (each store scored against its OWN target) --
// zero variance across stores makes _spearman's denominator 0, returning r=null and masking
// the very branch this file exists to test. Varying the margin is what makes rank corr
// computable at all.
function goodRows(loc, idx) {
  const t = DEFAULT_TARGETS[loc];
  const days = [recent(1), recent(3), recent(6)];
  // 0.55..1.45 across the 27 stores -- a narrower band saturates every store's per-metric score
  // near the ceiling regardless of exact margin, producing an IDENTICAL rounded readiness for
  // all 27 stores and a zero-variance rank corr (r=null, masking the branch under test).
  const m = 0.55 + (idx / (LOCS.length - 1)) * 0.9;
  return {
    glimpse: days.map(d => ({ loc, date: d, oepe: t.tOepe * m, kvst: t.tKvst * m, laborPct: t.tCrewLabor * 0.92 })),
    ops: days.map(d => ({ loc, date: d, park: t.tPark * m, r2p: t.tR2p * m })),
    labor: days.map(d => ({ loc, date: d, tpph: t.tTpph * (2 - m), laborPct: t.tCrewLabor * 0.92 })),
    sched: days.map(d => ({ loc, date: d, schVsIdealDiff: 1 })),
  };
}
function mkDsWithVisits(locs, reportType = 'CFV') {
  const ds = { glimpseRows: [], opsRows: [], laborRows: [], schedRows: [], gradedVisits: [] };
  locs.forEach((loc, idx) => {
    const r = goodRows(loc, idx);
    ds.glimpseRows.push(...r.glimpse); ds.opsRows.push(...r.ops); ds.laborRows.push(...r.labor); ds.schedRows.push(...r.sched);
    ds.gradedVisits.push({ store: loc, dateISO: '2026-06-15', reportType, score: 60 + (idx % 30), pass: true });
  });
  return ds;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('VisitReadinessPanel Model Check caption (dispatch #69 + ceiling follow-up)', () => {
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

  it('shows the CFV ceiling beside the estimate, not a strength verdict or a pairs-needed countdown', () => {
    const ds = mkDsWithVisits(LOCS);
    act(() => {
      root.render(React.createElement(VisitReadinessPanel, { ds, onClose: () => {} }));
    });
    const text = container.textContent;
    // The retired countdown and strength-ladder language must both be gone.
    expect(text).not.toContain('visits needed to tell');
    expect(text).not.toContain('next check ~');
    expect(text).not.toContain('Weak agreement');
    expect(text).not.toContain('Strong agreement');
    expect(text).not.toContain('Moderate agreement');
    // The ceiling now appears beside the per-type estimate.
    expect(text).toContain('CFV:');
    expect(text).toContain('estimated ceiling of ~0.30');
    // The pooled rank-corr number is still shown (say the number AND the decision) — only the
    // claim attached to it changed, not the underlying data.
    expect(text).toMatch(/rank corr, pooled/);
  });

  it('Part D0 — a mixed CFV+RGR fixture shows independent per-type lines, not one pooled verdict', () => {
    // Half the stores graded on CFV, half on RGR — mirrors the real mixing this dispatch exists
    // to un-mix (two instruments with very different pass rates pooled into one figure).
    const half = Math.floor(LOCS.length / 2);
    const dsCfv = mkDsWithVisits(LOCS.slice(0, half), 'CFV');
    const dsRgr = mkDsWithVisits(LOCS.slice(half), 'RGR');
    const ds = { ...dsCfv,
      glimpseRows: [...dsCfv.glimpseRows, ...dsRgr.glimpseRows],
      opsRows: [...dsCfv.opsRows, ...dsRgr.opsRows],
      laborRows: [...dsCfv.laborRows, ...dsRgr.laborRows],
      schedRows: [...dsCfv.schedRows, ...dsRgr.schedRows],
      gradedVisits: [...dsCfv.gradedVisits, ...dsRgr.gradedVisits] };
    act(() => {
      root.render(React.createElement(VisitReadinessPanel, { ds, onClose: () => {} }));
    });
    const text = container.textContent;
    expect(text).toContain('CFV:');
    expect(text).toContain('RGR:');
    // RGR has no measured ceiling (its own test-retest is too imprecise to use as one) — its
    // line must not borrow CFV's.
    const rgrLineStart = text.indexOf('RGR:');
    expect(text.slice(rgrLineStart, rgrLineStart + 60)).not.toContain('estimated ceiling');
  });
});
