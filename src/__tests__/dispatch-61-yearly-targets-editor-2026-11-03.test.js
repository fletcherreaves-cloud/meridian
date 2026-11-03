// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-03 (task #61): "bring Yearly Targets fully in-app -- editor + printable
// export, replacing the Excel upload [as the only input path]." Printable export already existed
// (dispatch #147 -- Print Report/Export on both Sales Pace and Target Categories views); this is
// the missing half, an in-app click-to-edit cell on the Target Categories table that writes
// straight to the yearly_targets table (source:'override') instead of requiring a full workbook
// re-upload for a one-off correction. Excel upload stays the fallback path, untouched.
//
// Renders the REAL YearlyProjectionsPanel/TargetCategoriesView, not an isolated EditableTargetCell
// unit test, per this repo's "would this verification still pass if reverted?" rule -- clicking
// the real cell, typing, and committing has to actually reach the real saveYearlyTargets() call.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const saveYearlyTargets = vi.fn(() => Promise.resolve({ saved: 1, errors: [] }));
vi.mock('../lib/supabase.js', () => ({
  loadDailySales: () => Promise.resolve([]),
  saveYearlyTargets: (...args) => saveYearlyTargets(...args),
}));

const { YearlyProjectionsPanel } = await import('../views/yearly-projections.js');

const YEAR = 2026;
function freshDs() {
  return {
    targets: { '3708': { tOepe: 140, tOsatB2B: 0.02, tHeadcount: 52 } },
    allYearlyTargets: { [YEAR]: { '3708': { tOepe: 140, tOsatB2B: 0.02, tHeadcount: 52 } } },
  };
}

function setNativeValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Yearly Targets in-app editor (task #61, 2026-11-03)', () => {
  let container, root;
  beforeEach(() => {
    saveYearlyTargets.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  async function openTargetCategories(ds) {
    await act(async () => {
      root.render(React.createElement(YearlyProjectionsPanel, { ds, stores: [], settings: {}, onClose: () => {}, embedded: true }));
    });
    const tabBtn = [...container.querySelectorAll('button')].find(b => /Target Categories/.test(b.textContent));
    await act(async () => { tabBtn.click(); });
  }

  it('clicking a plain numeric value (OEPE PACE) reveals an input and committing saves the full row with source:override', async () => {
    await openTargetCategories(freshDs());
    expect(container.textContent).toMatch(/140s/);

    const cell = [...container.querySelectorAll('td')].find(td => td.textContent === '140s');
    expect(cell, 'OEPE cell not found').toBeTruthy();
    await act(async () => { cell.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const input = container.querySelector('input[type="number"]');
    expect(input, 'edit input did not appear').toBeTruthy();
    await act(async () => { setNativeValue(input, '125'); });
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });

    // Optimistic UI update -- the new value renders immediately, the old one is gone.
    expect(container.textContent).toMatch(/125s/);
    expect(container.textContent).not.toMatch(/140s/);

    expect(saveYearlyTargets).toHaveBeenCalledTimes(1);
    const [targets, year, source] = saveYearlyTargets.mock.calls[0];
    expect(year).toBe(YEAR);
    expect(source).toBe('override');
    // Full row preserved (tHeadcount untouched), not just the one edited field -- saveYearlyTargets
    // upserts a whole row per loc/year, so a partial object would null out every other column.
    expect(targets['3708']).toEqual({ tOepe: 125, tOsatB2B: 0.02, tHeadcount: 52 });
  });

  it('a percent field (OSAT B2B) converts the typed percent back to a stored fraction', async () => {
    await openTargetCategories(freshDs());
    const csatBtn = [...container.querySelectorAll('button')].find(b => /CSAT/.test(b.textContent));
    await act(async () => { csatBtn.click(); });
    expect(container.textContent).toMatch(/2\.00%/);

    const cell = [...container.querySelectorAll('td')].find(td => td.textContent === '2.00%');
    expect(cell, 'OSAT B2B cell not found').toBeTruthy();
    await act(async () => { cell.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const input = container.querySelector('input[type="number"]');
    // Edit value is shown as a plain percent number (2), not the stored fraction (0.02).
    expect(input.value).toBe('2');
    await act(async () => { setNativeValue(input, '5'); });
    await act(async () => { input.blur(); });

    expect(container.textContent).toMatch(/5\.00%/);
    const [targets] = saveYearlyTargets.mock.calls[0];
    expect(targets['3708'].tOsatB2B).toBeCloseTo(0.05, 6);
  });

  it('Escape cancels the edit without saving', async () => {
    await openTargetCategories(freshDs());
    const cell = [...container.querySelectorAll('td')].find(td => td.textContent === '140s');
    await act(async () => { cell.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const input = container.querySelector('input[type="number"]');
    await act(async () => { setNativeValue(input, '999'); });
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });

    expect(container.textContent).toMatch(/140s/);
    expect(saveYearlyTargets).not.toHaveBeenCalled();
  });

  it('Excel-upload path is untouched -- the empty-state message and upload hint still show with no data', async () => {
    await openTargetCategories({ targets: {}, allYearlyTargets: {} });
    expect(container.textContent).toMatch(/No yearly targets uploaded/);
    expect(container.textContent).toMatch(/Upload the yearly targets workbook/);
  });
});
