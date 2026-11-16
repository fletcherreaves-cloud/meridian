// @vitest-environment happy-dom
// @ts-nocheck
// Manual Pull Triggers tile on At A Glance (owner request 2026-11-16: "a tile on glance that
// explicitly makes it clear what reports need to be uploaded"). Per this repo's "would this
// verification still pass if reverted" rule, renders the REAL AtAGlance -> ManualPullTriggersTile
// call site (same pattern as dispatch-94-phase2-rollup.test.js's ToleranceRollupTile test), not
// computeManualPullTriggers in isolation.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { AtAGlance } from '../views/at-a-glance.js';
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

describe('ManualPullTriggersTile (owner request 2026-11-16)', () => {
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

  it('shows a real eBOS Purchases flag on the tile when a FOB metric is out of tolerance', async () => {
    const loc = Object.keys(DEFAULT_TARGETS).find(l => DEFAULT_TARGETS[l].tCompWaste > 0);
    const target = DEFAULT_TARGETS[loc].tCompWaste;
    const TOL = 0.001;
    const cur = target + TOL * 3; // red, past tol*2
    const d = new Date(Date.now() - 10 * 86400000);
    const ds = {
      loaded: true,
      qsrActSummaryRows: [{ loc, date: d, sales: 1000, gc: 100 }],
      fobRows: [{ loc, date: d, compWaste: cur }],
    };
    const stores = [{ loc }];

    await act(async () => {
      root.render(React.createElement(AtAGlance, { ...baseAAGProps, ds, stores }));
    });
    expect(container.textContent).toContain('Manual Pull Needed');
    expect(container.textContent).toContain('eBOS Purchases');
  });

  it('reads "no store currently flags" when nothing is out of tolerance', async () => {
    const loc = Object.keys(DEFAULT_TARGETS).find(l => DEFAULT_TARGETS[l].tCompWaste > 0);
    const target = DEFAULT_TARGETS[loc].tCompWaste;
    const d = new Date(Date.now() - 10 * 86400000);
    const ds = {
      loaded: true,
      qsrActSummaryRows: [{ loc, date: d, sales: 1000, gc: 100 }],
      fobRows: [{ loc, date: d, compWaste: target }],
    };
    await act(async () => {
      root.render(React.createElement(AtAGlance, { ...baseAAGProps, ds, stores: [{ loc }] }));
    });
    expect(container.textContent).toContain('Manual Pull Needed');
    expect(container.textContent).toContain('No store currently flags for a manual pull.');
  });
});
