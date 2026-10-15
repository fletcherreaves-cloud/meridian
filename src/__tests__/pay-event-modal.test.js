// @vitest-environment happy-dom
// @ts-nocheck
// PayEventModal (owner request 2026-10-15) -- covers the real component end-to-end: opening it,
// changing fields, and that save() actually calls savePayEvent with the right payload. Engine
// math (detectAropJumps/payRaiseImpact) is covered directly in pay-events.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PayEventModal } from '../views/pay-event-modal.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let savedPayload = null;
vi.mock('../lib/supabase.js', () => ({
  savePayEvent: async (ev) => { savedPayload = ev; return { id: 'x', error: null }; },
}));

describe('PayEventModal', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); savedPayload = null; });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('defaults the effective date to today, saves with the chosen store + raise type', async () => {
    const today = new Date().toISOString().slice(0, 10);
    act(() => { root.render(React.createElement(PayEventModal, { loc: '10422', ds: {}, onClose: () => {}, onSaved: () => {} })); });
    const dateInput = container.querySelector('input[type="date"]');
    expect(dateInput.value).toBe(today);
    expect(dateInput.max).toBe(today); // never a future effective date

    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Log Pay Event');
    await act(async () => { saveBtn.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(savedPayload.loc).toBe('10422');
    expect(savedPayload.effectiveDate).toBe(today);
    expect(savedPayload.raiseType).toBe('review_raise'); // first PAY_EVENT_TYPES entry, default selection
  });

  it('a pre-supplied defaultEffectiveDate overrides today', async () => {
    act(() => { root.render(React.createElement(PayEventModal, {
      loc: '10422', ds: {}, defaultEffectiveDate: '2026-07-15', onClose: () => {}, onSaved: () => {},
    })); });
    expect(container.querySelector('input[type="date"]').value).toBe('2026-07-15');
  });

  it('typing an amount and a note includes them in the saved payload', async () => {
    act(() => { root.render(React.createElement(PayEventModal, { loc: '10422', ds: {}, onClose: () => {}, onSaved: () => {} })); });
    const amountInput = container.querySelector('input[type="number"]');
    const noteArea = container.querySelector('textarea');
    await act(async () => {
      const setNum = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setNum.call(amountInput, '0.50');
      amountInput.dispatchEvent(new Event('input', { bubbles: true }));
      const setTa = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setTa.call(noteArea, 'annual review raise');
      noteArea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Log Pay Event');
    await act(async () => { saveBtn.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(savedPayload.amountPerHour).toBe(0.5);
    expect(savedPayload.note).toBe('annual review raise');
  });

  it('calls onSaved and onClose after a successful save', async () => {
    let saved = false, closed = false;
    act(() => { root.render(React.createElement(PayEventModal, {
      loc: '10422', ds: {}, onClose: () => { closed = true; }, onSaved: () => { saved = true; },
    })); });
    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Log Pay Event');
    await act(async () => { saveBtn.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(saved).toBe(true);
    expect(closed).toBe(true);
  });
});
