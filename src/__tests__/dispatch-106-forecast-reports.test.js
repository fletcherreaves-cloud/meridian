// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #106 — Phase A (ForecastAccuracyPanel's Weekly / Daily Breakdown) and Phase B (the
// merge of ForecastAccuracyPanel + LifeLenzBridgePanel into one ForecastReportsPanel with an
// internal tab switcher). Renders the REAL exported consumers end to end (not the grouping
// helper or the tab-shell in isolation), per this repo's "would this verification still pass if
// reverted?" standing rule -- a test that only calls groupForecastDaysByWeek() directly could
// pass unchanged with the panel's own wiring to it deleted, or with the merge's tab shell never
// actually mounting both real panels.
//
// forecastDay is mocked to a value that is a pure, deterministic function of the calendar day
// (so weekly sums are independently re-derivable inside this test, not hand-computed magic
// numbers) -- Meridian's forecast engine itself is not what's under test here. '../lib/
// supabase.js' is mocked so importing it doesn't require a live Supabase session in this
// sandbox, matching dispatch #105's own test for the same two files.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '10422';

// forecast(date) = actual(date) + 50, both pure functions of date.getDay() -- lets this test
// re-derive expected weekly $ totals from the same formula instead of hand-computed constants.
const actualFor = (d) => 1000 + new Date(d).getDay() * 10;
const forecastFor = (d) => actualFor(d) + 50;

vi.mock('../engine/forecast.js', () => ({
  forecastDay: (loc, date /*, ds, settings, precomputed, targets, extra, forceModel */) => {
    const a = actualFor(date);
    return { forecast: a + 50, isFuture: false, modelUsed: 'mock', lyAdj: a - 20 };
  },
  getModelAssignment: () => null,
}));

const loadForecastSnapshotsMock = vi.fn(async () => []);
vi.mock('../lib/supabase.js', () => ({
  loadForecastSnapshots: (...args) => loadForecastSnapshotsMock(...args),
  loadQsrProjections: async () => ({}),
  saveForecastSnapshots: async () => {},
}));

import { ForecastReportsPanel } from '../features/forecast-reports.js';

const f$ = (n) => '$' + Math.round(n).toLocaleString();

// Two full Wed-start weeks, Jul 15 (a real Wednesday) - Jul 28 2026 -- safely closed relative
// to this sandbox's 2026-08-24 system clock, matching CLAUDE.md's stated "current date".
function baseDs() {
  const laborRows = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(2026, 6, 15 + i); // Jul 15 .. Jul 28
    laborRows.push({ loc: LOC, date: d, sales: actualFor(d) });
  }
  return { loaded: true, laborRows };
}

const SETTINGS = { weekStartDay: 3 }; // 0=Sun 1=Mon 3=Wed -- DEF_SETTINGS' own value

function setInputValue(el, v) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
async function flush(container, maxTicks = 20) {
  let last;
  for (let i = 0; i < maxTicks; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 15)); });
    if (container.textContent === last) return;
    last = container.textContent;
  }
}
async function clickByText(container, tag, text, exact = false) {
  const el = [...container.querySelectorAll(tag)].find((b) =>
    exact ? b.textContent.trim() === text : b.textContent.includes(text));
  expect(el, `no <${tag}> found containing "${text}"`).toBeTruthy();
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  return el;
}

