// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-09: "I cannot figure out how to start December projections." Measured:
// MonthlyProjectionsPanel (src/views/analytics.js) had no path at all for a month with zero
// monthly_targets rows -- the old empty state just said "Upload a QSRSoft Monthly Targets
// report" (stale copy from before task #62 moved this in-app) with no button, link, or hint.
// This adds a "Start <Month Year> Projections" action that seeds a blank row per known store via
// the same saveMonthlyTargets() upsert every other edit already uses. Renders the REAL
// MonthlyProjectionsPanel (this repo's "would this verification still pass if reverted?" rule),
// mirroring dispatch-62's own mock-and-render pattern for this exact component.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { STORE_NAMES } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Keyed by (year,month) rather than call order: CurrentMonthPaceSection (rendered inside the
// same panel, for "current month actuals vs target") independently calls loadMonthlyTargets for
// its own period -- often the CURRENT real month, not whatever December-flavored period this
// file picks -- so a position-based mock queue would silently consume slots meant for the
// panel's own fetch. seededPeriods tracks which (year,month) saveMonthlyTargets has written to.
let seededPeriods = new Set();
const saveMonthlyTargets = vi.fn((targets, year, month) => {
  seededPeriods.add(year + '-' + month);
  return Promise.resolve({ saved: Object.keys(targets || {}).length, errors: [] });
});
const loadMonthlyTargets = vi.fn((year, month) =>
  Promise.resolve(seededPeriods.has(year + '-' + month)
    ? { [A]: { _year: year, _month: month }, [B]: { _year: year, _month: month } }
    : {}));
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    saveMonthlyTargets: (...args) => saveMonthlyTargets(...args),
    loadMonthlyTargets: (...args) => loadMonthlyTargets(...args),
    listMonthlyTargetPeriods: () => Promise.resolve([]),
    loadCustomMetricTargets: () => Promise.resolve({}),
  };
});

const { MonthlyProjectionsPanel } = await import('../views/analytics.js');

const [A, B] = ['3708', '5183'];
const STORES = [{ loc: A, name: STORE_NAMES[A] }, { loc: B, name: STORE_NAMES[B] }];

function emptyDs() {
  return { loaded: true, monthlyTargets: {}, monthlyTargetsMeta: {}, allMonthlyTargets: {} };
}

describe('Monthly Projections — "Start this month" (owner request 2026-11-09)', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });

  async function render({ canOwnProjections = true } = {}) {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(MonthlyProjectionsPanel, {
        ds: emptyDs(), stores: STORES, settings: {}, onClose: () => {}, canOwnProjections,
      }));
    });
    await act(async () => { await Promise.resolve(); });
  }

  async function pickDecember() {
    const toggle = [...container.querySelectorAll('button')].find(b => b.textContent === '📅');
    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const monthSel = [...container.querySelectorAll('select')].find(s =>
      [...s.options].some(o => o.textContent === 'December'));
    const selSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    await act(async () => { selSetter.call(monthSel, '12'); monthSel.dispatchEvent(new Event('change', { bubbles: true })); });
    const yearInput = container.querySelector('input[type="number"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => { setter.call(yearInput, '2026'); yearInput.dispatchEvent(new Event('input', { bubbles: true })); });
    const loadBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Load');
    await act(async () => { loadBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });
  }

  it('a month with zero monthly_targets rows shows a real empty state naming that month, not the stale "upload a report" dead end', async () => {
    seededPeriods = new Set();
    loadMonthlyTargets.mockClear();
    await render();
    await pickDecember();
    expect(container.textContent).toMatch(/No projections started yet for December 2026\./);
    expect(container.textContent).not.toMatch(/Upload a QSRSoft Monthly Targets report/);
  });

  it('clicking "Start December 2026 Projections" seeds one blank row per known store, then the grid repopulates from the real refetch', async () => {
    seededPeriods = new Set();
    loadMonthlyTargets.mockClear();
    saveMonthlyTargets.mockClear();
    await render();
    await pickDecember();

    const startBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '▶ Start December 2026 Projections');
    expect(startBtn).toBeTruthy();
    await act(async () => { startBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    for (let i = 0; i < 5; i++) { await act(async () => { await new Promise(r => setTimeout(r, 0)); }); }

    expect(saveMonthlyTargets).toHaveBeenCalledTimes(1);
    expect(saveMonthlyTargets).toHaveBeenCalledWith({ [A]: {}, [B]: {} }, 2026, 12);
    // The grid now shows both stores -- the dead end is gone, the panel is editable in place.
    expect(container.textContent).not.toMatch(/No projections started yet/);
    expect(container.textContent).toMatch(new RegExp(STORE_NAMES[A].slice(0, 10)));
  });

  it('December is directly selectable from the main dropdown -- no need for the hidden 📅 picker (owner report 2026-11-11)', async () => {
    // Before this fix, periodOpts came from listMonthlyTargetPeriods() alone (mocked to []
    // here, same as every other test in this file), so the main <select> had zero options and
    // never rendered at all -- the owner's only path to a never-started future month was the
    // undiscoverable 📅 icon toggle pickDecember() above drives. Now the dropdown always
    // includes the current + next 3 months even with zero real periods.
    seededPeriods = new Set();
    await render();
    const mainSel = [...container.querySelectorAll('select')][0];
    expect(mainSel).toBeTruthy();
    expect([...mainSel.options].some(o => o.textContent.includes('Dec 2026'))).toBe(true);
    const selSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    await act(async () => { selSetter.call(mainSel, '2026-12'); mainSel.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toMatch(/No projections started yet for December 2026\./);
  });

  it('a non-owner sees no Start button and an explicit access message instead -- never a silent dead end', async () => {
    seededPeriods = new Set();
    loadMonthlyTargets.mockClear();
    await render({ canOwnProjections: false });
    await pickDecember();
    expect([...container.querySelectorAll('button')].some(b => b.textContent === '▶ Start December 2026 Projections')).toBe(false);
    expect(container.textContent).toMatch(/don't have edit access for Projections/);
  });
});
