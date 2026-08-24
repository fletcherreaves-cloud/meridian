// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #105 Part 1 -- LifeLenzBridgePanel gets a real date-range control plus a
// Wednesday-start weekly grouping (settings.weekStartDay, not a hardcoded "3"). Also covers
// the dispatch #105 correction landed mid-build: computeLifeLenzAdjustment must prefer the
// auto-pulled LifeLenz forecast (ds.schedRows.fcstSales) over a manually-uploaded one
// (ds.laborRows.projSales) when both exist for the same date -- "no guessing" when a real
// number is already sitting there.
//
// Renders the REAL LifeLenzBridgePanel consumer (not runLifeLenzBridgeScan/groupDaysByWeek in
// isolation), per this repo's "would this verification still pass if reverted?" standing rule --
// a test that only imports the engine functions could pass unchanged with the panel's date
// inputs/weekly toggle deleted. forecastDay is mocked to a fixed value (Meridian's forecast
// engine itself is not what's under test here); ../lib/supabase.js is mocked purely so importing
// it doesn't require a live Supabase session in this sandbox -- runAccuracy (Part 2) is exercised
// separately below via that mock, not left uncovered.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '33704'; // Tecumseh -- a real STORE_NAMES key

vi.mock('../engine/forecast.js', () => ({
  forecastDay: () => ({ forecast: 10000, isFuture: false, modelUsed: 'mock' }),
  getModelAssignment: () => null,
}));

const loadForecastSnapshotsMock = vi.fn(async () => []);
vi.mock('../lib/supabase.js', () => ({
  loadForecastSnapshots: (...args) => loadForecastSnapshotsMock(...args),
}));

import { LifeLenzBridgePanel } from '../features/lifelenz.js';

const ANCHOR = new Date('2026-07-15T00:00:00'); // default scan window: Jul 16 - Jul 29, 2026

function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function baseDs() {
  const schedRows = [];
  // Default anchor-relative window coverage (Jul 16 - Jul 29): 'auto' source.
  for (let i = 1; i <= 14; i++) {
    schedRows.push({ loc: LOC, date: addDays(ANCHOR, i), fcstSales: 9000 + i, sales: null });
  }
  // A distinct custom-range window (Sep 1 - Sep 14), non-overlapping with the default window.
  for (let i = 0; i < 14; i++) {
    schedRows.push({ loc: LOC, date: addDays(new Date('2026-09-01T00:00:00'), i), fcstSales: 8000 + i, sales: null });
  }
  // Two full Wed-start weeks for the grouping test: Aug 19 (a real Wednesday in 2026) - Sep 1.
  for (let i = 0; i < 14; i++) {
    schedRows.push({ loc: LOC, date: addDays(new Date('2026-08-19T00:00:00'), i), fcstSales: 7000 + i, sales: null });
  }
  // A manually-uploaded Labor Analysis row for the SAME date as the first auto row (Jul 16),
  // with a deliberately different number -- proves 'auto' wins over 'manual', not just that
  // 'auto' is used when 'manual' is absent.
  const laborRows = [{ loc: LOC, date: addDays(ANCHOR, 1), sales: 9500, projSales: 5000 }];
  return { loaded: true, lastActual: { [LOC]: ANCHOR }, schedRows, laborRows };
}

const SETTINGS = { weekStartDay: 3 }; // 0=Sun 1=Mon 3=Wed -- DEF_SETTINGS' own value

function setInputValue(el, v) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
function setSelectValue(el, v) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
async function flush(container, maxTicks = 15) {
  let last;
  for (let i = 0; i < maxTicks; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 15)); });
    if (container.textContent === last) return;
    last = container.textContent;
  }
}

