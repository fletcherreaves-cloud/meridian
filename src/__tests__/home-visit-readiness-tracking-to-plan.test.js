// @vitest-environment happy-dom
// @ts-nocheck
// Visit Readiness + Tracking to Plan home-screen tiles (redesign Phase 3, owner-requested
// 2026-10-08). Renders the actual AtAGlance component, not the tile functions in isolation,
// per CLAUDE.md's "would this verification still pass if reverted" rule -- the real risk is
// the wiring (DEF_SECS gating, prop threading from App.js's darRows, onNav), not the already
// unit-tested engines (visit-readiness.test.js, tracking-to-plan.test.js).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AtAGlance } from '../views/at-a-glance.js';
import { DEFAULT_TARGETS } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOOP = () => {};
const recent = n => new Date(Date.now() - n * 864e5);

// Same "badly missing targets everywhere" fixture visit-readiness.test.js uses, for a store
// that reliably lands in the at-risk band with a real topDriver/verdict.
const BAD = '5183';
function atRiskDs() {
  const t = DEFAULT_TARGETS[BAD];
  const days = [recent(1), recent(3), recent(6)];
  return {
    loaded: true,
    glimpseRows: days.map(d => ({ loc: BAD, date: d, oepe: t.tOepe * 1.6, kvst: t.tKvst * 1.7, laborPct: t.tCrewLabor * 1.4 })),
    opsRows: days.map(d => ({ loc: BAD, date: d, park: t.tPark * 2.5, r2p: t.tR2p * 1.6 })),
    laborRows: days.map(d => ({ loc: BAD, date: d, tpph: t.tTpph * 0.6, laborPct: t.tCrewLabor * 1.4 })),
    gradedVisits: [], // present (even empty) so the tile skips its own async load in tests
  };
}

const baseProps = {
  settings: { weekStartDay: 3 },
  userEvents: [], lockedProjections: {},
  onOpenStore: NOOP, onCoachingSaved: NOOP, onOpenProjections: NOOP,
  onOpenPVSA: NOOP, onOpenBrief: NOOP, onOpenModal: NOOP,
};

describe('Visit Readiness home-screen tile', () => {
  let container, root;
  beforeEach(() => { localStorage.clear(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('shows the weakest store, its readiness score and a real coaching verdict -- same engine the Visit Readiness panel uses', () => {
    const ds = atRiskDs();
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds, stores: [{ loc: BAD }], dateRange: { s: recent(10), e: recent(1) }, onNav: NOOP })); });
    expect(container.textContent).toContain('Visit Readiness');
    expect(container.textContent).toContain('/100');
    expect(container.textContent).toMatch(/at-risk/i);
  });

  it('clicking the verdict line opens the real Visit Readiness panel via onNav', () => {
    const ds = atRiskDs();
    let navTo = null;
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds, stores: [{ loc: BAD }], dateRange: { s: recent(10), e: recent(1) }, onNav: v => { navTo = v; } })); });
    const header = [...container.querySelectorAll('div')].find(d => d.textContent === 'Visit Readiness');
    const card = header.closest('div[style*="surf2"]');
    const verdict = card?.querySelector('div[style*="cursor: pointer"]');
    expect(verdict).toBeTruthy();
    act(() => { verdict.click(); });
    expect(navTo).toBe('visit-readiness');
  });

  it('is configurable off via the existing Sections toggle, same mechanism as every other tile', () => {
    localStorage.setItem('mf_kpi_secs', JSON.stringify([{ id: 'visit-readiness-today', label: 'Visit Readiness', icon: '🛡️', on: false }]));
    const ds = atRiskDs();
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds, stores: [{ loc: BAD }], dateRange: { s: recent(10), e: recent(1) }, onNav: NOOP })); });
    expect(container.textContent).not.toContain('Visit Readiness');
  });
});

describe('Tracking to Plan home-screen tile', () => {
  let container, root;
  beforeEach(() => { localStorage.clear(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

  it('shows all 5 granularities -- hourly, daily, weekly, monthly, YTD -- and names its weekly/monthly/YTD derivation', () => {
    const LOC = '3708';
    const ds = { loaded: true, qsrActSummaryRows: [{ loc: LOC, date: new Date(), sales: 1000 }] };
    const darRows = [
      { loc: LOC, dt: todayStr, hour_slot: '10:00', product_sales: 500, proj_sales_dollars: 600 },
      { loc: LOC, dt: todayStr, hour_slot: '11:00', product_sales: 0, proj_sales_dollars: 400 },
    ];
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds, stores: [{ loc: LOC }], darRows, dateRange: { s: recent(10), e: recent(1) }, onNav: NOOP })); });
    expect(container.textContent).toContain('Tracking to Plan');
    expect(container.textContent).toContain('Hourly');
    expect(container.textContent).toContain('Daily');
    expect(container.textContent).toContain('Weekly');
    expect(container.textContent).toContain('Monthly');
    expect(container.textContent).toContain('YTD');
    expect(container.textContent).toMatch(/derived/i);
  });

  it('only counts TODAY\'s darRows for the hourly/daily figures (a stale-date row must not leak in)', () => {
    const LOC = '3708';
    const ds = { loaded: true, qsrActSummaryRows: [] };
    const darRows = [
      { loc: LOC, dt: '2020-01-01', hour_slot: '10:00', product_sales: 9999999, proj_sales_dollars: 1 },
    ];
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds, stores: [{ loc: LOC }], darRows, dateRange: { s: recent(10), e: recent(1) }, onNav: NOOP })); });
    // The stale row's wildly-inflated $ would make pace read far over 100% if it leaked in.
    expect(container.textContent).not.toContain('9,999,999');
  });

  it('clicking through opens Signals via onNav', () => {
    const LOC = '3708';
    const ds = { loaded: true, qsrActSummaryRows: [{ loc: LOC, date: new Date(), sales: 1000 }] };
    let navTo = null;
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds, stores: [{ loc: LOC }], darRows: [], dateRange: { s: recent(10), e: recent(1) }, onNav: v => { navTo = v; } })); });
    const footer = [...container.querySelectorAll('div')].find(d => d.textContent === 'Open Signals →');
    expect(footer).toBeTruthy();
    act(() => { footer.click(); });
    expect(navTo).toBe('signals');
  });

  it('is configurable off via the existing Sections toggle', () => {
    localStorage.setItem('mf_kpi_secs', JSON.stringify([{ id: 'tracking-to-plan', label: 'Tracking to Plan', icon: '⏱', on: false }]));
    const ds = { loaded: true, qsrActSummaryRows: [] };
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds, stores: [{ loc: '3708' }], darRows: [], dateRange: { s: recent(10), e: recent(1) }, onNav: NOOP })); });
    expect(container.textContent).not.toContain('Tracking to Plan');
  });
});
