// @vitest-environment happy-dom
// @ts-nocheck
// MBI vs LifeLenz Accuracy -- per-date winner badge (owner-requested 2026-09-11): "let's maybe
// award a winner to each date with a badge or something". Whichever side (LFZ or MBI) has the
// smaller |variance| against the SAME actual for a given date gets a 🏆 next to its Var% cell.
//
// Renders the REAL LifeLenzBridgePanel consumer (not the badge logic in isolation), matching
// dispatch #117's own "would this verification still pass if reverted?" pattern for this exact
// table -- a test that only computed lfzWins/mbiWins in isolation could pass unchanged with the
// trophy never actually wired into the row markup.
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

// Day 1 (Aug 7): LFZ closer to actual (|var| 1.27% vs MBI 4.43%) -> LFZ should win.
// Day 2 (Aug 8): MBI closer to actual (|var| 0.33% vs LFZ 5.30%) -> MBI should win.
const SNAPSHOT_ROWS = [
  { loc: LOC, dt: '2026-08-07', source: 'simple', forecast_sales: 16500, actual_sales: 15800 },
  { loc: LOC, dt: '2026-08-08', source: 'simple', forecast_sales: 15150, actual_sales: 15100 },
];
const loadForecastSnapshotsMock = vi.fn(async () => SNAPSHOT_ROWS);
vi.mock('../lib/supabase.js', () => ({
  loadForecastSnapshots: (...args) => loadForecastSnapshotsMock(...args),
}));

import { LifeLenzBridgePanel } from '../features/lifelenz.js';

const SETTINGS = { weekStartDay: 3 };

const SCHED_ROWS = [
  { loc: LOC, date: new Date('2026-08-07T00:00:00'), fcstSales: 16000, sales: 15800 },
  { loc: LOC, date: new Date('2026-08-08T00:00:00'), fcstSales: 15900, sales: 15100 },
];

function ds(rows) {
  return { loaded: true, lastActual: { [LOC]: new Date('2026-08-25T00:00:00') }, schedRows: rows, laborRows: [] };
}

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

async function openAccuracyAndRun(container, startStr, endStr) {
  const accuracyTab = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Accuracy'));
  await act(async () => { accuracyTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush(container);
  const accSelect = container.querySelector('select');
  await act(async () => { setSelectValue(accSelect, LOC); });
  const dateInputs = [...container.querySelectorAll('input[type="date"]')];
  await act(async () => {
    setInputValue(dateInputs[0], startStr);
    setInputValue(dateInputs[1], endStr);
  });
  const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '▶ Run');
  await act(async () => { runBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush(container);
}

describe('MBI vs LifeLenz Accuracy -- per-date winner badge', () => {
  let container, root;
  beforeEach(() => {
    loadForecastSnapshotsMock.mockReset();
    loadForecastSnapshotsMock.mockImplementation(async () => SNAPSHOT_ROWS);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('badges the closer side for each date, not the other, and not both', async () => {
    await act(async () => {
      root.render(React.createElement(LifeLenzBridgePanel, {
        stores: [{ loc: LOC }], ds: ds(SCHED_ROWS), settings: SETTINGS, userEvents: {}, onClose: () => {},
      }));
    });
    await flush(container);
    await openAccuracyAndRun(container, '2026-08-07', '2026-08-08');

    const rows = [...container.querySelectorAll('tbody tr')];
    expect(rows.length).toBe(2);

    // Row 1 (Aug 7): LFZ Var% cell (4th td) carries the trophy, MBI Var% cell (7th td) does not.
    const row1Cells = [...rows[0].querySelectorAll('td')];
    expect(row1Cells[3].textContent).toContain('🏆');
    expect(row1Cells[6].textContent).not.toContain('🏆');
    expect(row1Cells[3].textContent).toContain('+1.27%');
    expect(row1Cells[6].textContent).toContain('+4.43%');

    // Row 2 (Aug 8): reversed -- MBI is closer, so MBI's cell carries the trophy, LFZ's doesn't.
    const row2Cells = [...rows[1].querySelectorAll('td')];
    expect(row2Cells[3].textContent).not.toContain('🏆');
    expect(row2Cells[6].textContent).toContain('🏆');
    expect(row2Cells[3].textContent).toContain('+5.30%');
    expect(row2Cells[6].textContent).toContain('+0.33%');

    // Exactly one trophy per row -- never both sides badged on the same date.
    expect((rows[0].textContent.match(/🏆/g) || []).length).toBe(1);
    expect((rows[1].textContent.match(/🏆/g) || []).length).toBe(1);
  });

  it('awards no trophy on either side when one side has no data for that date', async () => {
    const lfzOnlyRows = [{ loc: LOC, date: new Date('2026-08-07T00:00:00'), fcstSales: 16000, sales: 15800 }];
    // Persistent (not "Once") -- the panel's auto-run-on-tab-open effect fires a call before
    // the explicit Run-button click below does, so a one-shot override would be consumed by
    // the wrong call and leave the button click falling through to the describe-level default.
    loadForecastSnapshotsMock.mockImplementation(async () => []); // no MBI snapshot at all
    await act(async () => {
      root.render(React.createElement(LifeLenzBridgePanel, {
        stores: [{ loc: LOC }], ds: ds(lfzOnlyRows), settings: SETTINGS, userEvents: {}, onClose: () => {},
      }));
    });
    await flush(container);
    await openAccuracyAndRun(container, '2026-08-07', '2026-08-07');

    expect(container.textContent).not.toContain('🏆');
  });
});
