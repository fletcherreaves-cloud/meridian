// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #117 -- MBI vs LifeLenz Accuracy: guard against implausible LifeLenz actuals.
//
// Incident (owner screenshot, 2026-08-25, week of Aug 5-11): after a multi-day LifeLenz pull
// outage, Aug 5 landed a small NONZERO partial-day `sales` capture ($475 actual vs $17,885
// forecast, ratio 0.027) instead of the null a full miss produces. `runAccuracy`'s old
// `lfzVarPct=(lfz&&lfz.actual>0)?(lfz.forecast-lfz.actual)/lfz.actual*100:null` guard only
// checked actual>0, so that partial actual sailed through and produced +3665.94% -- which then
// poisoned `groupAccByWeek`'s plain-averaged `avgLfzAbsVar` into a meaningless 734.38% for the
// whole week. Aug 6-7 (`sales` NULL) already rendered gracefully as "-".
//
// This reproduces that exact shape synthetically -- one null-actual day (already-handled case),
// one small-partial-actual day matching the real incident's numbers, and five normal days in
// the same week -- and asserts (a) the partial day renders "Incomplete" rather than a wild %,
// (b) the week's avgLfzAbsVar is computed only from the plausible days, and (c) a week with no
// incomplete days is completely unaffected by the guard (additive-only).
//
// Renders the REAL LifeLenzBridgePanel consumer, not runAccuracy/groupAccByWeek in isolation,
// per this repo's "would this verification still pass if reverted?" standing rule -- a test
// that only imported those functions could pass unchanged with the guard wired to nothing.
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

const SETTINGS = { weekStartDay: 3 }; // 0=Sun 1=Mon 3=Wed -- DEF_SETTINGS' own value, matches
                                       // LifeLenz's own Wed-start week (the real incident's week
                                       // was reported as "Aug 5-11", a Wed-Tue span).

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

// Incident week: Wed Aug 5 (partial pull, $475 actual vs $17,885 forecast, ratio 0.027) through
// Tue Aug 11 2026, matching the real screenshot's "Aug 5-11" week and Wed-start grouping.
const INCIDENT_ROWS = [
  { loc: LOC, date: new Date('2026-08-05T00:00:00'), fcstSales: 17885, sales: 475 },  // implausible partial
  { loc: LOC, date: new Date('2026-08-06T00:00:00'), fcstSales: 18000, sales: null }, // already-handled null
  { loc: LOC, date: new Date('2026-08-07T00:00:00'), fcstSales: 16000, sales: 15800 }, // normal
  { loc: LOC, date: new Date('2026-08-08T00:00:00'), fcstSales: 15000, sales: 15100 }, // normal
  { loc: LOC, date: new Date('2026-08-09T00:00:00'), fcstSales: 14000, sales: 13950 }, // normal
  { loc: LOC, date: new Date('2026-08-10T00:00:00'), fcstSales: 17000, sales: 17200 }, // normal
  { loc: LOC, date: new Date('2026-08-11T00:00:00'), fcstSales: 16500, sales: 16400 }, // normal
];
// Expected avgLfzAbsVar across ONLY the 5 normal days (Aug 7-11), matching
// (forecast-actual)/actual*100 for each, averaged:
//   Aug7  (16000-15800)/15800*100 =  1.265823%
//   Aug8  (15000-15100)/15100*100 = -0.662252%
//   Aug9  (14000-13950)/13950*100 =  0.358423%
//   Aug10 (17000-17200)/17200*100 = -1.162791%
//   Aug11 (16500-16400)/16400*100 =  0.609756%
const EXPECTED_NORMAL_AVG = (1.265823 + 0.662252 + 0.358423 + 1.162791 + 0.609756) / 5; // ~0.8118%

function ds(rows) {
  return { loaded: true, lastActual: { [LOC]: new Date('2026-08-25T00:00:00') }, schedRows: rows, laborRows: [] };
}

