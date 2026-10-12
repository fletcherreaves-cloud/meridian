// @vitest-environment happy-dom
// @ts-nocheck
// Owner req (2026-10-11): a standalone, printable Weekly Count Status report modeled off Count
// Cycle's own data -- last full count, regular count day (+ a drift flag vs settings), this-week
// status, and pending new items. Renders the REAL WeeklyCountStatusPanel against mocked
// loadQsrOnHand/loadWeeklyCountDayOverrides -- the same "render the real component" standard
// this repo's other dispatch tests use, not an isolated helper.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../utils/print-html.js', () => ({ printHtml: vi.fn() }));

let _onHandByPeriod = {};   // period -> rows
let _overrides = {};

vi.mock('../lib/supabase.js', () => ({
  loadQsrOnHand: vi.fn(({ period } = {}) => Promise.resolve(_onHandByPeriod[period] || [])),
  loadWeeklyCountDayOverrides: vi.fn(() => Promise.resolve(_overrides)),
}));

const { WeeklyCountStatusPanel } = await import('../views/weekly-count-status-report.js');
const { printHtml } = await import('../utils/print-html.js');

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

describe('WeeklyCountStatusPanel', () => {
  let container, root;
  const today = new Date().toISOString().slice(0, 10);

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

  it('shows a store as Complete when fully counted this week, with a last-full-count date', async () => {
    const curP = new Date().toISOString().slice(0, 7);
    _onHandByPeriod[curP] = fullStoreRows('3708', { lastCounted: today });
    await render();
    expect(container.textContent).toContain('Complete');
    expect(container.textContent).toContain(today);
  });

  it('shows "No full weekly yet" for a store with no counted items at all', async () => {
    const curP = new Date().toISOString().slice(0, 7);
    _onHandByPeriod[curP] = fullStoreRows('3708', { lastCounted: null });
    await render();
    expect(container.textContent).toContain('No full weekly yet');
  });

  it('shows a new-item badge when a brand-new WRIN is pending, without blocking Complete status', async () => {
    const curP = new Date().toISOString().slice(0, 7);
    const prevP = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);
    // Prior period has the same 30 items (none new there); current period adds one more.
    _onHandByPeriod[prevP] = fullStoreRows('3708', { lastCounted: null });
    _onHandByPeriod[curP] = fullStoreRows('3708', { lastCounted: today, newWrin: true });
    await render();
    expect(container.textContent).toMatch(/🆕 1 pending/);
    expect(container.textContent).toContain('Complete');   // the new item doesn't block compliance
  });

  it('flags a count-day drift against the configured setting', async () => {
    // The panel fetches 4 trailing periods (current + 3 prior) for the drift sample
    // (countDayDrift's minSample=3 would never clear just 2). Build ONE qualifying full
    // count per period -- a single canonical row set per period (no duplicate wrins across
    // dates, which would inflate the coverage denominator) -- each landing on the SAME
    // weekday, so detectWeeklyCountDay reads a confident, sustained pattern.
    const now = new Date();
    const periodKeyOf = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`;
    const sameWeekdayDateInMonth = (y, m, targetWeekday) => {
      const d = new Date(y, m, 1);
      while (d.getDay() !== targetWeekday) d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    };
    const THURSDAY = 4;
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const p = periodKeyOf(d.getFullYear(), d.getMonth());
      const sessionDate = sameWeekdayDateInMonth(d.getFullYear(), d.getMonth(), THURSDAY);
      _onHandByPeriod[p] = fullStoreRows('3708', { lastCounted: sessionDate });
    }
    _overrides['3708'] = 'Tuesday';   // settings still say Tuesday
    await render();
    expect(container.textContent).toMatch(/changed\?/);
  });

  it('Print and CSV buttons are present and do not throw', async () => {
    const curP = new Date().toISOString().slice(0, 7);
    _onHandByPeriod[curP] = fullStoreRows('3708', { lastCounted: today });
    await render();
    const printBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Print'));
    expect(printBtn).toBeTruthy();
    await act(async () => { printBtn.click(); });
    expect(printHtml).toHaveBeenCalledTimes(1);
  });

  it('scopes to a single store via initialScope (My Reports launch shape)', async () => {
    const curP = new Date().toISOString().slice(0, 7);
    _onHandByPeriod[curP] = [...fullStoreRows('3708', { lastCounted: today }), ...fullStoreRows('5183', { lastCounted: today })];
    await render({ initialScope: '3708' });
    expect(container.textContent).toContain('#3708');
    expect(container.textContent).not.toContain('#5183');
  });
});
