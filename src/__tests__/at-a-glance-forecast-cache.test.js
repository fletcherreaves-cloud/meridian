// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch22, Workstream A — renders the actual AtAGlance panel (not just the engine) so a
// revert of the wiring, not just the cache-reading logic, would fail this test (CLAUDE.md:
// "would this verification still pass if the change were reverted?" — #366's own lesson).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AtAGlance } from '../views/at-a-glance.js';
import { dKey } from '../utils/date.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Matches weekProjections' own week-anchor logic exactly (weekStartDay:3 = Wednesday).
function currentWeekDays(wsd = 3) {
  const today = new Date();
  const ws = new Date(today);
  while (ws.getDay() !== wsd) ws.setDate(ws.getDate() - 1);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate(), 12);
    d.setDate(d.getDate() + i);
    return d;
  });
}

const NOOP = () => {};
const baseProps = {
  stores: [{ loc: '10422' }],
  settings: { weekStartDay: 3 },
  userEvents: [],
  lockedProjections: {},
  dateRange: { s: new Date(2020, 0, 1), e: new Date(), label: 'MTD' },
  onOpenStore: NOOP, onCoachingSaved: NOOP, onOpenProjections: NOOP,
  onOpenPVSA: NOOP, onOpenBrief: NOOP, onNav: NOOP, onOpenModal: NOOP,
};

describe('AtAGlance weekProjections reads the precomputed forecast_week_cache', () => {
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

  it('renders the cached weekly total for a store whose full current week is cached, not a live-computed one', async () => {
    const weekDays = currentWeekDays();
    // A distinctive per-day forecast the live path (near-empty laborRows/qsrActSummaryRows
    // fixture) could not plausibly produce on its own — $5,000/day = $35,000 for the week.
    const forecastWeekCache = weekDays.map(d => ({ loc: '10422', date: d, forecast: 5000, actual: null, ly: 4800, modelUsed: 'ae' }));
    const ds = {
      loaded: true,
      laborRows: [{ loc: '10422', date: weekDays[0], sales: 1 }], // just enough for noData=false
      qsrActSummaryRows: [],
      forecastWeekCache,
    };

    await act(async () => {
      root.render(React.createElement(AtAGlance, { ...baseProps, ds }));
    });

    // District Total in the header line, and the store row's Proj cell — both derived from
    // wkTotal, which is 7 x 5000 only if every day actually came from the cache.
    expect(container.textContent).toMatch(/\$35,000/);
  });

  it('falls back to live computation (no crash, panel still renders) when the cache is empty', async () => {
    const weekDays = currentWeekDays();
    const ds = {
      loaded: true,
      laborRows: [{ loc: '10422', date: weekDays[0], sales: 1000 }],
      qsrActSummaryRows: [],
      forecastWeekCache: [], // nothing cached yet — e.g. precompute job hasn't run
    };

    await act(async () => {
      root.render(React.createElement(AtAGlance, { ...baseProps, ds }));
    });

    expect(container.textContent).toMatch(/District Projection/);
    // Must NOT show the cache fixture's distinctive total — proves this render path is
    // genuinely independent of the cache being present at all.
    expect(container.textContent).not.toMatch(/\$35,000/);
  });

  it('falls back to live computation for a store with only a PARTIAL current-week cache', async () => {
    const weekDays = currentWeekDays();
    // Only 3 of 7 days cached — a real state during a mid-week backfill or a new store.
    const forecastWeekCache = weekDays.slice(0, 3).map(d => ({ loc: '10422', date: d, forecast: 5000, actual: null, ly: 4800, modelUsed: 'ae' }));
    const ds = {
      loaded: true,
      laborRows: [{ loc: '10422', date: weekDays[0], sales: 1000 }],
      qsrActSummaryRows: [],
      forecastWeekCache,
    };

    await act(async () => {
      root.render(React.createElement(AtAGlance, { ...baseProps, ds }));
    });

    expect(container.textContent).toMatch(/District Projection/);
    expect(container.textContent).not.toMatch(/\$35,000/);
  });
});
