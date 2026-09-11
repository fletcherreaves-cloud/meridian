// @vitest-environment happy-dom
// @ts-nocheck
// McDonald's canceled all CFV and RGR graded visits for the remainder of 2026, effective
// 09/15/26 (owner-notified 2026-09-11). The readiness composite (SPEED/ACCURACY/QUALITY/
// LEADERSHIP) predicts CFV/RGRV standards specifically -- EcoSure's own criteria are already
// excluded from it -- so per-store readiness score/band is replaced with a neutral "Suspended"
// state for the duration, per owner direction. EcoSure / the Waste & variance flag are
// unaffected either way.
//
// Per the standing "would this verification still pass if reverted" rule, the panel test below
// renders the ACTUAL VisitReadinessPanel consumer (not just activeVisitSuspension() in
// isolation) with the system clock faked into the suspension window -- an engine-only test
// could prove the date-window arithmetic right while the panel never read it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { computeVisitReadiness, activeVisitSuspension, VISIT_SUSPENSIONS } from '../engine/visit-readiness.js';
import { VisitReadinessPanel } from '../views/visit-readiness.js';
import { DEFAULT_TARGETS } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('activeVisitSuspension (pure date-window check)', () => {
  it('is null well before the suspension window', () => {
    expect(activeVisitSuspension(new Date('2026-09-01T12:00:00').getTime())).toBeNull();
  });
  it('is active on the first day of the window (2026-09-15)', () => {
    const s = activeVisitSuspension(new Date('2026-09-15T12:00:00').getTime());
    expect(s).toBeTruthy();
    expect(s.types).toEqual(['CFV', 'RGR']);
  });
  it('is active in the middle of the window', () => {
    expect(activeVisitSuspension(new Date('2026-11-01T12:00:00').getTime())).toBeTruthy();
  });
  it('is active on the last day of the window (2026-12-31)', () => {
    expect(activeVisitSuspension(new Date('2026-12-31T12:00:00').getTime())).toBeTruthy();
  });
  it('is null the day after the window ends', () => {
    expect(activeVisitSuspension(new Date('2027-01-01T12:00:00').getTime())).toBeNull();
  });
  it('does not name EcoSure among the suspended types', () => {
    for (const s of VISIT_SUSPENSIONS) expect(s.types).not.toContain('EcoSure');
  });
});

// Same fixture shape as visit-readiness.test.js's goodRows().
const LOC = '3708';
function goodRows(loc) {
  const t = DEFAULT_TARGETS[loc];
  const recent = n => new Date(Date.now() - n * 864e5);
  const days = [recent(1), recent(3), recent(6)];
  return {
    glimpseRows: days.map(d => ({ loc, date: d, oepe: t.tOepe * 0.85, kvst: t.tKvst * 0.8, laborPct: t.tCrewLabor * 0.92 })),
    opsRows: days.map(d => ({ loc, date: d, park: t.tPark * 0.7, r2p: t.tR2p * 0.85 })),
    laborRows: days.map(d => ({ loc, date: d, tpph: t.tTpph * 1.15, laborPct: t.tCrewLabor * 0.92 })),
    schedRows: days.map(d => ({ loc, date: d, schVsIdealDiff: 1 })),
  };
}
function mkDs() {
  const r = goodRows(LOC);
  return { glimpseRows: r.glimpseRows, opsRows: r.opsRows, laborRows: r.laborRows, schedRows: r.schedRows };
}

describe('computeVisitReadiness -- suspension field', () => {
  it('carries the same value activeVisitSuspension() would return right now', () => {
    const res = computeVisitReadiness(mkDs());
    expect(res.suspension).toEqual(activeVisitSuspension());
  });
});

describe('Visit Readiness panel -- suspended state (system clock faked into the window)', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('shows the suspension banner and replaces the store band with "Suspended" once the window is active', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T12:00:00'));
    const ds = mkDs();
    act(() => { root.render(React.createElement(VisitReadinessPanel, { ds, onClose: () => {} })); });

    expect(container.textContent).toContain('CFV & RGR graded visits suspended');
    expect(container.textContent).toContain('Suspended — no visit scheduled');
    // The normal band vocabulary (capitalized pill labels + verdict) must not appear anywhere
    // while suspended -- would mislead a reader into thinking a live CFV/RGR prediction is
    // still showing. (The static lowercase "ready" caption under the score number is a
    // different, unconditional UI element and is deliberately not asserted against here.)
    expect(container.textContent).not.toContain('Ready');
    expect(container.textContent).not.toContain('At risk');
    expect(container.textContent).not.toContain('On track for a graded visit');
  });

  it('shows the normal band vocabulary and no banner before the suspension window starts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00'));
    const ds = mkDs();
    act(() => { root.render(React.createElement(VisitReadinessPanel, { ds, onClose: () => {} })); });

    expect(container.textContent).not.toContain('CFV & RGR graded visits suspended');
    expect(container.textContent).not.toContain('Suspended — no visit scheduled');
    expect(container.textContent).toContain('Ready');
  });
});
