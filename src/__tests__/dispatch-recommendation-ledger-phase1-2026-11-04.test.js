// @vitest-environment happy-dom
// @ts-nocheck
// Recommendation Accuracy Ledger -- Phase 1 (task #80 follow-on, owner-approved 2026-11-04,
// "you can start phase 1"). See memory/plan-recommendation-accuracy-ledger-2026-11-04.md.
//
// Pure-helper tests (dedupeKeyFor/gradeOutcome/outcomeDueAtForMonth) plus an integration test
// against the REAL MonthlyProjectionsPanel -- per this repo's "would this verification still
// pass if reverted?" rule, a pure-function-only test suite could pass unchanged with the
// capture wiring deleted from analytics.js, so the integration test renders the real panel and
// asserts the ledger calls actually fire on the real suggestion-render and save paths.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { STORE_NAMES } from '../constants.js';
import { dedupeKeyFor, outcomeDueAtForMonth, gradeOutcome } from '../engine/recommendation-ledger.js';

describe('dedupeKeyFor', () => {
  it('is stable for the same inputs and distinct across any differing part', () => {
    const k = dedupeKeyFor('sales_forecast', '3708', 'tProdSales', '2026-11');
    expect(k).toBe(dedupeKeyFor('sales_forecast', '3708', 'tProdSales', '2026-11'));
    expect(k).not.toBe(dedupeKeyFor('sales_forecast', '3709', 'tProdSales', '2026-11'));
    expect(k).not.toBe(dedupeKeyFor('sales_forecast', '3708', 'tCrewLabor', '2026-11'));
    expect(k).not.toBe(dedupeKeyFor('sales_forecast', '3708', 'tProdSales', '2026-12'));
    expect(k).not.toBe(dedupeKeyFor('labor_tpph_forecast', '3708', 'tProdSales', '2026-11'));
  });
});

describe('outcomeDueAtForMonth', () => {
  it('is the 1st of the FOLLOWING month, UTC midnight', () => {
    expect(outcomeDueAtForMonth(2026, 11)).toBe(new Date(Date.UTC(2026, 11, 1)).toISOString());
    expect(outcomeDueAtForMonth(2026, 11)).toBe('2026-12-01T00:00:00.000Z');
  });
  it('rolls December into January of the NEXT year', () => {
    expect(outcomeDueAtForMonth(2026, 12)).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('gradeOutcome', () => {
  it('grades within the default 5% tolerance as within_tolerance', () => {
    expect(gradeOutcome(100000, 103000).grade).toBe('within_tolerance');
    expect(gradeOutcome(100000, 97500).grade).toBe('within_tolerance');
  });
  it('grades a real miss as under (outcome higher than the recommendation) or over (lower)', () => {
    expect(gradeOutcome(100000, 120000)).toEqual({ outcome_error: 20000, grade: 'under' });
    expect(gradeOutcome(100000, 80000)).toEqual({ outcome_error: -20000, grade: 'over' });
  });
  it('respects a custom tolerance', () => {
    expect(gradeOutcome(10, 10.3, 0.01).grade).toBe('under'); // 3% miss, 1% tolerance
    expect(gradeOutcome(10, 10.3, 0.05).grade).toBe('within_tolerance'); // same miss, 5% tolerance
  });
  it('handles a zero recommendation without dividing by zero', () => {
    expect(gradeOutcome(0, 0)).toEqual({ outcome_error: 0, grade: 'within_tolerance' });
    expect(gradeOutcome(0, 5)).toEqual({ outcome_error: 5, grade: 'under' });
  });
  it('returns nulls, never a fabricated grade, when either value is missing', () => {
    expect(gradeOutcome(null, 100)).toEqual({ outcome_error: null, grade: null });
    expect(gradeOutcome(100, undefined)).toEqual({ outcome_error: null, grade: null });
  });
});

// ── Integration: the real MonthlyProjectionsPanel actually calls through to the ledger ──────
const saveMonthlyTargets = vi.fn(() => Promise.resolve({ saved: 1, errors: [] }));
const saveRecommendation = vi.fn(() => Promise.resolve({ saved: 1, errors: [] }));
const updateRecommendationOutcome = vi.fn(() => Promise.resolve({ saved: 1, errors: [] }));
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    saveMonthlyTargets: (...args) => saveMonthlyTargets(...args),
    saveRecommendation: (...args) => saveRecommendation(...args),
    updateRecommendationOutcome: (...args) => updateRecommendationOutcome(...args),
    listMonthlyTargetPeriods: () => Promise.resolve([]),
    loadMonthlyTargets: () => Promise.resolve({}),
  };
});
// Deterministic suggestions, independent of the real forecast models' own math (already
// covered by dispatch-80's own test files) -- this test is about the LEDGER WIRING, not the
// forecast models themselves.
vi.mock('../engine/owner-sales-forecast.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, computeOwnerSalesForecast: () => ({ [A]: { forecastSales: 310000, reviewFlag: false } }) };
});
vi.mock('../engine/owner-labor-tpph-forecast.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, computeLaborTpphForecast: () => ({ [A]: { laborPct: { value: 0.22, trend: 'flat' }, tpph: { value: 5.5, trend: 'flat' } } }) };
});

