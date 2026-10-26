// @vitest-environment happy-dom
// @ts-nocheck
// GitHub issue #175: "District labor/TPPH/OEPE target is a straight average of store targets,
// compared against a sales-weighted actual." tLabor was already fixed (PR #1218/v5.415) via the
// shared weightedLaborTarget() helper -- see dispatch-164-labor-tools-district-target-weighting
// .test.js. tTpph/tOepe were left open, and until this fix were DELIBERATELY left as unweighted
// means on BOTH sides (op.tpph/op.oepe/dist.tpph were themselves simAvg/sA -- a straight mean of
// each store's own ratio -- so the old comments reasoned a weighted target would introduce a NEW
// mismatch against an unweighted actual, not fix one).
//
// Fixed by routing BOTH sides through the same Σ/Σ family already used everywhere else in this
// file for a single store (metricRate/metricSumRatio, engine/metric-source.js):
//   - ACTUAL: metricRate(ds, locs, range, 'tpph'/'oepe') now takes the WHOLE group's/district's
//     loc list (metricRate and metricSumRatio already accept an array of locs), giving the true
//     Σnumerator/Σdenominator rollup instead of averaging each store's own ratio equally.
//   - TARGET: weighted by the SAME basis the actual was just summed over -- Σhours for TPPH,
//     ΣdtTransCnt for OEPE (metricSumRatio(...).denSum, the exact denominator of the
//     'tpph'/'oepe' ratio's derive.inputs) -- via the new generic weightedTarget() helper
//     (weightedLaborTarget is hardcoded to resolveLaborTarget, which doesn't apply to a plain
//     numeric tTpph/tOepe target).
//
// Fixture: two stores, deliberately unequal hours (TPPH's weight) so weighted != unweighted.
// Store 10001 is the high-volume store (80 hrs/day, 800 gc/day -> tpph 10/hr, target 8).
// Store 10002 is the low-volume store (20 hrs/day, 400 gc/day -> tpph 20/hr, target 20).
// Over a 5-day window: Sigma-hrs = 400 + 100 = 500; Sigma-gc = 4000 + 2000 = 6000.
//   Weighted actual  = 6000 / 500 = 12.00   (NOT the unweighted mean of 10 & 20 = 15.00)
//   Weighted target  = (8*400 + 20*100) / 500 = 5200/500 = 10.40  (NOT the unweighted mean = 14.00)
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const { LaborAnalyticsPanel, OperatorSummaryPanel, weightedTarget } = await import('../views/labor-tools.js');
const { lastClosedBusinessDay } = await import('../engine/swing-feed.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOOP = () => {};

function fixtureActSummaryRows() {
  const lastClosed = lastClosedBusinessDay();
  const addDx = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const rows = [];
  for (let i = 1; i <= 5; i++) {
    const d = addDx(lastClosed, -i);
    rows.push({ loc: '10001', date: d, gc: 800, actHrs: 80, sales: 1 });
    rows.push({ loc: '10002', date: d, gc: 400, actHrs: 20, sales: 1 });
  }
  return rows;
}

const settings = { targets: { '10001': { tTpph: 8 }, '10002': { tTpph: 20 } } };

describe('weightedTarget (pure function)', () => {
  it('weights by the given field, matching the Sigma-gc/Sigma-hrs example from issue #175', () => {
    const items = [{ tgt: { tTpph: 8 }, tpphWeight: 400 }, { tgt: { tTpph: 20 }, tpphWeight: 100 }];
    expect(weightedTarget(items, 'tTpph', 'tpphWeight')).toBeCloseTo(10.4, 6); // NOT 14.0 (unweighted mean)
  });

  it('a store with zero/missing weight is excluded from the blend, not treated as a zero-weighted drag', () => {
    const items = [{ tgt: { tTpph: 10 }, tpphWeight: 300 }, { tgt: { tTpph: 30 }, tpphWeight: 0 }];
    expect(weightedTarget(items, 'tTpph', 'tpphWeight')).toBeCloseTo(10, 6);
  });

  it('a store with no resolvable target is excluded, not treated as a 0 target', () => {
    const items = [{ tgt: { tTpph: 12 }, tpphWeight: 500 }, { tgt: {}, tpphWeight: 500 }];
    expect(weightedTarget(items, 'tTpph', 'tpphWeight')).toBeCloseTo(12, 6);
  });

  it('returns 0 when no item has both a resolvable target and a positive weight', () => {
    expect(weightedTarget([], 'tTpph', 'tpphWeight')).toBe(0);
    expect(weightedTarget([{ tgt: {}, tpphWeight: 100 }], 'tTpph', 'tpphWeight')).toBe(0);
  });
});

describe('LaborAnalyticsPanel district TPPH actual + target are hours-weighted Sigma/Sigma (GH #175)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('shows the weighted actual (12.00) and weighted target (10.4), not the unweighted means (15.00 / 14.0)', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const ds = { loaded: true, qsrActSummaryRows: fixtureActSummaryRows() };
    act(() => {
      root.render(React.createElement(LaborAnalyticsPanel, {
        stores: [{ loc: '10001' }, { loc: '10002' }], ds, settings, onClose: NOOP,
      }));
    });
    // nFmtL renders the actual at 2dp ('12.00') and the target at 1dp ('10.4') -- see
    // the KPI tile's own 'Target: '+nFmtL(distTgt.tTpph,1) call.
    expect(container.textContent).toContain('12.00');
    expect(container.textContent).toContain('10.4');
    expect(container.textContent).not.toContain('15.00');
    expect(container.textContent).not.toContain('14.0');
  });
});

describe('OperatorSummaryPanel group TPPH actual is the hours-weighted Sigma/Sigma rollup (GH #175)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('shows the weighted group actual (12.00), not the unweighted per-store mean (15.00)', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const ds = { loaded: true, qsrActSummaryRows: fixtureActSummaryRows() };
    act(() => {
      root.render(React.createElement(OperatorSummaryPanel, {
        stores: [{ loc: '10001' }, { loc: '10002' }], ds, settings, onClose: NOOP,
      }));
    });
    // Both test locs fall into the same default ('operator') group ('Unknown', no
    // settings.operators/INV_ORG_COORDS entry for either) -- one group card, one TPPH figure.
    expect(container.textContent).toContain('12.00');
    expect(container.textContent).not.toContain('15.00');
  });
});
