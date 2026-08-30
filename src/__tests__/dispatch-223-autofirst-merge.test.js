// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #223 — fix GitHub issue #362: labInRange/channelRows (and, per the dispatch's own
// judgment call, ctrlEffective) inverted the "auto-first, manual as last-resort fill" standing
// rule (CLAUDE.md), letting a stale manual upload silently override fresher auto-pulled data for
// the same (loc,date) instead of the other way around. Renders the actual AtAGlance panel (not
// just the merge helper) so a revert of either the loop-order fix or the mergeFresh call-order fix
// — not just the underlying logic — would fail this test (CLAUDE.md: "would this verification
// still pass if the change were reverted?"). Each "shared day" case is run against the CURRENT
// (pre-fix) code first to confirm it goes red, per the issue's own explicit ask.
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
  // Wide range so effectiveDateRange never falls back — every test's rows land inside it.
  dateRange: { s: new Date(2020, 0, 1), e: new Date(), label: 'MTD' },
  onOpenStore: NOOP, onCoachingSaved: NOOP, onOpenProjections: NOOP,
  onOpenPVSA: NOOP, onOpenBrief: NOOP, onNav: NOOP, onOpenModal: NOOP,
};
const today = new Date();
const d = (daysAgo) => { const x = new Date(today); x.setDate(x.getDate() - daysAgo); return x; };

describe('AtAGlance auto-first merge precedence (dispatch #223 / issue #362)', () => {
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

  it('labInRange (Sales tile totSales): a day covered by BOTH stale manual and fresh auto resolves to AUTO', () => {
    const ds = {
      loaded: true,
      laborRows: [{ loc: '10422', date: d(1), sales: 1000 }],          // stale manual
      qsrActSummaryRows: [{ loc: '10422', date: d(1), sales: 9000 }],  // fresh auto
    };
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds })); });
    // Auto ($9,000) must win, not stale manual ($1,000).
    expect(container.textContent).toContain('$9,000');
    expect(container.textContent).not.toContain('$1,000');
  });

  it('labInRange (Sales tile totSales): a day covered ONLY by manual still resolves to manual (gap-fill)', () => {
    const ds = {
      loaded: true,
      laborRows: [{ loc: '10422', date: d(2), sales: 4321 }],
      qsrActSummaryRows: [],
    };
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds })); });
    expect(container.textContent).toContain('$4,321');
  });

  it('channelRows (Digital Sales tile digitalSales): a day covered by BOTH stale manual and fresh auto (Sales Ledger) resolves to AUTO', () => {
    const ds = {
      loaded: true,
      laborRows: [{ loc: '10422', date: d(1), sales: 1000, allNetSales: 1000, mopSales: 100 }], // stale manual channel row
      salesLedgerRows: [{ loc: '10422', date: d(1), allNetSales: 9000, mopSales: 900 }],          // fresh auto channel row
    };
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds })); });
    // Digital Revenue = deliv+mop+kiosk; only mop is set here, so it directly reflects the winner.
    expect(container.textContent).toContain('$900');
    expect(container.textContent).not.toContain('$100');
  });

  it('channelRows (Digital Sales tile digitalSales): a day covered ONLY by manual still resolves to manual (gap-fill)', () => {
    const ds = {
      loaded: true,
      laborRows: [{ loc: '10422', date: d(2), sales: 5000, allNetSales: 5000, mopSales: 321 }],
      salesLedgerRows: [],
      opsSalesMixRows: [],
    };
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds })); });
    expect(container.textContent).toContain('$321');
  });

  // ── Judgment call (dispatch #223 Task 2): ctrlEffective = mergeFresh(ds?.ctrlRows, ctrlAuto)
  // has the identical manual-primary inversion, unflagged by issue #362. No comment anywhere
  // (ctrlAuto's own header, or otherwise) states manual-wins is intentional for Controls
  // specifically — and laborSec's own comment (~"mergeFresh's whole-row override meant that
  // manual $0 TPPH row entirely replaced the day's ctrlAuto row") documents this exact inversion
  // already causing a real, previously-fixed-around bug. Treated as the same bug and fixed here.
  it('ctrlEffective (Controls tile Promo/Disc %): a day covered by BOTH stale manual and fresh auto (Glimpse) resolves to AUTO', () => {
    const ds = {
      loaded: true,
      ctrlRows: [{ loc: '10422', date: d(1), promoPct: 0.05 }],   // stale manual
      glimpseRows: [{ loc: '10422', date: d(1), promoPct: 0.20 }], // fresh auto
      // AtAGlance's top-level noData gate only looks at laborRows/qsrActSummaryRows — a minimal,
      // otherwise-inert row keeps the panel past that gate without touching the merge under test.
      qsrActSummaryRows: [{ loc: '10422', date: d(1), sales: 1 }],
    };
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds })); });
    expect(container.textContent).toContain('20.00%');
    expect(container.textContent).not.toContain('5.00%');
  });

  it('ctrlEffective (Controls tile Promo/Disc %): a day covered ONLY by manual still resolves to manual (gap-fill)', () => {
    const ds = {
      loaded: true,
      ctrlRows: [{ loc: '10422', date: d(2), promoPct: 0.077 }],
      glimpseRows: [],
      // Placed on a DIFFERENT day than the ctrlRows row under test — putting it on the SAME
      // day would itself create a (loc,date)-matching ctrlAuto row (tpph:undefined only, no
      // promoPct field) that, after the fix, correctly wins as auto... with no promoPct at
      // all, wiping the very manual value this test means to prove still gap-fills. That
      // would be this test tripping the exact whole-row-replace trap the laborSec TPPH
      // comment documents, not a bug in the fix.
      qsrActSummaryRows: [{ loc: '10422', date: d(10), sales: 1 }],
    };
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds })); });
    expect(container.textContent).toContain('7.70%');
  });
});
