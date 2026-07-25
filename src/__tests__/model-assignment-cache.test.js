// @ts-nocheck
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getModelAssignment, _masgnInvalidate } from '../engine/forecast.js';
import { applyPeriodTotalWinners } from '../engine/backtest.js';
import { MODEL_ASSIGNMENT_KEY } from '../constants.js';

// Regression guard for the v4.536 fix: runModelAssignmentBacktest used to do
// `_masgnCache=merged`, but _masgnCache is module-private to forecast.js and not
// imported into backtest.js — in an ES module that assignment throws a
// ReferenceError the try/catch swallowed, so getModelAssignment kept serving
// STALE/DEFAULT assignments (the whole app ignored a fresh backtest until reload).
// The fix calls the exported _masgnInvalidate() instead. These tests pin the
// contract that invalidation is what makes a fresh write visible.

function installLS() {
  const store = {};
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
  };
}

describe('model-assignment cache invalidation', () => {
  beforeEach(() => { installLS(); _masgnInvalidate(); });
  afterAll(() => { try { delete globalThis.localStorage; } catch {} });

  it('reflects a fresh localStorage write after _masgnInvalidate (the fix path)', () => {
    const loc = '3708';
    localStorage.setItem(MODEL_ASSIGNMENT_KEY, JSON.stringify({
      [loc]: { weekly: { model: 'simple', mape: 4.1, backtestDate: '2026-07-25' } },
    }));
    _masgnInvalidate();
    expect(getModelAssignment(loc, 'weekly', {}).model).toBe('simple');
  });

  it('serves stale data when a write is NOT followed by invalidation (documents the bug)', () => {
    const loc = '3709';
    getModelAssignment(loc, 'weekly', {}); // primes the in-memory cache with the (empty) store
    localStorage.setItem(MODEL_ASSIGNMENT_KEY, JSON.stringify({ [loc]: { weekly: { model: 'simple' } } }));
    // Cache is primed and not invalidated → the new write is invisible.
    expect(getModelAssignment(loc, 'weekly', {}).model).not.toBe('simple');
    // Invalidate → now it's picked up.
    _masgnInvalidate();
    expect(getModelAssignment(loc, 'weekly', {}).model).toBe('simple');
  });
});

describe('applyPeriodTotalWinners', () => {
  beforeEach(() => { installLS(); _masgnInvalidate(); });
  afterAll(() => { try { delete globalThis.localStorage; } catch {} });

  const result = {
    runDate: '2026-07-25', folds: 6, periodDays: 28,
    winnerCounts: { ae: 1 },
    perStore: {
      '3708': { storeName: 'Ardmore', winner: 'ae', perModel: { ae: { mape: 2.3 }, simple: { mape: 4.5 } } },
      '3709': { storeName: 'Chickasha', winner: 'ewma', perModel: { ewma: { mape: 2.4 } } },
    },
  };

  it('writes winners into Monthly + Yearly (not Weekly) and getModelAssignment reflects them', () => {
    const r = applyPeriodTotalWinners(result);
    expect(r.applied).toBe(4); // 2 stores × 2 horizons
    expect(getModelAssignment('3708', 'monthly', {}).model).toBe('ae');
    expect(getModelAssignment('3708', 'yearly', {}).model).toBe('ae');
    expect(getModelAssignment('3709', 'monthly', {}).model).toBe('ewma');
    // Weekly is deliberately left alone → not 'ae' from this apply.
    expect(getModelAssignment('3708', 'weekly', {}).ref || '').not.toMatch(/Period-total/);
  });

  it('preserves a manual override (no backtestDate) but overwrites a prior auto entry', () => {
    localStorage.setItem(MODEL_ASSIGNMENT_KEY, JSON.stringify({
      '3708': { monthly: { model: 'di' } },                          // manual → keep
      '3709': { monthly: { model: 'dow', backtestDate: '2026-06-01' } }, // auto → overwrite
    }));
    _masgnInvalidate();
    applyPeriodTotalWinners(result);
    expect(getModelAssignment('3708', 'monthly', {}).model).toBe('di');    // preserved
    expect(getModelAssignment('3709', 'monthly', {}).model).toBe('ewma');  // overwritten
  });
});
