// @vitest-environment happy-dom
// @ts-nocheck
// Mass-review notes 70 (2026-10-13) — "Weekly Count Status > Come up with a way to make it so
// that whatever date is selected, it resolves to the data for that calendar week. Can we add
// drill-down to the findings as well?"
//
// Renders the REAL WeeklyCountStatusPanel against mocked loadQsrOnHand/loadWeeklyCountDayOverrides
// (same pattern weekly-count-status-report.test.js already uses) — per this repo's "verification
// must touch the call site" standing rule, not an isolated weekStartOf() call.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { weekStartOf, addD, dKey } from '../utils/date.js';

vi.mock('../utils/print-html.js', () => ({ printHtml: vi.fn() }));

let _onHandByPeriod = {};
let _overrides = {};

vi.mock('../lib/supabase.js', () => ({
  loadQsrOnHand: vi.fn(({ period } = {}) => Promise.resolve(_onHandByPeriod[period] || [])),
  loadWeeklyCountDayOverrides: vi.fn(() => Promise.resolve(_overrides)),
}));

const { WeeklyCountStatusPanel } = await import('../views/weekly-count-status-report.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mkRow = (loc, cls, wrin, lastCounted, extra = {}) => ({ loc, cls, wrin, last_counted: lastCounted, ...extra });
function fullStoreRows(loc, { lastCounted = null, newWrin = false } = {}) {
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => mkRow(loc, 'Food', `f-${i}`, lastCounted)),
    ...Array.from({ length: 10 }, (_, i) => mkRow(loc, 'Condiment', `c-${i}`, lastCounted)),
  ];
  if (newWrin) rows.push(mkRow(loc, 'Food', 'new-item', null, { descr: 'New Fry Sauce' }));
  return rows;
}

describe('WeeklyCountStatusPanel — date resolves to its calendar week (mass-review notes 70)', () => {
  let container, root;
  beforeEach(() => {
    _onHandByPeriod = {}; _overrides = {};
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  const render = async (props = {}) => {
    await act(async () => {
      root.render(React.createElement(WeeklyCountStatusPanel, { stores: [], ds: {}, settings: {}, onClose: () => {}, ...props }));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  };

  const setDate = async (value) => {
    const input = container.querySelector('input[type="date"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  };

  it('two different weekdays in the SAME calendar week show the identical status and week label', async () => {
    // A past, fully-settled week so neither pick lands on "today" (avoids the current-week
    // today-clamp, isolating the actual week-resolution behavior under test).
    const aWeekStart = weekStartOf(addD(new Date(), -30)); // settings.weekStartDay default (3, Wed)
    const mon = dKey(addD(aWeekStart, 2));   // some weekday inside that week
    const fri = dKey(addD(aWeekStart, 6));   // a DIFFERENT weekday, same week
    const countDay = dKey(addD(aWeekStart, 1)); // the store's actual full count, early in that week
    const curP = countDay.slice(0, 7);
    _onHandByPeriod[curP] = fullStoreRows('3708', { lastCounted: countDay });

    await render();
    await setDate(mon);
    const textAtMon = container.textContent;
    await setDate(fri);
    const textAtFri = container.textContent;

    // Same week label, same status word, same days-since-count figure, regardless of which
    // day within that week was clicked.
    const weekLabelOf = t => (t.match(/Week of [^\n·]+/) || [''])[0];
    expect(weekLabelOf(textAtMon)).toBe(weekLabelOf(textAtFri));
    const daysSinceOf = t => (t.match(/(\d+)d ago/) || [])[1];
    expect(daysSinceOf(textAtMon)).toBe(daysSinceOf(textAtFri));
  });

  it('a date in a DIFFERENT calendar week shows a different week label', async () => {
    const wk1Start = weekStartOf(addD(new Date(), -60));
    const wk2Start = addD(wk1Start, 7);
    _onHandByPeriod[dKey(wk1Start).slice(0, 7)] = fullStoreRows('3708', { lastCounted: dKey(wk1Start) });

    await render();
    await setDate(dKey(wk1Start));
    const label1 = (container.textContent.match(/Week of [^\n·]+/) || [''])[0];
    await setDate(dKey(wk2Start));
    const label2 = (container.textContent.match(/Week of [^\n·]+/) || [''])[0];

    expect(label1).not.toBe(label2);
    expect(label1).not.toBe('');
  });
});

describe('WeeklyCountStatusPanel — drill-down on New/Stale item findings', () => {
  let container, root;
  beforeEach(() => {
    _onHandByPeriod = {}; _overrides = {};
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  const render = async (props = {}) => {
    await act(async () => {
      root.render(React.createElement(WeeklyCountStatusPanel, { stores: [], ds: {}, settings: {}, onClose: () => {}, ...props }));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  };

  it('clicking the new-item badge reveals the item description; clicking again hides it', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const curP = today.slice(0, 7);
    const prevP = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);
    _onHandByPeriod[prevP] = fullStoreRows('3708', { lastCounted: null });
    _onHandByPeriod[curP] = fullStoreRows('3708', { lastCounted: today, newWrin: true });
    await render();

    expect(container.textContent).not.toContain('New Fry Sauce');
    const badge = [...container.querySelectorAll('button')].find(b => /pending/.test(b.textContent || ''));
    expect(badge).toBeTruthy();
    await act(async () => { badge.click(); });
    expect(container.textContent).toContain('New Fry Sauce');

    await act(async () => { badge.click(); });
    expect(container.textContent).not.toContain('New Fry Sauce');
  });
});