const { MonthlyProjectionsPanel } = await import('../views/analytics.js');

const [A] = ['3708'];
const YEAR = 2026, MONTH = 11;

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

describe('Recommendation Accuracy Ledger capture (task #80 follow-on, integration)', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });

  async function render(ds) {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(MonthlyProjectionsPanel, {
        ds, stores: [{ loc: A, name: STORE_NAMES[A] }], settings: {}, onClose: () => {},
        canOwnProjections: true,
      }));
    });
    await act(async () => { await Promise.resolve(); });
  }

  it('logs a recommendation for each field with a live suggestion badge, exactly once per value', async () => {
    saveRecommendation.mockClear();
    await render(freshDs());

    const periodKey = YEAR + '-' + String(MONTH).padStart(2, '0');
    const salesCall = saveRecommendation.mock.calls.find(([row]) => row.source === 'sales_forecast');
    expect(salesCall, 'no sales_forecast recommendation logged').toBeTruthy();
    expect(salesCall[0]).toMatchObject({
      dedupe_key: dedupeKeyFor('sales_forecast', A, 'tProdSales', periodKey),
      loc: A, recommendation_value: 310000,
    });

    const laborCall = saveRecommendation.mock.calls.find(([row]) => row.context?.field === 'tCrewLabor');
    expect(laborCall[0]).toMatchObject({ source: 'labor_tpph_forecast', recommendation_value: 0.22 });
    const tpphCall = saveRecommendation.mock.calls.find(([row]) => row.context?.field === 'tTpph');
    expect(tpphCall[0]).toMatchObject({ source: 'labor_tpph_forecast', recommendation_value: 5.5 });

    // A second mount tick with the SAME suggestion values must not re-log (signature dedupe).
    const callsAfterFirstMount = saveRecommendation.mock.calls.length;
    await act(async () => { await Promise.resolve(); });
    expect(saveRecommendation.mock.calls.length).toBe(callsAfterFirstMount);
  });

  it('clicking the Suggested-TPPH badge to accept it marks the ledger row accepted', async () => {
    saveRecommendation.mockClear(); updateRecommendationOutcome.mockClear();
    await render(freshDs());

    const badge = [...container.querySelectorAll('div[title*="Click to accept"]')]
      .find(d => d.textContent.includes('Suggested') && d.textContent.includes('5.50'));
    expect(badge, 'Suggested TPPH badge not found').toBeTruthy();
    await act(async () => { badge.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(saveMonthlyTargets).toHaveBeenCalled();
    const periodKey = YEAR + '-' + String(MONTH).padStart(2, '0');
    expect(updateRecommendationOutcome).toHaveBeenCalledWith(
      dedupeKeyFor('labor_tpph_forecast', A, 'tTpph', periodKey),
      expect.objectContaining({ status: 'accepted', accepted_value: 5.5 }),
    );
  });

  it('hand-typing a value far from the TPPH suggestion marks the ledger row overridden, not accepted', async () => {
    saveRecommendation.mockClear(); updateRecommendationOutcome.mockClear();
    await render(freshDs());

    const cell = [...container.querySelectorAll('td')].find(td => td.textContent.startsWith('5.40'));
    expect(cell, 'TPPH cell not found').toBeTruthy();
    await act(async () => { cell.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const input = container.querySelector('input[type="number"]');
    await act(async () => { setNativeValue(input, '7.0'); });
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });

    const periodKey = YEAR + '-' + String(MONTH).padStart(2, '0');
    expect(updateRecommendationOutcome).toHaveBeenCalledWith(
      dedupeKeyFor('labor_tpph_forecast', A, 'tTpph', periodKey),
      expect.objectContaining({ status: 'overridden', accepted_value: 7 }),
    );
  });
});
