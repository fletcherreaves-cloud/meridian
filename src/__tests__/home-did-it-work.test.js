// @vitest-environment happy-dom
// @ts-nocheck
// "Did It Work?" home-screen tile -- the learning-loop widget (redesign Phase 3, 2026-10-08).
// Renders the actual AtAGlance component so the wiring (DEF_SECS gating, onNav, reading
// ds.coachingCycles) is what's under test, not just engine/coaching-loop.js (already covered
// by coaching-loop.test.js).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AtAGlance } from '../views/at-a-glance.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOOP = () => {};
const recent = n => new Date(Date.now() - n * 864e5);
const baseProps = {
  stores: [{ loc: '3708' }],
  settings: { weekStartDay: 3 },
  userEvents: [], lockedProjections: {},
  dateRange: { s: recent(10), e: recent(1) },
  onOpenStore: NOOP, onCoachingSaved: NOOP, onOpenProjections: NOOP,
  onOpenPVSA: NOOP, onOpenBrief: NOOP, onOpenModal: NOOP,
};
// AtAGlance shows a separate "no data loaded" screen (skipping the whole tile grid) unless
// at least one real sales row is present -- same minimal fixture home-needs-you-today.test.js
// uses to clear that gate without it standing in for this test's own subject.
const withSales = extra => ({ loaded: true, qsrActSummaryRows: [{ loc: '3708', date: recent(1), sales: 1000 }], ...extra });

describe('Did It Work? home-screen tile', () => {
  let container, root;
  beforeEach(() => { localStorage.clear(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('shows the most recently coached closed loop, baseline -> result, and its real verdict', () => {
    const ds = withSales({
      coachingCycles: [
        { loc: '3708', metric: 'labor_pct', baseline: 0.22, coachedAt: '2026-08-01', reviewAt: '2026-08-31', note: 'AM drive-thru staffing', result: 0.19, verdict: 'improved' },
        { loc: '3708', metric: 'condiment_pct', baseline: 0.02, coachedAt: '2026-06-01', reviewAt: '2026-07-01', result: 0.021, verdict: 'no change' }, // older
      ],
    });
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds, onNav: NOOP })); });
    expect(container.textContent).toContain('Did It Work?');
    expect(container.textContent).toContain('Labor %');
    expect(container.textContent).toContain('22.00%');
    expect(container.textContent).toContain('19.00%');
    expect(container.textContent).toContain('Improved');
    expect(container.textContent).not.toContain('Condiment %'); // the older cycle, not shown
  });

  it('shows an honest "worse" verdict too -- never only the wins', () => {
    const ds = withSales({
      coachingCycles: [
        { loc: '3708', metric: 'fob_total_pct', baseline: 0.27, coachedAt: '2026-09-01', reviewAt: '2026-10-01', result: 0.30, verdict: 'worse' },
      ],
    });
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds, onNav: NOOP })); });
    expect(container.textContent).toContain('Worse');
  });

  it('skips cycles still awaiting their review (result/verdict null) and shows the empty state when none are closed', () => {
    const ds = withSales({ coachingCycles: [{ loc: '3708', metric: 'labor_pct', baseline: 0.22, coachedAt: '2026-10-01', reviewAt: '2026-10-31', result: null, verdict: null }] });
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds, onNav: NOOP })); });
    expect(container.textContent).toContain('No coaching loop has closed yet');
  });

  it('is configurable off via the existing Sections toggle', () => {
    localStorage.setItem('mf_kpi_secs', JSON.stringify([{ id: 'coaching-loop', label: 'Did It Work?', icon: '✓', on: false }]));
    const ds = withSales({ coachingCycles: [{ loc: '3708', metric: 'labor_pct', baseline: 0.22, coachedAt: '2026-08-01', reviewAt: '2026-08-31', result: 0.19, verdict: 'improved' }] });
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds, onNav: NOOP })); });
    expect(container.textContent).not.toContain('Did It Work?');
  });
});
