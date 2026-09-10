// @vitest-environment happy-dom
// @ts-nocheck
// GH #164's 2026-08-11 triage ("Triage of all 69 reads") flagged finding 2, separate from the
// tLabor->tCrewLabor migration itself: labor-tools.js's district/operator/patch labor-%
// TARGET was a straight unweighted per-store mean, compared against an ACTUAL that IS
// sales-weighted (wAvg/wA) -- apples-to-oranges. "$700k @ 20% + $300k @ 25% blends to 21.5%,
// not 22.5%." Directly violates CLAUDE.md's standing rule: "correct math, never average
// averages, dollar-weight aggregates."
//
// Re-measured against current code before fixing (per "measure it, don't reason about it"):
// both distTgt call sites (OperatorSummaryPanel's per-group version, LaborAnalyticsPanel's
// district-wide version) were still doing the unweighted mean. tTpph/tOepe were deliberately
// LEFT unweighted -- their own corresponding actuals (op.tpph/op.oepe, dist.tpph) are
// themselves simple (unweighted) means, so weighting only the target would introduce a NEW
// mismatch rather than fix one. Fixed by routing both distTgt.tLabor computations through one
// shared, exported, pure weightedLaborTarget() so they can't independently drift again.
//
// This test renders the REAL LaborAnalyticsPanel (not an isolated helper) with two stores
// whose sales differ 700k/300k and whose tCrewLabor targets differ 20%/30% -- both stores'
// ACTUAL laborPct is set equal (23%) so the actual-side average is unambiguous regardless of
// weighting, isolating the assertion to the target side. Unweighted mean target = 25.00%
// (the pre-fix number); sales-weighted target = 23.00% (the correct, post-fix number, and
// exactly equal to the actual -- a "meeting target" line reads at the true blended rate).
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const { LaborAnalyticsPanel, weightedLaborTarget } = await import('../views/labor-tools.js');
const { lastClosedBusinessDay } = await import('../engine/swing-feed.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOOP = () => {};

function fixtureRows() {
  const lastClosed = lastClosedBusinessDay();
  const addDx = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const rows = [];
  // 5 days well inside the default '4wk' (28-day) window. Both stores' laborPct is IDENTICAL
  // (0.23) so the actual-side district average is 0.23 regardless of weighting -- the test
  // isolates the target-side weighting bug, not a second unrelated averaging question.
  for (let i = 1; i <= 5; i++) {
    const d = addDx(lastClosed, -i);
    rows.push({ loc: '10001', date: d, sales: 140000, laborPct: 0.23 }); // 700,000 over 5 days
    rows.push({ loc: '10002', date: d, sales: 60000,  laborPct: 0.23 }); // 300,000 over 5 days
  }
  return rows;
}

describe('weightedLaborTarget (pure function)', () => {
  it('weights by the given field, matching the $700k@20%/$300k@25% example from the #164 triage', () => {
    const items = [{ tgt: { tCrewLabor: 0.20 }, sales: 700000 }, { tgt: { tCrewLabor: 0.25 }, sales: 300000 }];
    expect(weightedLaborTarget(items, 'sales')).toBeCloseTo(0.215, 6); // NOT 0.225 (unweighted mean)
  });

  it('a store with zero/missing weight is excluded from the blend, not treated as a zero-weighted drag', () => {
    const items = [{ tgt: { tCrewLabor: 0.20 }, sales: 100000 }, { tgt: { tCrewLabor: 0.30 }, sales: 0 }];
    expect(weightedLaborTarget(items, 'sales')).toBeCloseTo(0.20, 6);
  });

  it('a store with no resolvable target (tgt undefined) is excluded, not treated as a 0% target', () => {
    const items = [{ tgt: { tCrewLabor: 0.24 }, sales: 500000 }, { tgt: {}, sales: 500000 }];
    expect(weightedLaborTarget(items, 'sales')).toBeCloseTo(0.24, 6);
  });

  it('returns 0 when no item has both a resolvable target and a positive weight', () => {
    expect(weightedLaborTarget([], 'sales')).toBe(0);
    expect(weightedLaborTarget([{ tgt: {}, sales: 100 }], 'sales')).toBe(0);
  });
});

describe('LaborAnalyticsPanel district Labor % target is sales-weighted (GH #164 finding 2)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('shows the sales-weighted target (23.00%), not the unweighted per-store mean (25.00%)', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const ds = { loaded: true, laborRows: fixtureRows() };
    const settings = { targets: { '10001': { tCrewLabor: 0.20 }, '10002': { tCrewLabor: 0.30 } } };
    act(() => {
      root.render(React.createElement(LaborAnalyticsPanel, {
        stores: [{ loc: '10001' }, { loc: '10002' }], ds, settings, onClose: NOOP,
      }));
    });
    // The KPI card's sub-text names the resolved target explicitly (pFmtL(resolveLaborTarget(distTgt))).
    expect(container.textContent).toContain('23.00%');
    expect(container.textContent).not.toContain('25.00%');
  });
});
