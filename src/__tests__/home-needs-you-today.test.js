// @vitest-environment happy-dom
// @ts-nocheck
// Needs You Today (home-screen widgets, Task #16) — a thin preview tile on At A Glance over
// the SAME useAttentionFeed engine + ack store the full Needs Attention panel already uses, so
// the two surfaces can never disagree (CLAUDE.md: "diff the two computations" / "would this
// verification still pass if reverted"). Renders the actual AtAGlance component, not just the
// tile function in isolation, since the real risk is the wiring (DEF_SECS gating, onNav, the
// ack round-trip), not the already-tested engine.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AtAGlance } from '../views/at-a-glance.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOOP = () => {};
const recent = n => new Date(Date.now() - n * 864e5);

// Scopes a DOM query to just the Needs You Today tile, not the whole AtAGlance render --
// needed because at-a-glance.js ALSO has its own, unrelated "N days old" freshness banner
// (worstAuto's staleDays text), so a plain textContent search for "days old" across the full
// page can grab that banner instead of this tile's own staleData() item.
function tileCard(container) {
  const heading = [...container.querySelectorAll('div')].find(d => d.textContent === 'Needs You Today');
  return heading && heading.parentElement.parentElement.parentElement;
}

// Same traffic-divergence fixture dispatch-316's own wiring test uses: sales holding, guest
// counts falling — the McValue signature, reliably produces exactly one ranked item off a
// single store (unlike fobOutliers, which needs >=3 stores to establish a district rate).
const trafficFixture = () => ({
  ds: {
    loaded: true,
    qsrActSummaryRows: Array.from({ length: 20 }, (_, i) => ({
      loc: '3708', date: recent(i + 1), sales: 1010, lySales: 1000, gc: 90, lyGc: 100,
    })),
  },
  stores: [{ loc: '3708' }],
  dateRange: { s: recent(10), e: recent(1) },
});

const baseProps = {
  settings: { weekStartDay: 3 },
  userEvents: [], lockedProjections: {},
  onOpenStore: NOOP, onCoachingSaved: NOOP, onOpenProjections: NOOP,
  onOpenPVSA: NOOP, onOpenBrief: NOOP, onOpenModal: NOOP,
};

