// @vitest-environment happy-dom
// @ts-nocheck
// Owner, live, 2026-10-14: a real coaching cycle was logged today describing training that
// happened a month earlier ("...on Tuesday September 15th" in the note), but the modal had no
// way to say so -- coachedAt was always "today," so the auto-captured baseline came from a
// trailing window that landed AFTER the real intervention, silently invalidating the measured
// effect. This covers the fix end-to-end through the real component: changing the new "When did
// this happen?" date input changes both the live baseline preview AND what actually gets saved,
// not just the engine function in isolation (engine coverage lives in coaching-loop.test.js).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { CoachingModal } from '../views/coaching-modal.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let savedPayload = null;
vi.mock('../lib/supabase.js', () => ({
  saveCoachingCycle: async (cycle) => { savedPayload = cycle; return { error: null }; },
  updateCoachingCycleResult: async () => ({ error: null }),
}));

describe('CoachingModal mode:start -- "when did this happen?" backdating', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); savedPayload = null; });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('defaults the date input to today and saves with today as coachedAt', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    // A real data row near "now" -- the Start Coaching button stays disabled with a null
    // baseline (by design: nothing to measure from), so this fixture needs at least one row
    // inside the default (today-anchored) window for the save to be reachable at all.
    const ds = { qsrFobRows: [{ loc: '10422', date: yesterday, prodSalesAmt: 1000, condimentsAmt: 20 }] };
    act(() => { root.render(React.createElement(CoachingModal, {
      mode: 'start', loc: '10422', metricKey: 'condiment_pct', ds, onClose: () => {}, onSaved: () => {},
    })); });
    const dateInput = container.querySelector('input[type="date"]');
    expect(dateInput).toBeTruthy();
    expect(dateInput.value).toBe(today);

    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Start Coaching');
    await act(async () => { saveBtn.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(savedPayload.coachedAt).toBe(today);
  });

  it('backdating the date changes both the baseline preview AND the saved coachedAt', async () => {
    // Trailing-14-day windows ending near two different anchor dates get different ratios, so a
    // changed baseline on screen proves the date input actually drives the live preview, not
    // just cosmetic text.
    const qsrFobRows = [
      { loc: '10422', date: '2026-07-10', prodSalesAmt: 1000, condimentsAmt: 50 }, // 5% -- old window
    ];
    const ds = { qsrFobRows };
    act(() => { root.render(React.createElement(CoachingModal, {
      mode: 'start', loc: '10422', metricKey: 'condiment_pct', ds, onClose: () => {}, onSaved: () => {},
    })); });

    const dateInput = container.querySelector('input[type="date"]');
    // No baseline yet for TODAY's window (no rows near today) -- "—" placeholder.
    expect(container.textContent).toContain('—');

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(dateInput, '2026-07-15');
      dateInput.dispatchEvent(new Event('input', { bubbles: true }));
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('5.00%'); // the old window's real ratio, now surfaced

    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Start Coaching');
    await act(async () => { saveBtn.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(savedPayload.coachedAt).toBe('2026-07-15');
    expect(savedPayload.baseline).toBeCloseTo(0.05, 5);
  });

  it('the date input cannot be set past today (max attribute)', () => {
    const today = new Date().toISOString().slice(0, 10);
    const ds = { qsrFobRows: [] };
    act(() => { root.render(React.createElement(CoachingModal, {
      mode: 'start', loc: '10422', metricKey: 'condiment_pct', ds, onClose: () => {}, onSaved: () => {},
    })); });
    const dateInput = container.querySelector('input[type="date"]');
    expect(dateInput.max).toBe(today);
  });
});
