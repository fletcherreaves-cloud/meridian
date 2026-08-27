// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #155 — renders the actual AtAGlance panel (not just the engine) so a revert of the
// metricRate wiring, not just metricSumRatio itself, would fail this test (CLAUDE.md: "would
// this verification still pass if the change were reverted?"). effectiveDateRange honors
// whatever the toolbar's dateRange prop is (falling back to a 30-day window only when the
// selected range has no data) — this test's dateRange, like the app's own default, can include
// today, so the district TPPH tile must read the Σ/Σ rollup, not a flat mean-of-daily.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AtAGlance } from '../views/at-a-glance.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOOP = () => {};
const baseProps = {
  stores: [{ loc: '10422' }],
  settings: { weekStartDay: 3 },
  userEvents: [],
  lockedProjections: {},
  dateRange: { s: new Date(2020, 0, 1), e: new Date(), label: 'MTD' },
  onOpenStore: NOOP, onCoachingSaved: NOOP, onOpenProjections: NOOP,
  onOpenPVSA: NOOP, onOpenBrief: NOOP, onNav: NOOP, onOpenModal: NOOP,
};

describe('AtAGlance Labor tile TPPH uses the Σ/Σ rollup for a range that includes today (dispatch #155)', () => {
  let container, root;
  beforeEach(() => {
    localStorage.clear();
    // Turn on the standalone "Labor" section (off by default) so laborSec.tpph renders without
    // also needing a ctrlRows/opsRows fixture to satisfy the "Controls & Labor" section's own
    // separate ctrlSec gate — same laborSec object either way, just a simpler path to it.
    localStorage.setItem('mf_kpi_secs', JSON.stringify([{ id: 'labor', label: 'Labor (standalone)', icon: '👥', on: true }]));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('shows the Σ/Σ TPPH figure, not the mean-of-daily one, when today (in-progress) is in range', () => {
    const today = new Date();
    const d = (daysAgo) => { const x = new Date(today); x.setDate(x.getDate() - daysAgo); return x; };
    const rows = [];
    for (let i = 1; i <= 5; i++) rows.push({ loc: '10422', date: d(i), gc: 1000, actHrs: 100 }); // tpph=10/day, complete
    rows.push({ loc: '10422', date: d(0), gc: 15, actHrs: 1 }); // today, in-progress: tpph=15 (inflated)
    const ds = { loaded: true, qsrActSummaryRows: rows };

    act(() => {
      root.render(React.createElement(AtAGlance, { ...baseProps, ds }));
    });

    // Σ/Σ = (1000*5+15)/(100*5+1) = 5015/501 ≈ 10.01 -> "10.0"; mean-of-daily =
    // (10*5+15)/6 ≈ 10.83 -> "10.8". The value div (line 2490) is immediately followed in the
    // DOM by the 'TPPH' label div (line 2491) with no separator, so their text concatenates.
    expect(container.textContent).toContain('10.0TPPH');
    expect(container.textContent).not.toContain('10.8TPPH');
  });
});
