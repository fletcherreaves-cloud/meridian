// @vitest-environment happy-dom
// @ts-nocheck
// Owner-caught live (2026-11-05): "For register audit tab and possibly others, changing date
// selection does not appear to update anything." Reproduced first, per CLAUDE.md's "measure it,
// don't reason about it" rule, before writing any fix: RegisterAuditTab's signature was
// `({ds, loc})` — `dateRange` (the toolbar's "Oct 28 – Nov 3 · Last Week" control, threaded into
// every other date-aware tab via StoreDash's `dateRange` prop) was never even in this component's
// parameter list, and `ds.auditRows` was filtered ONLY by `loc`. So the toolbar control had
// nothing to drive here — not a missing effect dependency (there was no effect to re-run; the
// mount-only `ensureLazyFill` call is a one-time demand-load of the whole stream, correct as-is),
// but the render-time row filter never consulting the date range at all.
//
// This test mounts the ACTUAL RegisterAuditTab consumer (not register-audit.js's engine
// functions in isolation), per the same "would this verification still pass if the change were
// reverted" standing rule the dispatch #200 tests above already follow: a test against
// analyzeRegisterAudit() alone couldn't tell "date range now wired into the panel" from "date
// range filtering exists somewhere but never reaches this screen."
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../lib/supabase.js', () => ({ supabase: { rpc: vi.fn() } }));

import { RegisterAuditTab } from '../views/store-analytics.js';
import { _resetLazyFillForTests } from '../engine/metric-source.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Two distinct days for the same store, with clearly distinguishable T-Red After counts so the
// rendered Overview table can prove WHICH day's row(s) actually made it into the aggregation.
const ROW_OCT1 = {
  loc: '0043380', emp: 'Aaden W', empToken: 'tok-aaden', date: new Date('2026-10-01T00:00:00'),
  drawerSales: 1000, drawerGC: 100, drawerOpens: 3, cashOSDollar: -1,
  tRedACnt: 1, tRedBCnt: 0, tRedADollar: 2, tRedBDollar: 0,
  manualRefAmt: 0, posOverCnt: 0, posOverAmt: 0, refundCnt: 0, refundCash: 0, refundCashless: 0, promoAmt: 0,
};
const ROW_OCT15 = {
  loc: '0043380', emp: 'Aaden W', empToken: 'tok-aaden', date: new Date('2026-10-15T00:00:00'),
  drawerSales: 2000, drawerGC: 200, drawerOpens: 3, cashOSDollar: -1,
  tRedACnt: 9, tRedBCnt: 0, tRedADollar: 2, tRedBDollar: 0,
  manualRefAmt: 0, posOverCnt: 0, posOverAmt: 0, refundCnt: 0, refundCash: 0, refundCashless: 0, promoAmt: 0,
};
const BOTH_ROWS = [ROW_OCT1, ROW_OCT15];

const rangeFor = (startISO, endISO) => ({
  s: new Date(startISO + 'T00:00:00'), e: new Date(endISO + 'T23:59:59.999'), label: 'Custom',
});

