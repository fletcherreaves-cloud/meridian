// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #94 Phase 2 -- district-wide out-of-tolerance rollup (ToleranceRollupTile,
// src/views/at-a-glance.js), built on the SAME tol comparison Phase 1 shipped for
// UnifiedTargetsPanel's KPI table (engine/tolerance-status.js -- single implementation,
// imported by both, not re-derived here or there).
//
// Per this repo's "would this verification still pass if reverted" rule, this renders the
// ACTUAL AtAGlance consumer (not tolStatusesDistrict in isolation) so a revert of the tile's
// wiring -- or of Phase 1's own comparison underneath it -- shows up as a failure here. It also
// cross-checks against UnifiedTargetsPanel rendered for the SAME store/data, per CLAUDE.md's
// "when two panels disagree on one number, diff the two computations" rule: this test asserts
// they agree, in one pass, rather than trusting each in isolation.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { AtAGlance } from '../views/at-a-glance.js';
import { UnifiedTargetsPanel } from '../views/store-dash.js';
import { DEFAULT_TARGETS } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOOP = () => {};
const baseAAGProps = {
  settings: { weekStartDay: 3 },
  userEvents: [],
  lockedProjections: {},
  dateRange: { s: new Date(2026, 7, 1), e: new Date(2026, 7, 16), label: 'MTD' },
  onOpenStore: NOOP, onCoachingSaved: NOOP, onOpenProjections: NOOP,
  onOpenPVSA: NOOP, onOpenBrief: NOOP, onNav: NOOP, onOpenModal: NOOP,
};

describe('ToleranceRollupTile (dispatch #94 Phase 2 -- district out-of-tolerance rollup)', () => {
  let container, root;
  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('counts a real out-of-tolerance store/metric and agrees with UnifiedTargetsPanel on the same data', async () => {
    // Real store + real official Comp Waste % target, same as dispatch-94-statuscol-tol.test.js's
    // Phase 1 test -- not hardcoded, so this stays correct if DEFAULT_TARGETS' numbers change.
    const loc = Object.keys(DEFAULT_TARGETS).find(l => DEFAULT_TARGETS[l].tCompWaste > 0);
    expect(loc).toBeTruthy();
    const target = DEFAULT_TARGETS[loc].tCompWaste;
    const TOL = 0.001; // compW's declared tol
    const cur = target + TOL * 3; // clearly past the tol*2 yellow band -> red

    const d = new Date(Date.now() - 10 * 86400000);
    const ds = {
      loaded: true,
      // AtAGlance's own noData gate (`!laborRows.length && !qsrActSummaryRows.length`) needs
      // something here besides fobRows, or the whole grid (and this tile) never renders. This
      // row doesn't touch compW's tol computation, so it can't influence the assertion below.
      qsrActSummaryRows: [{ loc, date: d, sales: 1000, gc: 100 }],
      // The manual fobRows shape maps ONE field per metric (compWaste), unlike qsr_fob's
      // monthly $ aggregate (which sums several components into shared metrics like FOB-Over-
      // Base) -- so this touches ONLY compW, keeping the fixture isolated to the one metric
      // under test.
      fobRows: [{ loc, date: d, compWaste: cur }],
    };
    const stores = [{ loc }];

    // ── Phase 2: the district rollup tile ──────────────────────────────────
    await act(async () => {
      root.render(React.createElement(AtAGlance, { ...baseAAGProps, ds, stores }));
    });
    expect(container.textContent).toContain('Tolerance Status');
    expect(container.textContent).toContain('Comp Waste %');
    const compRow = [...container.querySelectorAll('div')].find(d => d.textContent.trim() === 'Comp Waste %');
    expect(compRow).toBeTruthy();
    expect(compRow.parentElement.textContent).toMatch(/1 red/);
    expect(compRow.parentElement.textContent).not.toMatch(/yellow/);
    // Single store, single flagged metric -> exactly 1 red / 0 yellow district-wide.
    expect(container.textContent).toMatch(/1[\s\S]{0,3}red/);

    act(() => { root.unmount(); });
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // ── Cross-check: UnifiedTargetsPanel, same ds, scoped to the same single store ──────────
    act(() => {
      root.render(React.createElement(UnifiedTargetsPanel, {
        stores: [], ds, settings: {}, onClose: NOOP, embedded: true,
      }));
    });
    const select = container.querySelector('select');
    expect(select).toBeTruthy();
    await act(async () => {
      select.value = loc;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const rows = [...container.querySelectorAll('tr')];
    const kpiRow = rows.find(r => r.textContent.includes('Comp Waste %'));
    expect(kpiRow).toBeTruthy();
    expect(kpiRow.textContent).toContain('Off Track'); // red, in UnifiedTargetsPanel's own vocabulary
  });

  it('shows an all-clear message when every store is within tolerance', async () => {
    const loc = Object.keys(DEFAULT_TARGETS).find(l => DEFAULT_TARGETS[l].tCompWaste > 0);
    const target = DEFAULT_TARGETS[loc].tCompWaste;
    const d = new Date(Date.now() - 10 * 86400000);
    const ds = {
      loaded: true,
      qsrActSummaryRows: [{ loc, date: d, sales: 1000, gc: 100 }], // satisfies AtAGlance's noData gate only
      fobRows: [{ loc, date: d, compWaste: target }], // exactly on target, isolated to compW only
    };
    await act(async () => {
      root.render(React.createElement(AtAGlance, { ...baseAAGProps, ds, stores: [{ loc }] }));
    });
    expect(container.textContent).toContain('Tolerance Status');
    expect(container.textContent).toMatch(/within tolerance on all/);
  });
});