async function openAccuracyAndRun(container, startStr, endStr) {
  const accuracyTab = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Accuracy'));
  expect(accuracyTab, 'Accuracy tab button must exist').toBeTruthy();
  await act(async () => { accuracyTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush(container);

  const accSelect = container.querySelector('select');
  await act(async () => { setSelectValue(accSelect, LOC); });

  const dateInputs = [...container.querySelectorAll('input[type="date"]')];
  expect(dateInputs.length).toBeGreaterThanOrEqual(2);
  await act(async () => {
    setInputValue(dateInputs[0], startStr);
    setInputValue(dateInputs[1], endStr);
  });
  const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '▶ Run');
  expect(runBtn).toBeTruthy();
  await act(async () => { runBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush(container);
}

describe('MBI vs LifeLenz Accuracy -- implausible-actual guard (dispatch #117)', () => {
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

  it('a small partial actual ($475 vs $17,885 forecast) renders flagged as Incomplete, not a wild percentage, and is excluded from the week avg', async () => {
    await act(async () => {
      root.render(React.createElement(LifeLenzBridgePanel, {
        stores: [{ loc: LOC }], ds: ds(INCIDENT_ROWS), settings: SETTINGS, userEvents: {}, onClose: () => {},
      }));
    });
    await flush(container);
    await openAccuracyAndRun(container, '2026-08-05', '2026-08-11');

    // The old bug's exact number never appears -- it must not sneak into either the daily cell
    // or the poisoned weekly average (+3665.9x% daily, 734.3x% weekly in the real incident).
    expect(container.textContent).not.toMatch(/3665\.\d\d%/);
    expect(container.textContent).not.toMatch(/734\.\d\d%/);

    // The partial day is flagged, not silently blanked and not shown as a wild %.
    expect(container.textContent).toContain('⚠ Incomplete');

    // The null-actual day (Aug 6) keeps its existing, already-correct "-" rendering --
    // unaffected by this guard, still distinguishable from the new "Incomplete" label.
    expect(container.textContent).toContain('—');

    // The dollar figures for the flagged day still render (guard hides the VARIANCE, not the
    // underlying actual/forecast dollars) so the raw partial number stays visible.
    expect(container.textContent).toContain('$475');
    expect(container.textContent).toContain('$17,885');

    // The week's LFZ avg |var| is computed ONLY from the 5 plausible days -- matches the
    // hand-computed ~0.81%, nowhere near the poisoned 734% the old code produced.
    const avgMatch = container.textContent.match(/LFZ avg \|var\| ([\d.]+)%/);
    expect(avgMatch, 'weekly "LFZ avg |var|" summary must be present').toBeTruthy();
    const renderedAvg = parseFloat(avgMatch[1]);
    expect(renderedAvg).toBeCloseTo(EXPECTED_NORMAL_AVG, 1);
    expect(renderedAvg).toBeLessThan(5); // sanity ceiling -- nowhere close to the 734% incident
  });

  it('a genuinely bad LifeLenz forecast (large miss, but a plausible actual) is NOT suppressed -- only the implausible-actual case is caught', async () => {
    const badForecastRows = [
      // Forecast badly overshoots (2x), but actual is a perfectly normal, plausible day --
      // ratio 0.5, well above the 0.15 floor. This must show its real, large variance.
      { loc: LOC, date: new Date('2026-08-05T00:00:00'), fcstSales: 30000, sales: 15000 },
    ];
    await act(async () => {
      root.render(React.createElement(LifeLenzBridgePanel, {
        stores: [{ loc: LOC }], ds: ds(badForecastRows), settings: SETTINGS, userEvents: {}, onClose: () => {},
      }));
    });
    await flush(container);
    await openAccuracyAndRun(container, '2026-08-05', '2026-08-05');

    // A real, large miss (100% over-forecast) still renders as its actual percentage, not
    // suppressed as "Incomplete".
    expect(container.textContent).not.toContain('⚠ Incomplete');
    expect(container.textContent).toContain('+100.00%');
  });

  it('a normal week with no incomplete days renders identically to pre-guard behavior (additive-only guard)', async () => {
    const normalRows = INCIDENT_ROWS.filter(r => r.date >= new Date('2026-08-07T00:00:00'));
    await act(async () => {
      root.render(React.createElement(LifeLenzBridgePanel, {
        stores: [{ loc: LOC }], ds: ds(normalRows), settings: SETTINGS, userEvents: {}, onClose: () => {},
      }));
    });
    await flush(container);
    await openAccuracyAndRun(container, '2026-08-07', '2026-08-11');

    // No guard artifacts anywhere in a window with no implausible days.
    expect(container.textContent).not.toContain('⚠ Incomplete');
    expect(container.textContent).not.toContain('Incomplete');

    // Every one of the 5 normal days renders its real variance figure (a "-" would mean a day
    // got wrongly excluded).
    expect(container.textContent).toContain('+1.27%');
    expect(container.textContent).toContain('-0.66%');
    expect(container.textContent).toContain('+0.36%');
    expect(container.textContent).toContain('-1.16%');
    expect(container.textContent).toContain('+0.61%');

    const avgMatch = container.textContent.match(/LFZ avg \|var\| ([\d.]+)%/);
    expect(avgMatch).toBeTruthy();
    expect(parseFloat(avgMatch[1])).toBeCloseTo(EXPECTED_NORMAL_AVG, 1);
  });
});