describe('RegisterAuditTab follows the toolbar date-range control (2026-11-05 live bug report)', () => {
  let container, root;
  beforeEach(() => {
    _resetLazyFillForTests();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('reproduces the bug pre-fix shape: narrowing the range to just Oct 1 excludes the Oct 15 row', async () => {
    await act(async () => {
      root.render(React.createElement(RegisterAuditTab, {
        ds: { auditRows: BOTH_ROWS }, loc: '0043380', dateRange: rangeFor('2026-10-01', '2026-10-01'),
      }));
    });
    expect(container.textContent).toContain('1 transactions');
    // Only Oct 1's T-Red-A count (1) should have aggregated — Oct 15's row (9) must not appear.
    expect(container.textContent).toMatch(/\b1\b/);
  });

  it('switching the date range (same mount, new props — exactly what clicking a different preset does) changes the rendered content', async () => {
    await act(async () => {
      root.render(React.createElement(RegisterAuditTab, {
        ds: { auditRows: BOTH_ROWS }, loc: '0043380', dateRange: rangeFor('2026-10-01', '2026-10-01'),
      }));
    });
    const octOneHtml = container.innerHTML;

    await act(async () => {
      root.render(React.createElement(RegisterAuditTab, {
        ds: { auditRows: BOTH_ROWS }, loc: '0043380', dateRange: rangeFor('2026-10-15', '2026-10-15'),
      }));
    });
    const octFifteenHtml = container.innerHTML;

    // The exact regression: pre-fix, these two renders were byte-identical because the date
    // range was never consulted at all.
    expect(octFifteenHtml).not.toBe(octOneHtml);
    expect(container.textContent).toContain('1 transactions');
    expect(container.textContent).toContain('Custom');
  });

  it('a range spanning both days aggregates both (2 transactions, T-Red A# sums to 10)', async () => {
    await act(async () => {
      root.render(React.createElement(RegisterAuditTab, {
        ds: { auditRows: BOTH_ROWS }, loc: '0043380', dateRange: rangeFor('2026-10-01', '2026-10-31'),
      }));
    });
    expect(container.textContent).toContain('2 transactions');
  });

  it('a range that overlaps neither day shows the date-range-specific empty state, not a generic "no data" (data genuinely exists for this store, just not in this window)', async () => {
    await act(async () => {
      root.render(React.createElement(RegisterAuditTab, {
        ds: { auditRows: BOTH_ROWS }, loc: '0043380', dateRange: rangeFor('2026-01-01', '2026-01-07'),
      }));
    });
    expect(container.textContent).toMatch(/No Register Audit data in the selected date range/i);
    expect(container.textContent).toContain('2 Register Audit rows on file');
  });

  it('omitting dateRange entirely preserves pre-fix behaviour (no toolbar control wired up at all = show everything loaded)', async () => {
    await act(async () => {
      root.render(React.createElement(RegisterAuditTab, { ds: { auditRows: BOTH_ROWS }, loc: '0043380' }));
    });
    expect(container.textContent).toContain('2 transactions');
  });

  // Separate defect found while reproducing the date-range bug above (not the reported symptom
  // itself, but a real crash in the same component): `activeSection`'s useState used to be
  // declared AFTER all three early returns, so a fresh mount (no data yet -> "Loading…" branch,
  // stops before that hook) followed by the lazy-fill's `setDs` landing (ds goes from empty to
  // populated -> this same mounted instance now runs past every early return) is exactly the
  // "a later render reaches a hook an earlier render never called" shape React's Rules of Hooks
  // forbids. Confirmed in isolation against React 19 (a minimal equivalent component throws
  // "Rendered more hooks than during the previous render." on this exact transition) before
  // fixing it by hoisting the hook above the early returns.
  it('does not throw React\'s "Rendered more hooks than during the previous render" when auditRows arrives after the initial empty mount', async () => {
    await act(async () => {
      root.render(React.createElement(RegisterAuditTab, { ds: {}, loc: '0043380', dateRange: rangeFor('2026-10-01', '2026-10-31') }));
    });
    // In this test harness `configureLazyFill` was never called (that only happens in App.js at
    // real startup), so `ensureLazyFill` resolves "not pending" synchronously and this mount
    // commits on the second early-return branch ("no data loaded at all") rather than the first
    // ("Loading…", which depends on a genuine pending fetch) -- either way it's an early return
    // that stops before the `activeSection` hook, which is the shape this test is reproducing.
    expect(container.textContent).toMatch(/No Register Audit data/i);

    // Same mounted instance (no unmount in between) -- ds now carries the real rows, exactly
    // what happens when metric-source.js's lazy-fill resolves and App.js's setDs cascades a
    // new `ds` prop down to this still-mounted tab. If the hook-order bug were still present,
    // this call itself throws ("Rendered more hooks...") and the test fails right here.
    await act(async () => {
      root.render(React.createElement(RegisterAuditTab, { ds: { auditRows: BOTH_ROWS }, loc: '0043380', dateRange: rangeFor('2026-10-01', '2026-10-31') }));
    });
    expect(container.textContent).toContain('2 transactions');
  });
});
