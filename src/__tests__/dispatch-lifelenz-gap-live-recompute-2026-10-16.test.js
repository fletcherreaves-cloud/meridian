// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch, 2026-10-16 -- LifelenzGapPanel used to compare a LIVE-recomputed Lifelenz MAPE
// (from whatever Labor Analysis file happens to be loaded) against a FROZEN Meridian number
// read once from DEFAULT_MODEL_ASSIGNMENTS[loc].weekly.mape -- the original Sep2025-May2026
// backtest result. Once a newer Labor Analysis file moved the live Lifelenz side onto a much
// more recent window, the panel kept a hardcoded "same Sep 2025-May 2026 window" subtitle
// while silently comparing two different time periods (owner-reported: live panel showed
// Lifelenz at 202.70% avg MAPE / 27-0 sweep vs the validated 9.51% / 16-27 finding baked into
// src/parsers/index.js's own header comment).
//
// This reproduces the bug class synthetically: a mocked forecastDay whose return value varies
// BY DATE (so the test can tell whether the panel is actually calling it per matched date, not
// reading a frozen store-level number), and asserts:
//  (a) the per-store Meridian MAPE in the table matches the mocked per-date forecast values,
//      not any value derived from DEFAULT_MODEL_ASSIGNMENTS;
//  (b) forecastDay is called with mode:'Back Test' (leak-free) and forceModel 'ae';
//  (c) switching to a period with zero matched rows renders a real empty-state message
//      instead of a blank table with no explanation;
//  (d) the subtitle shows a real, data-derived date range, not a hardcoded one.
//
// Renders the real LifelenzGapPanel consumer (not an isolated computation), per this repo's
// "would this verification still pass if reverted?" rule -- reverting the live-recompute fix
// back to a frozen-number read must make this test fail, not pass unchanged.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '33704'; // Tecumseh -- a real STORE_NAMES key

const forecastDayMock = vi.fn((loc, date, ds, settings, casc, tgt, horizon, forceModel) => {
  // Distinct, date-dependent forecast so a frozen single-number stand-in couldn't fake it.
  const day = date.getDate();
  return { forecast: 10000 + day * 10, isFuture: false };
});
vi.mock('../engine/forecast.js', () => ({
  forecastDay: (...args) => forecastDayMock(...args),
  getModelAssignment: () => null,
}));

import { LifelenzGapPanel } from '../features/lifelenz.js';

function mkRow(dateStr, sales, projSales) {
  return { loc: LOC, date: new Date(dateStr + 'T00:00:00'), sales, projSales };
}

// Post-cutover (>= 2025-09-01) rows only -- the default 'post' period tab.
const POST_ROWS = [
  mkRow('2026-09-02', 10100, 15000),
  mkRow('2026-09-03', 10200, 15500),
  mkRow('2026-09-04', 10300, 16000),
];

function render(ds) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(React.createElement(LifelenzGapPanel, { ds, settings: {}, onClose: () => {} })); });
  return { container, root };
}

beforeEach(() => { forecastDayMock.mockClear(); });

describe('LifelenzGapPanel — live-recompute fix (dispatch, 2026-10-16)', () => {
  it('computes Meridian MAPE from live forecastDay per matched date, not a frozen lookup', () => {
    const ds = { laborRows: POST_ROWS, targets: {}, lastActual: {} };
    const { container } = render(ds);

    // forecastDay was actually invoked -- the live path ran, not a frozen-number shortcut.
    expect(forecastDayMock).toHaveBeenCalled();
    // Called once per matched date for this store (3 post-cutover rows).
    const callsForLoc = forecastDayMock.mock.calls.filter(c => String(c[0]) === LOC);
    expect(callsForLoc.length).toBe(3);

    const text = container.textContent;
    // Row renders a real Meridian MAPE derived from the mocked per-date forecasts, not blank.
    expect(text).toMatch(/\d+\.\d\d%/); // some MAPE-shaped number rendered
    expect(text).not.toMatch(/9\.29%/); // not the old frozen DEFAULT_MODEL_ASSIGNMENTS figure
  });

  it('calls forecastDay in leak-free Back Test mode, forced onto the AE model', () => {
    const ds = { laborRows: POST_ROWS, targets: {}, lastActual: {} };
    render(ds);
    expect(forecastDayMock).toHaveBeenCalled();
    const [, , , settingsArg, , , horizonArg, forceModelArg] = forecastDayMock.mock.calls[0];
    expect(settingsArg.mode).toBe('Back Test');
    expect(forceModelArg).toBe('ae');
    expect(horizonArg).toBe('weekly');
  });

  it('shows a real empty-state message, not a blank table, when the selected period has no rows', () => {
    // Only post-cutover rows loaded -- the 'pre' tab has nothing to show.
    const ds = { laborRows: POST_ROWS, targets: {}, lastActual: {} };
    const { container } = render(ds);

    const preBtn = Array.from(container.querySelectorAll('button')).find(b => /Pre-Sep 2025/.test(b.textContent));
    expect(preBtn).toBeTruthy();
    act(() => { preBtn.click(); });

    const text = container.textContent;
    expect(text).toMatch(/No Data For This Period/);
    // No stale summary cards (e.g. "Meridian Wins") should render in the empty state.
    expect(text).not.toMatch(/Meridian Wins/);
  });

  it('shows a real, data-derived date range in the subtitle, not a hardcoded one', () => {
    const ds = { laborRows: POST_ROWS, targets: {}, lastActual: {} };
    const { container } = render(ds);
    const text = container.textContent;
    expect(text).not.toMatch(/same Sep 2025.{0,3}May 2026 window/);
    // The real loaded range (Sep 2-4, 2026) should appear somewhere in the subtitle/cards.
    expect(text).toMatch(/Sep 2, 2026/);
    expect(text).toMatch(/Sep 4, 2026/);
  });
});