describe('ForecastReportsPanel (dispatch #106 Phase B) -- merged tab shell over the two real panels', () => {
  let container, root;
  beforeEach(() => {
    loadForecastSnapshotsMock.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('opens on the Forecast Accuracy tab by default, with the LifeLenz tab mounted but hidden', async () => {
    await act(async () => {
      root.render(React.createElement(ForecastReportsPanel, {
        stores: [{ loc: LOC }], ds: baseDs(), settings: SETTINGS, userEvents: {}, onClose: () => {},
      }));
    });
    await flush(container);

    const wrappers = container.firstElementChild.children;
    expect(wrappers.length).toBe(2);
    expect(wrappers[0].style.display).toBe('block'); // fcst-accuracy
    expect(wrappers[1].style.display).toBe('none');  // lifelenz-bridge -- mounted, not visible

    expect(container.textContent).toContain('🎯 Forecast Accuracy Report');
    // The real LifeLenzBridgePanel is genuinely mounted underneath (its own title text exists
    // in the DOM even while display:none) -- proving this is a hidden pane, not an unmounted one.
    expect(container.textContent).toContain('MBI vs LifeLenz Accuracy');
  });

  it('honors initialTab -- opening via the lifelenz-bridge hub-tab id lands on that pane directly', async () => {
    await act(async () => {
      root.render(React.createElement(ForecastReportsPanel, {
        stores: [{ loc: LOC }], ds: baseDs(), settings: SETTINGS, userEvents: {}, onClose: () => {},
        initialTab: 'lifelenz-bridge',
      }));
    });
    await flush(container);

    const wrappers = container.firstElementChild.children;
    expect(wrappers[0].style.display).toBe('none');
    expect(wrappers[1].style.display).toBe('block');
  });

  it('the report-switcher tab actually swaps the visible pane, and a completed backtest survives switching away and back', async () => {
    await act(async () => {
      root.render(React.createElement(ForecastReportsPanel, {
        stores: [{ loc: LOC }], ds: baseDs(), settings: SETTINGS, userEvents: {}, onClose: () => {},
      }));
    });
    await flush(container);

    // Run a real backtest on the Forecast Accuracy tab (Custom range over the fixture window).
    // Date inputs are scoped to the fcst-accuracy pane -- LifeLenzBridgePanel (mounted
    // underneath, hidden) always renders its own two date inputs too (disabled, not
    // conditional), so an unscoped query would pick up four, not two.
    await clickByText(container, 'button', 'Custom', true);
    const fcstPane = container.firstElementChild.children[0];
    const dateInputs = [...fcstPane.querySelectorAll('input[type="date"]')];
    expect(dateInputs.length).toBe(2);
    await act(async () => {
      setInputValue(dateInputs[0], '2026-07-15');
      setInputValue(dateInputs[1], '2026-07-28');
    });
    await clickByText(container, 'button', '▶ Run Backtest');
    await flush(container);
    expect(container.textContent).toContain('Best Model (District)');

    // Switch to the MBI vs LifeLenz Accuracy tab via the report switcher (rendered inside each
    // panel's own header via the new headerTabs prop) -- use the FIRST match; the switcher
    // renders once per mounted pane (both stay mounted), both wired to the same setTab.
    await clickByText(container, 'button', '🌉 MBI vs LifeLenz Accuracy');
    await flush(container);
    let wrappers = container.firstElementChild.children;
    expect(wrappers[0].style.display).toBe('none');
    expect(wrappers[1].style.display).toBe('block');

    // Switch back -- the backtest results must still be there (both tabs stay mounted, not
    // remounted on every switch), not reset to the empty "Select a period" state.
    await clickByText(container, 'button', '🎯 Forecast Accuracy');
    await flush(container);
    wrappers = container.firstElementChild.children;
    expect(wrappers[0].style.display).toBe('block');
    expect(wrappers[1].style.display).toBe('none');
    expect(container.textContent).toContain('Best Model (District)');
    expect(container.textContent).not.toContain('Select a period and run the backtest');
  });
});

describe('ForecastAccuracyPanel Weekly / Daily Breakdown (dispatch #106 Phase A)', () => {
  let container, root;
  beforeEach(() => {
    loadForecastSnapshotsMock.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('groups the backtest into real Wednesday-start weeks and renders per-day + per-week Forecast/Actual/Variance, additive to the unchanged period-aggregate view', async () => {
    await act(async () => {
      root.render(React.createElement(ForecastReportsPanel, {
        stores: [{ loc: LOC }], ds: baseDs(), settings: SETTINGS, userEvents: {}, onClose: () => {},
      }));
    });
    await flush(container);

    await clickByText(container, 'button', 'Custom', true);
    // Scoped to the fcst-accuracy pane -- see the same note in the Phase B describe block above.
    const fcstPane = container.firstElementChild.children[0];
    const dateInputs = [...fcstPane.querySelectorAll('input[type="date"]')];
    expect(dateInputs.length).toBe(2);
    await act(async () => {
      setInputValue(dateInputs[0], '2026-07-15');
      setInputValue(dateInputs[1], '2026-07-28');
    });
    await clickByText(container, 'button', '▶ Run Backtest');
    await flush(container);

    // The pre-existing period-aggregate MAPE view is unchanged -- still present, not replaced.
    expect(container.textContent).toContain('Best Model (District)');
    expect(container.textContent).toContain('AI Forecast MAPE');
    expect(container.textContent).toContain('MAPE by Store');

    // The new section starts collapsed -- expand it.
    expect(container.textContent).toContain('▶ Weekly / Daily Breakdown');
    await clickByText(container, 'span', 'Weekly / Daily Breakdown');
    await flush(container);
    expect(container.textContent).toContain('▲ Weekly / Daily Breakdown');

    // Real Wed-start week boundaries (settings.weekStartDay=3): Jul 15 2026 IS a Wednesday, so
    // the two weeks are exactly Jul 15-21 and Jul 22-28 -- not a Sun/Mon-start boundary.
    expect(container.textContent).toContain('Week of Jul 15–Jul 21');
    expect(container.textContent).toContain('Week of Jul 22–Jul 28');
    expect(container.textContent).not.toContain('Week of Jul 12–Jul 18'); // a Sunday-start boundary
    expect(container.textContent).not.toContain('Week of Jul 13–Jul 19'); // a Monday-start boundary

    // Weekly totals are dollar-weighted sums (re-derived here from the same actualFor/
    // forecastFor formulas the mock uses), not an average of per-day percentages.
    const week1Days = Array.from({ length: 7 }, (_, i) => new Date(2026, 6, 15 + i));
    const week2Days = Array.from({ length: 7 }, (_, i) => new Date(2026, 6, 22 + i));
    const wkActual1 = week1Days.reduce((s, d) => s + actualFor(d), 0);
    const wkForecast1 = week1Days.reduce((s, d) => s + forecastFor(d), 0);
    const wkActual2 = week2Days.reduce((s, d) => s + actualFor(d), 0);
    const wkForecast2 = week2Days.reduce((s, d) => s + forecastFor(d), 0);
    expect(container.textContent).toContain(f$(wkForecast1));
    expect(container.textContent).toContain(f$(wkActual1));
    expect(container.textContent).toContain(f$(wkForecast2));
    expect(container.textContent).toContain(f$(wkActual2));
    // Every day in this fixture is forecast $50 over actual -- the weekly variance is exactly
    // $350 over (7 days x $50), for BOTH weeks (7-day weeks either side of the boundary).
    expect(container.textContent).toContain(f$(350) + ' over');

    // One real day-level row: Jul 15 2026 is a Wednesday (getDay()=3).
    const jul15 = new Date(2026, 6, 15);
    expect(container.textContent).toContain(f$(forecastFor(jul15)));
    expect(container.textContent).toContain(f$(actualFor(jul15)));
    expect(container.textContent).toContain('Wed');
  });
});
