// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-05 (task #93) -- Targets Editor Tier 2: "add a brand-new metric with a
// target" on top of Tier 1's hide/rename/regroup-only Customize editor (dispatch-target-field-
// customization-2026-11-04). A metric with no existing monthly_targets/yearly_targets column
// (picked from the SAME list Top/Bottom Performers offers, engine/top-bottom-performers.js's
// PERFORMER_METRICS -- never free-typed) gets its own dedicated table, custom_metric_targets
// (schema-custom-metric-targets.sql), keyed by (loc, metric_key, period_type) so Monthly and
// Yearly can carry their own value for the same metric (owner-confirmed 2026-11-05).
//
// Renders the REAL MonthlyProjectionsPanel/YearlyProjectionsPanel and the REAL
// TargetFieldConfigEditor through them -- per this repo's "would this verification still pass
// if reverted?" rule, a test that only exercised TargetFieldConfigEditor's customMetrics draft
// logic in isolation could pass unchanged with the panels' own wiring to the new table deleted.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { STORE_NAMES } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const saveMonthlyTargets = vi.fn(() => Promise.resolve({ saved: 1, errors: [] }));
const saveYearlyTargets = vi.fn(() => Promise.resolve({ saved: 1, errors: [] }));
const saveCustomMetricTarget = vi.fn(() => Promise.resolve({ saved: true }));
const loadCustomMetricTargets = vi.fn(() => Promise.resolve({}));
// Same determinism reason dispatch-62/dispatch-61 already stub listMonthlyTargetPeriods/
// loadMonthlyTargets/loadDailySales for: this test environment has real Supabase credentials
// configured, so any unstubbed loader would otherwise make a real network request on mount.
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    saveMonthlyTargets: (...args) => saveMonthlyTargets(...args),
    saveYearlyTargets: (...args) => saveYearlyTargets(...args),
    saveCustomMetricTarget: (...args) => saveCustomMetricTarget(...args),
    loadCustomMetricTargets: (...args) => loadCustomMetricTargets(...args),
    listMonthlyTargetPeriods: () => Promise.resolve([]),
    loadMonthlyTargets: () => Promise.resolve({}),
    loadDailySales: () => Promise.resolve([]),
  };
});

const { MonthlyProjectionsPanel } = await import('../views/analytics.js');
const { YearlyProjectionsPanel } = await import('../views/yearly-projections.js');

const [A] = ['3708'];
const YEAR = 2026, MONTH = 10;

function setNativeValue(el, value) {
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}

function byText(container, selector, text) {
  return [...container.querySelectorAll(selector)].find(el => el.textContent === text);
}