describe('Needs You Today home-screen tile', () => {
  let container, root;
  beforeEach(() => { localStorage.clear(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('leads the home screen by default and surfaces the same item the full Needs Attention panel would', () => {
    const { ds, stores, dateRange } = trafficFixture();
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds, stores, dateRange, onNav: NOOP })); });
    expect(container.textContent).toContain('Needs You Today');
    expect(container.textContent).toContain('traffic falling');
  });

  it('dismissing an item acks it via the SAME attention_acks store the full panel reads, and the tile reflects it immediately', async () => {
    const { ds, stores, dateRange } = trafficFixture();
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds, stores, dateRange, onNav: NOOP })); });
    expect(container.textContent).toContain('traffic falling');

    // This fixture fires two items (traffic divergence + guest-counts-down) for the same store —
    // dismiss only the first: the ✕ whose row ancestor carries that item's own title text.
    const dismissBtn = [...container.querySelectorAll('button[title="Dismiss for now"]')]
      .find(b => b.parentElement?.textContent.includes('sales holding, traffic falling'));
    expect(dismissBtn).toBeTruthy();
    // dismiss() is an async IIFE (awaits supabase.auth.getUser() before setAcks) — flush it.
    await act(async () => { dismissBtn.click(); await Promise.resolve(); await Promise.resolve(); });

    expect(container.textContent).not.toContain('traffic falling');
    expect(container.textContent).toContain('guest counts down'); // the OTHER item is untouched
  });

  it('the footer link still opens the full Needs Attention panel via onNav, unchanged (owner: "that link... is fine")', () => {
    const { ds, stores, dateRange } = trafficFixture();
    let navTo = null;
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds, stores, dateRange, onNav: v => { navTo = v; } })); });
    const footer = [...container.querySelectorAll('div')].find(d => d.textContent === 'Open Needs Attention →');
    expect(footer).toBeTruthy();
    act(() => { footer.click(); });
    expect(navTo).toBe('attention');
  });

  // Owner report 2026-10-14: "when clicking any link on Needs You Today Tile, it opens to a
  // blank page rather than taking me to the event(s)... open to actual context supporting
  // claim, not just hot link to needs attention." Root cause: every item row's onClick called
  // onNav('attention') -- the SAME call the footer makes -- and App.js's onNav (before this
  // fix) was literally setView('attention'), which matches no view==='...' render branch and
  // unmounts AtAGlance, producing a real blank page. Fixed two ways: App.js's onNav now routes
  // panel ids through goRoute (verified separately in app.js's own suite), and a row with a
  // `loc` opens that STORE directly via onOpenStore instead of the generic cross-store panel.
  it('clicking an item ROW opens that store directly (real context), not the generic Needs Attention panel', () => {
    const { ds, stores, dateRange } = trafficFixture();
    let opened = null;
    act(() => { root.render(React.createElement(AtAGlance, {
      ...baseProps, ds, stores, dateRange, onNav: NOOP, onOpenStore: (loc, tab) => { opened = { loc, tab }; },
    })); });
    // The dismiss button is a DIRECT child of the row div that carries the onClick handler
    // (at-a-glance.js's NeedsYouTodayTile row JSX), so its .parentElement IS that exact row --
    // unambiguous, unlike a plain textContent search over every <div>, which also matches the
    // row's own ancestors (they contain this row's text too) and can grab one with no handler.
    const dismissBtn = [...tileCard(container).querySelectorAll('button[title="Dismiss for now"]')].find(b => b.parentElement?.textContent.includes('sales holding, traffic falling'));
    expect(dismissBtn).toBeTruthy();
    act(() => { dismissBtn.parentElement.click(); });
    // trafficDivergenceAlerts items carry nav:'analytics' -- not in NEEDS_TODAY_NAV_TAB, so the
    // safe default tab ('overview', which shows that store's own findings + KPI vitals) applies.
    expect(opened).toEqual({ loc: '3708', tab: 'overview' });
  });

  it('a loc-less item (no store to open) still falls back to onNav, never throws for missing onOpenStore', () => {
    // All source rows 20+ days old (not just stale vs LY) -> useAttentionFeed's own ageDays
    // (freshest date across qsrActSummaryRows/laborRows/etc.) exceeds staleData()'s 14-day
    // crit bar -- a loc-less item by construction (attention-feed.js's staleData()).
    const ds = {
      loaded: true,
      qsrActSummaryRows: Array.from({ length: 20 }, (_, i) => ({ loc: '3708', date: recent(20 + i), sales: 1000, lySales: 1000, gc: 100, lyGc: 100 })),
    };
    let navTo = null;
    act(() => { root.render(React.createElement(AtAGlance, {
      ...baseProps, ds, stores: [{ loc: '3708' }], dateRange: { s: recent(30), e: recent(20) },
      onNav: v => { navTo = v; },
    })); });
    // Scoped to the tile itself -- at-a-glance.js ALSO has its own unrelated "N days old"
    // freshness banner elsewhere on the page (worstAuto's staleDays text), so an unscoped
    // search for "days old" can match that instead of this tile's own staleData() item.
    const dismissBtn = [...tileCard(container).querySelectorAll('button[title="Dismiss for now"]')].find(b => b.parentElement?.textContent.includes('days old'));
    expect(dismissBtn).toBeTruthy();
    act(() => { dismissBtn.parentElement.click(); });
    expect(navTo).toBe('signals'); // staleData's own item.nav, per attention-feed.js
  });

  it('is configurable off via the existing Sections toggle (mf_kpi_secs), per the "configurable front door" decision', () => {
    localStorage.setItem('mf_kpi_secs', JSON.stringify([{ id: 'attention', label: 'Needs You Today', icon: '🔴', on: false }]));
    const { ds, stores, dateRange } = trafficFixture();
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds, stores, dateRange, onNav: NOOP })); });
    expect(container.textContent).not.toContain('Needs You Today');
  });

  it('shows a clear-district empty state when nothing is flagged (regression guard)', () => {
    // A quiet store: sales flat vs LY, no gap on any detector — enough data for AtAGlance's own
    // noData gate to render the normal dashboard (not its separate "no data loaded" screen), but
    // nothing for any attention detector to flag.
    const ds = {
      loaded: true,
      qsrActSummaryRows: Array.from({ length: 20 }, (_, i) => ({
        loc: '3708', date: recent(i + 1), sales: 1000, lySales: 1000, gc: 100, lyGc: 100,
      })),
    };
    act(() => { root.render(React.createElement(AtAGlance, { ...baseProps, ds, stores: [{ loc: '3708' }], dateRange: { s: recent(10), e: recent(1) }, onNav: NOOP })); });
    expect(container.textContent).toContain('Needs You Today');
    expect(container.textContent).toContain('Nothing is flagged right now');
  });
});
