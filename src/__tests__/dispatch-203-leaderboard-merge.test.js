// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #203 -- merges Rankings / Record Days / Top-Bottom Performers into one leaderboard
// panel (store-dash.js's LeaderboardPanel) with three clearly labeled modes, per this repo's
// "would this verification still pass if the change were reverted?" standing rule: renders the
// REAL merged host, not just the three content components in isolation, so a bug in the merge's
// own mode-switch wiring (e.g. a mode tab that renders the wrong content, or a retired id that
// silently no-ops instead of redirecting) fails here even though each of the three components
// underneath is independently correct (and independently tested — see dispatch-155-store-dash-
// ranking-rate.test.js, dispatch-130/103-record-day-*.test.js, top-bottom-performers-panel.
// test.js, all updated by this same dispatch to target the peeled-apart content components).
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { LeaderboardPanel } from '../views/store-dash.js';
import { PANEL_BY_ID } from '../app/panel-registry.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOOP = () => {};

function mkStore(loc, name) {
  return {
    loc, name, city: 'Test City',
    p: { laborPct: 0.28, oepe: 175, tpph: 92, r2p: 100, _cov: {} },
    t: { tOepe: 180, tTpph: 90, tCrewLabor: 0.30 },
    opsScore: 78, ctrlScore: 82, vel: null,
    pSales: 52000, pLY: 49500,
    findings: [], gm: null, hasRecords: false,
  };
}

const STORES = [mkStore('10422', 'Test Store')];
const DS = { loaded: false }; // empty-data path for every mode -- smoke-tests the merge's own
                               // wiring without needing to fake three different data shapes.

describe('LeaderboardPanel — merged Rankings/Record Days/Top-Bottom Performers (dispatch #203)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  function render(props) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(React.createElement(LeaderboardPanel, {
        stores: STORES, ds: DS, settings: {}, dateRange: { s: new Date(), e: new Date() },
        onDateChange: NOOP, onSelectStore: NOOP, onClose: NOOP, ...props,
      }));
    });
  }

  it('owns a real RoutePanelShell (Back button), not a hand-rolled backdrop -- moved here from ' +
     'dispatch-130-record-day-export.test.js, since Record Days no longer owns its own shell', () => {
    render({});
    const backBtn = container.querySelector('button[aria-label="Back"]');
    expect(backBtn).toBeTruthy();
  });

  it('defaults to the Rankings mode, showing the metric picker (e.g. "Combined Score")', () => {
    render({});
    const labels = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(labels.some(l => l.includes('Combined Score'))).toBe(true);
  });

  it('clicking the Record Days mode tab swaps to RecordDayTab content', () => {
    render({});
    const modeBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Record Days'));
    expect(modeBtn).toBeTruthy();
    act(() => { modeBtn.click(); });
    // RecordDayTab's own inner tab strip (Overview/Recent Breaks/...) only renders once this
    // mode is active -- the Rankings-only "Combined Score" metric picker must be gone.
    const labels = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(labels.some(l => l.includes('Recent Breaks'))).toBe(true);
    expect(labels.some(l => l.includes('Combined Score'))).toBe(false);
    // Empty-data path: RecordDayTab's own real copy, not a placeholder from the merge.
    expect(container.textContent).toContain('Upload sales data to track records');
  });

  it('clicking the Top/Bottom mode tab swaps to TopBottomTab content', () => {
    render({});
    const modeBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Top/Bottom'));
    expect(modeBtn).toBeTruthy();
    act(() => { modeBtn.click(); });
    expect(container.textContent).toContain('Ranked at the individual store');
    const labels = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(labels.some(l => l.includes('Combined Score'))).toBe(false);
  });

  it('`mode: "record-day"` (the retired record-day modal redirect) opens straight on Record Days', () => {
    render({ mode: 'record-day' });
    expect(container.textContent).toContain('Upload sales data to track records');
    const labels = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(labels.some(l => l.includes('Recent Breaks'))).toBe(true);
  });

  it('`mode: "top-bottom"` (the retired top-bottom modal redirect) opens straight on Top/Bottom', () => {
    render({ mode: 'top-bottom' });
    expect(container.textContent).toContain('Ranked at the individual store');
  });

  // Found in PM verification 2026-08-28: 'top-bottom' kept its pre-merge analytics.district perm
  // (stricter than 'ranking'/'record-day''s analytics.store) in panel-registry.js and the old
  // deep-link modal handler, but LEADERBOARD_MODES itself rendered all three mode tabs
  // unconditionally with no perm passed through -- so a user with only analytics.store (e.g. a
  // Supervisor) who opened Leaderboards via ordinary nav and clicked the Top/Bottom tab could
  // reach content that was previously gated at the district level. Mirrors SCHED_TABS/
  // SchedulingHubPanel's established per-tab perm-filter pattern (App.js).
  it('a caller without analytics.district cannot reach the Top/Bottom mode via the tab strip', () => {
    const storeOnlyPerm = k => k !== 'analytics.district';
    render({ perm: storeOnlyPerm });
    const labels = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(labels.some(l => l.includes('Top/Bottom'))).toBe(false);
  });

  it('a caller without analytics.district requesting mode:"top-bottom" falls back to Rankings, not the gated content', () => {
    const storeOnlyPerm = k => k !== 'analytics.district';
    render({ mode: 'top-bottom', perm: storeOnlyPerm });
    expect(container.textContent).not.toContain('Ranked at the individual store');
    const labels = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(labels.some(l => l.includes('Combined Score'))).toBe(true);
  });

  it('a caller WITH analytics.district can still reach Top/Bottom normally', () => {
    render({ mode: 'top-bottom', perm: () => true });
    expect(container.textContent).toContain('Ranked at the individual store');
  });
});

describe('registry — record-day/top-bottom retired to internal, ranking promoted-in-place (dispatch #203)', () => {
  it('ranking stays kind:nav/route:true (the surviving id) and is relabeled to cover all three modes', () => {
    expect(PANEL_BY_ID['ranking'].kind).toBe('nav');
    expect(PANEL_BY_ID['ranking'].route).toBe(true);
    expect(PANEL_BY_ID['ranking'].label).toBe('Leaderboards');
  });

  it('record-day is kind:internal (no longer optional/Panel-Manager-toggleable), id kept for redirects', () => {
    expect(PANEL_BY_ID['record-day'].kind).toBe('internal');
  });

  it('top-bottom is kind:internal (promoted out of test-kitchen, per the standing kind-flip promotion rule), id kept for redirects', () => {
    expect(PANEL_BY_ID['top-bottom'].kind).toBe('internal');
    expect(PANEL_BY_ID['top-bottom'].tkOrder).toBeUndefined();
  });
});
