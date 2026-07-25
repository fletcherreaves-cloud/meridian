// @ts-nocheck
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getModelAssignment, _masgnInvalidate } from '../engine/forecast.js';
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
