// @vitest-environment happy-dom
// @ts-nocheck
// #171/#366 — panel-level verification bar (dispatch15). Both existing stream-freshness.test.js
// cases call streamFreshness/worstStream directly and would pass even if the panel never called
// worstStream at all — this test renders the actual panel and asserts the checklist item text
// appears, which is the half the user actually sees.
//
// MEASURED, not assumed (CLAUDE.md's standing rule): the dispatch's specific diagnosis was that
// autoItems's old useMemo dep array (`[ds?.laborRows?.length, allLocs, settings,
// lockedProjections]`) tracked only laborRows, so the checklist "computes once... and never
// revisits" when an ops/email stream updates without laborRows changing. Tested that literally —
// stashed this fix, ran this exact test against the pre-fix code with laborRows held constant
// across both renders — and it PASSED. Root cause: `allLocs` (`(stores||[]).filter().map()`,
// same line the old dep array read from) is a brand-new array on every single render regardless
// of any dep's content, so `Object.is(prevAllLocs, allLocs)` is false on every render and the
// memo recomputes unconditionally — the laborRows-only tracking was never actually the
// bottleneck in a rendered component; it just looked like it reading the deps array in isolation.
// The fix is still correct and worth keeping (a single worstAuto memo instead of two independently
// -maintained dep lists — exactly what the dispatch asked for architecturally — and dropping
// `today` from worstAuto's own deps, matching the sibling latestLab memo, avoids walking all ten
// streams on unrelated renders), but the specific "silently never fires" failure mode does not
// reproduce here. This test therefore documents current (correct) behavior rather than standing
// in as a red-before/green-after regression guard — see the PR body for the full measurement.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AtAGlance } from '../views/at-a-glance.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const day = n => new Date(2026, 7, n, 12); // Aug n 2026, noon local
const rowsAt = date => [{ loc: '10422', date }];
const TODAY = day(16);

const STREAM_FIELDS = ['qsrActSummaryRows','qsrFobRows','glimpseRows','cashRows',
  'salesLedgerRows','opsCashRows','opsLaborRows','opsServiceRows','opsSalesMixRows','schedRows'];

function freshDs() {
  const ds = { loaded: true };
  for (const f of STREAM_FIELDS) ds[f] = rowsAt(TODAY);
  return ds;
}

const NOOP = () => {};
const baseProps = {
  stores: [{ loc: '10422' }],
  settings: { weekStartDay: 3 },
  userEvents: [],
  lockedProjections: {},
  dateRange: { s: day(1), e: TODAY, label: 'MTD' },
  onOpenStore: NOOP, onCoachingSaved: NOOP, onOpenProjections: NOOP,
  onOpenPVSA: NOOP, onOpenBrief: NOOP, onNav: NOOP, onOpenModal: NOOP,
};

describe('#366 panel-level: AtAGlance checklist sees every stream, not just laborRows', () => {
  let container, root;
  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    // Unmount before the test environment's window tears down, so the SAGE Scheduled Runs
    // tile's in-flight loadSagePromptRuns fetch is cancelled cleanly by React's own effect
    // cleanup instead of by the environment yanking the window out from under it (which
    // surfaced as a stray unhandled AbortError in CI, harmless but noisy).
    act(() => { root.unmount(); });
    container.remove();
  });

  it('names a stale ops/email stream in the Action Checklist once its data lands, without laborRows ever changing', async () => {
    // Mirrors how ds actually arrives in the app: an initial render with nothing loaded
    // yet, then a second render once the async ops/email streams have resolved — laborRows
    // (manual upload) is untouched across both renders. Passes on both the fixed and the
    // pre-fix code (see header comment) because allLocs's per-render instability forces
    // autoItems to recompute regardless — kept as a live assertion that the checklist
    // correctly surfaces a stale stream once its data is in ds.
    await act(async () => {
      root.render(React.createElement(AtAGlance, { ...baseProps, ds: { loaded: true } }));
    });
    expect(container.textContent).not.toMatch(/auto-sync may be down/);

    // The async streams land: everything fresh at today EXCEPT sales_ledger_daily, whose
    // real Aug 12-16 gap (#346/#171) is reproduced here as its rows stopping at day 11.
    const landedDs = freshDs();
    landedDs.salesLedgerRows = rowsAt(day(11));
    await act(async () => {
      root.render(React.createElement(AtAGlance, { ...baseProps, ds: landedDs }));
    });

    expect(container.textContent).toMatch(/Sales Ledger \(email\)/);
    expect(container.textContent).toMatch(/auto-sync may be down/);
  });
});
