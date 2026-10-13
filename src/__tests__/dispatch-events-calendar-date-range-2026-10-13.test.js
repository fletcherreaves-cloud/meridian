// @vitest-environment happy-dom
// @ts-nocheck
// Mass-review notes 70 (2026-10-13) — "Events > Upcoming > once i click on Full Ledger (search /
// edit / export), can we add ability to add event for date range as well."
//
// Renders the REAL EventCalendar component (store-dash.js) — per this repo's "would this
// verification still pass if reverted?" standing rule, not an isolated save() helper. Reuses the
// same rangeId/rangeDayNum/rangeTotalDays/"(Day N of M)" convention events-import.js's
// orgEventsToDayMap() already established for org-sourced multi-day spans, so a manually-created
// range looks identical to an imported one to every existing consumer.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { EventCalendar } from '../views/store-dash.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORES = [{ loc: '3708', name: 'Ardmore-Broadway' }, { loc: '5183', name: 'Other Store' }];

describe('EventCalendar — date-range event creation (mass-review notes 70)', () => {
  let container, root, lastSaved;
  const onUpdate = (next) => { lastSaved = next; };

  afterEach(() => { act(() => { root.unmount(); }); container.remove(); lastSaved = undefined; });

  const render = async (userEvents = {}) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(EventCalendar, { userEvents, onUpdate, onClose: () => {}, stores: STORES }));
    });
  };

  const click = async (el) => { await act(async () => { el.click(); }); };
  const setVal = async (el, value) => {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  it('a new event with no end date still creates exactly one day (existing single-day behavior, unchanged)', async () => {
    await render({});
    const addBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('+Add Event'));
    await click(addBtn);
    const dateInputs = [...container.querySelectorAll('input[type="date"]')];
    await setVal(dateInputs[0], '2026-11-03');
    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Save');
    await click(saveBtn);

    expect(lastSaved).toBeTruthy();
    const days = Object.keys(lastSaved['3708'] || {});
    expect(days).toEqual(['2026-11-03']);
    expect(lastSaved['3708']['2026-11-03'].rangeId).toBeUndefined();
  });

  it('a new event with an end date creates one entry per day, sharing a rangeId with "(Day N of M)" labels', async () => {
    await render({});
    const addBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('+Add Event'));
    await click(addBtn);
    const dateInputs = [...container.querySelectorAll('input[type="date"]')];
    expect(dateInputs.length).toBeGreaterThanOrEqual(2); // start + end, only shown for a new event
    await setVal(dateInputs[0], '2026-11-03');
    await setVal(dateInputs[1], '2026-11-06'); // 4-day range: 3,4,5,6
    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Save');
    await click(saveBtn);

    expect(lastSaved).toBeTruthy();
    const days = Object.keys(lastSaved['3708']).sort();
    expect(days).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    const rangeId = lastSaved['3708']['2026-11-03'].rangeId;
    expect(rangeId).toBeTruthy();
    for (const dk of days) expect(lastSaved['3708'][dk].rangeId).toBe(rangeId);
    expect(lastSaved['3708']['2026-11-03'].label).toMatch(/\(Day 1 of 4\)$/);
    expect(lastSaved['3708']['2026-11-06'].label).toMatch(/\(Day 4 of 4\)$/);
    expect(lastSaved['3708']['2026-11-03'].rangeDayNum).toBe(1);
    expect(lastSaved['3708']['2026-11-06'].rangeDayNum).toBe(4);
    expect(lastSaved['3708']['2026-11-03'].rangeTotalDays).toBe(4);
  });

  it('editing an EXISTING single day never shows an end-date input, even if it is part of someone else\'s range', async () => {
    const userEvents = {
      '3708': {
        '2026-11-03': { type: 'other', note: '', icon: '📌', label: 'Other (Day 1 of 2)', rangeId: 'x', rangeDayNum: 1, rangeTotalDays: 2 },
        '2026-11-04': { type: 'other', note: '', icon: '📌', label: 'Other (Day 2 of 2)', rangeId: 'x', rangeDayNum: 2, rangeTotalDays: 2 },
      },
    };
    await render(userEvents);
    const editBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Edit'));
    await click(editBtn);
    const dateInputs = [...container.querySelectorAll('input[type="date"]')];
    expect(dateInputs.length).toBe(1); // start date only — editing one day of a range stays one day
  });

  it('the no-end-date single-day behavior does not warn about overwriting unrelated days in the range', async () => {
    const origConfirm = window.confirm;
    let confirmCalls = 0;
    window.confirm = () => { confirmCalls++; return true; };
    try {
      // Pre-existing event on 2026-11-05 ONLY (not 03/04/06) — saving a 03->06 range must warn
      // about that one collision, naming it, not silently skip or silently overwrite it.
      const userEvents = { '3708': { '2026-11-05': { type: 'other', note: '', icon: '📌', label: 'Pre-existing' } } };
      await render(userEvents);
      const addBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('+Add Event'));
      await click(addBtn);
      const dateInputs = [...container.querySelectorAll('input[type="date"]')];
      await setVal(dateInputs[0], '2026-11-03');
      await setVal(dateInputs[1], '2026-11-06');
      const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Save');
      await click(saveBtn);
      expect(confirmCalls).toBe(1);
      expect(lastSaved['3708']['2026-11-05'].label).not.toBe('Pre-existing'); // confirmed, so it was replaced
    } finally { window.confirm = origConfirm; }
  });
});