describe('Targets Editor Tier 2: custom metrics (task #93, 2026-11-05)', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); saveMonthlyTargets.mockClear(); saveYearlyTargets.mockClear(); saveCustomMetricTarget.mockClear(); loadCustomMetricTargets.mockClear(); });

  function mount(el) {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    return act(async () => { root.render(el); });
  }

  describe('Monthly Projections', () => {
    function freshDs() {
      return {
        loaded: true,
        monthlyTargets: { [A]: { tProdSales: 300000, tTpph: 5.4, _year: YEAR, _month: MONTH } },
        monthlyTargetsMeta: { year: YEAR, month: MONTH },
        allMonthlyTargets: {},
      };
    }

    it('adding a metric via the Customize editor saves it into monthlyTargetConfig.customMetrics', async () => {
      const onUpdateSettings = vi.fn();
      await mount(React.createElement(MonthlyProjectionsPanel, {
        ds: freshDs(), stores: [{ loc: A, name: STORE_NAMES[A] }], settings: {}, onClose: () => {}, onUpdateSettings,
      }));
      await act(async () => { await Promise.resolve(); });

      await act(async () => { byText(container, 'button', '⚙️ Customize').click(); });
      const addSelect = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent === 'Avg Check ($)'));
      expect(addSelect, 'metric picker not found').toBeTruthy();
      await act(async () => { setNativeValue(addSelect, 'avgCheck'); });
      await act(async () => { byText(container, 'button', 'Add').click(); });

      // The newly added row renders under its own default category, with the real-name label.
      expect(container.textContent).toContain('Custom Metrics');
      const newRowLabel = [...container.querySelectorAll('input')].find(i => i.value === 'Avg Check ($)');
      expect(newRowLabel, 'new custom metric row not rendered').toBeTruthy();

      await act(async () => { byText(container, 'button', 'Save').click(); });
      expect(onUpdateSettings).toHaveBeenCalledTimes(1);
      const next = onUpdateSettings.mock.calls[0][0];
      expect(next.monthlyTargetConfig.customMetrics).toEqual([{ id: 'avgCheck', label: 'Avg Check ($)', group: 'Custom Metrics' }]);
    });

    it('a pre-configured custom metric renders its real stored value and edits save to custom_metric_targets, not monthly_targets', async () => {
      loadCustomMetricTargets.mockResolvedValue({ [A]: { avgCheck: { monthly: 7.25 } } });
      const settings = { monthlyTargetConfig: { customMetrics: [{ id: 'avgCheck', label: 'Avg Check ($)', group: 'Custom Metrics' }] } };
      await mount(React.createElement(MonthlyProjectionsPanel, {
        ds: freshDs(), stores: [{ loc: A, name: STORE_NAMES[A] }], settings, onClose: () => {},
      }));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); }); // one more tick past loadCustomMetricTargets().then(...)

      expect(container.textContent).toMatch(/7\.25/);
      const cell = [...container.querySelectorAll('td')].find(td => td.textContent === '7.25');
      expect(cell, 'custom metric cell not found').toBeTruthy();
      await act(async () => { cell.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const input = container.querySelector('input[type="number"]');
      await act(async () => { setNativeValue(input, '7.5'); });
      await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });

      expect(saveCustomMetricTarget).toHaveBeenCalledWith(A, 'avgCheck', 'monthly', 7.5);
      expect(saveMonthlyTargets).not.toHaveBeenCalled();
    });
  });

  describe('Yearly Targets', () => {
    function freshDs() {
      return { targets: { [A]: { tOepe: 140 } }, allYearlyTargets: { [YEAR]: { [A]: { tOepe: 140 } } } };
    }

    it('adding a metric via the Customize editor saves it into yearlyTargetConfig.customMetrics', async () => {
      const onUpdateSettings = vi.fn();
      await mount(React.createElement(YearlyProjectionsPanel, { ds: freshDs(), stores: [], settings: {}, onClose: () => {}, embedded: true, onUpdateSettings }));
      const tabBtn = [...container.querySelectorAll('button')].find(b => /Target Categories/.test(b.textContent));
      await act(async () => { tabBtn.click(); });

      await act(async () => { byText(container, 'button', '⚙️ Customize').click(); });
      const addSelect = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent === 'Avg Check ($)'));
      expect(addSelect, 'metric picker not found').toBeTruthy();
      await act(async () => { setNativeValue(addSelect, 'avgCheck'); });
      await act(async () => { byText(container, 'button', 'Add').click(); });
      await act(async () => { byText(container, 'button', 'Save').click(); });

      expect(onUpdateSettings).toHaveBeenCalledTimes(1);
      const next = onUpdateSettings.mock.calls[0][0];
      expect(next.yearlyTargetConfig.customMetrics).toEqual([{ id: 'avgCheck', label: 'Avg Check ($)', group: 'Custom Metrics' }]);
    });

    it('a pre-configured custom metric renders under its own "Custom Metrics" category tab and edits save to custom_metric_targets, not yearly_targets', async () => {
      loadCustomMetricTargets.mockResolvedValue({ [A]: { avgCheck: { yearly: 6.1 } } });
      const settings = { yearlyTargetConfig: { customMetrics: [{ id: 'avgCheck', label: 'Avg Check ($)', group: 'Custom Metrics' }] } };
      await mount(React.createElement(YearlyProjectionsPanel, { ds: freshDs(), stores: [], settings, onClose: () => {}, embedded: true }));
      const tabBtn = [...container.querySelectorAll('button')].find(b => /Target Categories/.test(b.textContent));
      await act(async () => { tabBtn.click(); });
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); });

      const customTabBtn = [...container.querySelectorAll('button')].find(b => /Custom Metrics/.test(b.textContent));
      expect(customTabBtn, 'Custom Metrics category tab not found').toBeTruthy();
      await act(async () => { customTabBtn.click(); });

      expect(container.textContent).toMatch(/6\.10/);
      const cell = [...container.querySelectorAll('td')].find(td => td.textContent === '6.10');
      expect(cell, 'custom metric cell not found').toBeTruthy();
      await act(async () => { cell.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const input = container.querySelector('input[type="number"]');
      await act(async () => { setNativeValue(input, '6.5'); });
      await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });

      expect(saveCustomMetricTarget).toHaveBeenCalledWith(A, 'avgCheck', 'yearly', 6.5);
      expect(saveYearlyTargets).not.toHaveBeenCalled();
    });
  });
});