describe('LifeLenzBridgePanel -- date-range control + Wed-start weekly grouping (dispatch #105 Part 1)', () => {
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

  async function selectStoreAndRun(runButtonText) {
    const select = container.querySelector('select');
    await act(async () => { setSelectValue(select, LOC); });
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes(runButtonText));
    expect(runBtn, `button containing "${runButtonText}" must exist`).toBeTruthy();
    await act(async () => { runBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
  }

  it('the default 14-day scan sources LifeLenz numbers from the auto-pulled schedule (ds.schedRows), never the manual upload, when both exist for the same date', async () => {
    await act(async () => {
      root.render(React.createElement(LifeLenzBridgePanel, { stores: [{ loc: LOC }], ds: baseDs(), settings: SETTINGS, userEvents: {}, onClose: () => {} }));
    });
    await flush(container);
    await selectStoreAndRun('Run 14-Day Scan');

    // Jul 16 has BOTH an auto row (fcstSales 9001) and a manual row (projSales 5000). The
    // rendered LifeLenz figure must be the auto number, badge AUTO -- not the manual 5000.
    expect(container.textContent).toContain('$9,001');
    expect(container.textContent).toContain('AUTO');
    expect(container.textContent).not.toContain('$5,000');
    expect(container.textContent).not.toContain('MANUAL');
    // Every one of the 14 default-window days resolved via 'auto', so no PATTERN guess appears.
    expect(container.textContent).not.toContain('PATTERN');
  });

  it('a selected custom date range changes which days are scanned and shown', async () => {
    await act(async () => {
      root.render(React.createElement(LifeLenzBridgePanel, { stores: [{ loc: LOC }], ds: baseDs(), settings: SETTINGS, userEvents: {}, onClose: () => {} }));
    });
    await flush(container);
    await selectStoreAndRun('Run 14-Day Scan');
    // Default window is visible.
    expect(container.textContent).toContain('$9,001');

    // Turn on Custom Date Range and point it at the Sep 1 - Sep 14 window instead.
    const customToggle = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Custom Date Range'));
    await act(async () => { customToggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const dateInputs = [...container.querySelectorAll('input[type="date"]')];
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
    await act(async () => {
      setInputValue(dateInputs[0], '2026-09-01');
      setInputValue(dateInputs[1], '2026-09-14');
    });
    const rangeRunBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Run Range Scan'));
    expect(rangeRunBtn).toBeTruthy();
    await act(async () => { rangeRunBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);

    // The scanned/shown days moved to the new range -- the old default-window figure is gone,
    // the new range's figures (8000-8013) are present.
    expect(container.textContent).not.toContain('$9,001');
    expect(container.textContent).toContain('$8,000');
    expect(container.textContent).toContain('$8,013');
    expect(container.textContent).toMatch(/Sep 1.*Sep 14|Sep 1[^0-9].*14/s);
  });

  it('the Wednesday-start weekly grouping produces week boundaries running Wed through the following Tue, matching LifeLenz\'s own "Aug 19 – Aug 25" convention', async () => {
    await act(async () => {
      root.render(React.createElement(LifeLenzBridgePanel, { stores: [{ loc: LOC }], ds: baseDs(), settings: SETTINGS, userEvents: {}, onClose: () => {} }));
    });
    await flush(container);
    await selectStoreAndRun('Run 14-Day Scan');

    const customToggle = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Custom Date Range'));
    await act(async () => { customToggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const dateInputs = [...container.querySelectorAll('input[type="date"]')];
    await act(async () => {
      setInputValue(dateInputs[0], '2026-08-19'); // a real Wednesday
      setInputValue(dateInputs[1], '2026-09-01'); // exactly two full Wed-start weeks later
    });
    const rangeRunBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Run Range Scan'));
    await act(async () => { rangeRunBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);

    const weeklyToggle = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Weekly View'));
    expect(weeklyToggle).toBeTruthy();
    await act(async () => { weeklyToggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);

    // Exactly the two Wed-Tue weeks LifeLenz's own reference screenshot uses as its convention.
    expect(container.textContent).toContain('Aug 19 – Aug 25');
    expect(container.textContent).toContain('Aug 26 – Sep 1');
    // Never a Sun-start or Mon-start boundary for this window.
    expect(container.textContent).not.toContain('Aug 16 – Aug 22');
    expect(container.textContent).not.toContain('Aug 17 – Aug 23');
  });

  it('honors settings.weekStartDay rather than a hardcoded Wednesday -- a Sunday-start setting produces Sunday-start week boundaries', async () => {
    await act(async () => {
      root.render(React.createElement(LifeLenzBridgePanel, { stores: [{ loc: LOC }], ds: baseDs(), settings: { weekStartDay: 0 }, userEvents: {}, onClose: () => {} }));
    });
    await flush(container);
    await selectStoreAndRun('Run 14-Day Scan');

    const customToggle = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Custom Date Range'));
    await act(async () => { customToggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const dateInputs = [...container.querySelectorAll('input[type="date"]')];
    await act(async () => {
      setInputValue(dateInputs[0], '2026-08-19');
      setInputValue(dateInputs[1], '2026-09-01');
    });
    const rangeRunBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Run Range Scan'));
    await act(async () => { rangeRunBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);

    const weeklyToggle = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Weekly View'));
    await act(async () => { weeklyToggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);

    // Aug 19 2026 is a Wednesday; with weekStartDay=0 (Sunday), the week containing it starts
    // Aug 16 (the preceding Sunday), not Aug 19.
    expect(container.textContent).toContain('Aug 16 – Aug 22');
    expect(container.textContent).not.toContain('Aug 19 – Aug 25');
  });
});

describe('LifeLenzBridgePanel Accuracy mode -- dispatch #105 Part 2 (unblocked by the 2026-08-24 correction)', () => {
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

  it('a selected date range in Accuracy mode re-queries forecast_snapshots for that window', async () => {
    loadForecastSnapshotsMock.mockResolvedValue([
      { loc: LOC, dt: '2026-08-20', source: 'simple', forecast_sales: 9100, actual_sales: 9000, mape: 1.1 },
    ]);
    await act(async () => {
      root.render(React.createElement(LifeLenzBridgePanel, { stores: [{ loc: LOC }], ds: baseDs(), settings: SETTINGS, userEvents: {}, onClose: () => {} }));
    });
    await flush(container);

    const accuracyTab = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Accuracy'));
    expect(accuracyTab).toBeTruthy();
    await act(async () => { accuracyTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(loadForecastSnapshotsMock).toHaveBeenCalled();

    // Accuracy mode has its own store selector (accLoc), independent of Single Store's --
    // point it at the fixture store before pointing the range at the mocked snapshot's date.
    const accSelect = container.querySelector('select');
    await act(async () => { setSelectValue(accSelect, LOC); });

    // Point Accuracy's own range explicitly at the mocked snapshot's date -- Accuracy mode
    // defaults to "trailing 4 weeks ending yesterday" off the REAL system clock, which this
    // test must not depend on for a fixed 2026-08-20 fixture to land inside the window.
    const dateInputs = [...container.querySelectorAll('input[type="date"]')];
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
    await act(async () => {
      setInputValue(dateInputs[0], '2026-08-17');
      setInputValue(dateInputs[1], '2026-08-23');
    });
    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '▶ Run');
    expect(runBtn).toBeTruthy();
    await act(async () => { runBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);

    // The panel carries its renamed identity (dispatch #105 correction).
    expect(container.textContent).toContain('MBI vs LifeLenz Accuracy');
    // Reconciled row: LifeLenz's own auto-pulled Aug 20 forecast (7001, from baseDs' Aug 19+1
    // week) alongside Meridian's forecast_snapshots number (9100) for the same closed day.
    expect(container.textContent).toMatch(/9,100|9100/);
    expect(loadForecastSnapshotsMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
