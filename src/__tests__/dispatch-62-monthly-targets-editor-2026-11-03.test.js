// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-03 (task #62): "Pick up #61/#62 Targets editor scope" -- Monthly Targets
// in-app editing, following the same shape #61 proved on Yearly Targets. MonthlyProjectionsPanel
// (Planning > Monthly tab) already read the REAL monthly_targets table and rendered the full
// PROJ_FIELDS set (Sales & Labor / Service / Food Cost / Other Costs) in a grid -- it was just
// read-only, Excel-upload the only input path. This adds a click-to-edit cell on every flat-view
// store row, writing straight to monthly_targets via saveMonthlyTargets(), same interaction shape
// as yearly-projections.js's EditableTargetCell.
//
// Renders the REAL MonthlyProjectionsPanel, not an isolated EditableProjCell unit test, per this
// repo's "would this verification still pass if reverted?" rule.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { STORE_NAMES } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// This test environment has real Supabase credentials configured, so the panel's own
// listMonthlyTargetPeriods()/loadMonthlyTargets() calls would otherwise make real network
// requests on mount -- slow and non-deterministic for a unit test, and irrelevant to what this
// test actually verifies (the edit->save wiring, not period discovery). Stubbed out exactly like
// dispatch-107-yearly-projections-panel.test.js already stubs loadDailySales for the same reason.
const saveMonthlyTargets = vi.fn(() => Promise.resolve({ saved: 1, errors: [] }));
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    saveMonthlyTargets: (...args) => saveMonthlyTargets(...args),
    listMonthlyTargetPeriods: () => Promise.resolve([]),
    loadMonthlyTargets: () => Promise.resolve({}),
  };
});

const { MonthlyProjectionsPanel } = await import('../views/analytics.js');

const [A] = ['3708'];
const YEAR = 2026, MONTH = 10;

function setNativeValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function freshDs() {
  return {
    loaded: true,
    monthlyTargets: {
      [A]: { tProdSales: 300000, tCrewLabor: 0.21, tTpph: 5.4, tOepe: 150, _year: YEAR, _month: MONTH },
    },
    monthlyTargetsMeta: { year: YEAR, month: MONTH },
    allMonthlyTargets: {},
  };
}

describe('Monthly Targets in-app editor (task #62, 2026-11-03)', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });

  async function render(ds) {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(MonthlyProjectionsPanel, {
        ds, stores: [{ loc: A, name: STORE_NAMES[A] }], settings: {}, onClose: () => {},
      }));
    });
    // The panel resolves its initial selPeriod inside listMonthlyTargetPeriods().then(...) --
    // one microtask tick past the mount render, which handleSaveProjField needs to be non-null
    // before it will persist an edit.
    await act(async () => { await Promise.resolve(); });
  }

  it('clicking a plain numeric value (TPPH) reveals an input and committing saves the full row', async () => {
    saveMonthlyTargets.mockClear();
    await render(freshDs());
    expect(container.textContent).toMatch(/5\.40/);

    const cell = [...container.querySelectorAll('td')].find(td => td.textContent === '5.40');
    expect(cell, 'TPPH cell not found').toBeTruthy();
    await act(async () => { cell.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const input = container.querySelector('input[type="number"]');
    expect(input, 'edit input did not appear').toBeTruthy();
    await act(async () => { setNativeValue(input, '5.8'); });
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });

    expect(container.textContent).toMatch(/5\.80/);
    expect(container.textContent).not.toMatch(/5\.40/);

    expect(saveMonthlyTargets).toHaveBeenCalledTimes(1);
    const [targets, year, month] = saveMonthlyTargets.mock.calls[0];
    expect(year).toBe(YEAR);
    expect(month).toBe(MONTH);
    // Full row preserved (tOepe/tCrewLabor untouched), not just the edited field.
    expect(targets[A]).toEqual({ tProdSales: 300000, tCrewLabor: 0.21, tTpph: 5.8, tOepe: 150, _year: YEAR, _month: MONTH });
  });

  it('a percent field (Crew Labor) converts the typed percent back to a stored fraction', async () => {
    saveMonthlyTargets.mockClear();
    await render(freshDs());
    expect(container.textContent).toMatch(/21\.00%/);

    const cell = [...container.querySelectorAll('td')].find(td => td.textContent === '21.00%');
    expect(cell, 'Crew Labor cell not found').toBeTruthy();
    await act(async () => { cell.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const input = container.querySelector('input[type="number"]');
    expect(input.value).toBe('21');
    await act(async () => { setNativeValue(input, '22.5'); });
    await act(async () => { input.blur(); });

    expect(container.textContent).toMatch(/22\.50%/);
    const [targets] = saveMonthlyTargets.mock.calls[0];
    expect(targets[A].tCrewLabor).toBeCloseTo(0.225, 6);
  });

  it('Escape cancels the edit without saving', async () => {
    saveMonthlyTargets.mockClear();
    await render(freshDs());
    const cell = [...container.querySelectorAll('td')].find(td => td.textContent === '5.40');
    await act(async () => { cell.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const input = container.querySelector('input[type="number"]');
    await act(async () => { setNativeValue(input, '99'); });
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });

    expect(container.textContent).toMatch(/5\.40/);
    expect(saveMonthlyTargets).not.toHaveBeenCalled();
  });
});
