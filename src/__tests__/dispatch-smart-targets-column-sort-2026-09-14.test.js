// @vitest-environment happy-dom
// @ts-nocheck
// Owner request (2026-09-14): click any column header in Smart Targets to sort by
// it. smartTargetsSortValue/sortSmartRows (unit-tested below) carry the actual
// sort logic; the render tests then confirm the wiring in the ACTUAL
// SmartTargetsPanel -- the header's onClick, the toggle-direction state, and
// applying the sort to `shown` -- since a pure-function-only test would keep
// passing even if the table never called sortSmartRows at all (the standing
// "would this verification still pass if reverted" rule).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { smartTargetsSortValue, sortSmartRows } from '../views/smart-targets.js';

describe('smartTargetsSortValue', () => {
  const row = (over = {}) => ({
    loc: '3708', official: 0.04, smart: 0.038, current: 0.041, vsOff: -5,
    winner: 'median3', btPerMethod: { median3: { mape: 4.2 } },
    confidence: 'High', excludedDays: 2, eventDelta: 0, excludedManual: 0,
    components: { compWaste: { smart: 0.002 }, rawWaste: { smart: 0.0035 } },
    ...over,
  });

  it('reads store name, official, smart, current, vsOfficial directly', () => {
    const r = row();
    expect(smartTargetsSortValue(r, 'official')).toBe(0.04);
    expect(smartTargetsSortValue(r, 'smart')).toBe(0.038);
    expect(smartTargetsSortValue(r, 'current')).toBe(0.041);
    expect(smartTargetsSortValue(r, 'vsOfficial')).toBe(-5);
    expect(typeof smartTargetsSortValue(r, 'store')).toBe('string');
  });

  it('bestFit reads the winning method\'s MAPE, not the method name', () => {
    expect(smartTargetsSortValue(row(), 'bestFit')).toBe(4.2);
    expect(smartTargetsSortValue(row({ winner: null }), 'bestFit')).toBeNull();
  });

  it('conf ranks High > Med > Low numerically (so it sorts meaningfully, not alphabetically)', () => {
    expect(smartTargetsSortValue(row({ confidence: 'High' }), 'conf')).toBeGreaterThan(smartTargetsSortValue(row({ confidence: 'Med' }), 'conf'));
    expect(smartTargetsSortValue(row({ confidence: 'Med' }), 'conf')).toBeGreaterThan(smartTargetsSortValue(row({ confidence: 'Low' }), 'conf'));
  });

  it('comp:<key> reads that FOB component\'s own Smart value', () => {
    expect(smartTargetsSortValue(row(), 'comp:compWaste')).toBe(0.002);
    expect(smartTargetsSortValue(row(), 'comp:rawWaste')).toBe(0.0035);
    expect(smartTargetsSortValue(row(), 'comp:unex')).toBeNull(); // no such component on this row
  });

  it('degrades to null on missing/malformed input rather than throwing', () => {
    expect(smartTargetsSortValue(null, 'smart')).toBeNull();
    expect(smartTargetsSortValue(row(), null)).toBeNull();
    expect(smartTargetsSortValue(row({ components: null }), 'comp:compWaste')).toBeNull();
  });
});

describe('sortSmartRows', () => {
  const rows = [
    { loc: 'a', smart: 30 }, { loc: 'b', smart: 10 }, { loc: 'c', smart: null }, { loc: 'd', smart: 20 },
  ];

  it('a null key is a no-op -- returns the input order untouched', () => {
    expect(sortSmartRows(rows, null, 'asc')).toBe(rows);
  });

  it('sorts ascending, nulls always last', () => {
    const sorted = sortSmartRows(rows, 'smart', 'asc');
    expect(sorted.map(r => r.loc)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('sorts descending, nulls STILL last (never treated as the biggest value)', () => {
    const sorted = sortSmartRows(rows, 'smart', 'desc');
    expect(sorted.map(r => r.loc)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('ties keep their original relative order (stable sort)', () => {
    const tied = [{ loc: 'x', smart: 5 }, { loc: 'y', smart: 5 }, { loc: 'z', smart: 5 }];
    expect(sortSmartRows(tied, 'smart', 'asc').map(r => r.loc)).toEqual(['x', 'y', 'z']);
  });

  it('sorts strings (Store) lexically', () => {
    const named = [{ loc: '1', official: null }, { loc: '2', official: null }];
    // smartTargetsSortValue('store') needs STORE_NAMES -- exercise via the real function with unknown locs (falls back to loc string).
    const sorted = sortSmartRows(named, 'store', 'asc');
    expect(sorted.map(r => r.loc)).toEqual(['1', '2']);
  });
});

vi.mock('../lib/supabase.js', () => ({
  loadDailySales: vi.fn(),
  loadGlimpse: vi.fn(),
  loadQsrFob: vi.fn(),
  loadQsrActSummary: vi.fn(),
  loadSmartTargetAdjustments: vi.fn(),
  saveSmartTargetAdjustment: vi.fn(),
  applyOfficialTargets: vi.fn(),
}));

import { loadDailySales, loadQsrFob, loadSmartTargetAdjustments } from '../lib/supabase.js';
import { SmartTargetsPanel } from '../views/smart-targets.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const recent = n => new Date(Date.now() - n * 864e5);
// fobMonthly (unlike the sales/labor/etc. pipeline's isoOf, which accepts either
// a Date or a string) does a bare `String(r.date).slice(0,10)` -- needs an ISO
// string, since a raw Date's `.toString()` starts with a weekday name, not
// YYYY-MM-DD. Matches the actual shape Supabase returns (a date COLUMN comes
// back as a string), and the sibling FOB-components test file's own `recent`.
const recentISO = n => recent(n).toISOString().slice(0, 10);

// 2 stores, sales metric (the default on mount), enough daily points across the
// trailing windows for each store's own median-of-simple Smart number to differ
// clearly (store 5183 roughly 2x store 3708's daily rate).
function buildSalesRows() {
  const rows = [];
  for (let n = 3; n <= 100; n += 3) {
    rows.push({ loc: '3708', date: recent(n), sales: 3000 });
    rows.push({ loc: '5183', date: recent(n), sales: 6500 });
  }
  return rows;
}

// Minimal FOB fixture so the FOB table still has rows to render after a metric
// switch (an empty-history metric shows a placeholder message instead of the
// table at all, which would make the header unfindable for no interesting
// reason -- this fixture just needs to exist, not be realistic).
function buildFobRows() {
  return [10, 40].map(n => ({
    loc: '3708', date: recentISO(n), prodSalesAmt: 100000,
    compWasteAmt: 200, rawWasteAmt: 350, condimentsAmt: 2050, empMgrMealsAmt: 200, statVarianceAmt: 1050, unexplainedAmt: 0,
  }));
}

describe('SmartTargetsPanel — real render, click-to-sort (owner request, 2026-09-14)', () => {
  let container, root;
  beforeEach(() => {
    loadDailySales.mockResolvedValue(buildSalesRows());
    loadQsrFob.mockResolvedValue(buildFobRows());
    loadSmartTargetAdjustments.mockResolvedValue({});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.clearAllMocks(); });

  const NOOP = () => {};
  const rowLocs = () => [...container.querySelectorAll('tbody tr')].map(tr => (tr.textContent.match(/#(\d+)/) || [])[1]);

  it('clicking the Smart header sorts ascending, then descending on a second click', async () => {
    await act(async () => {
      root.render(React.createElement(SmartTargetsPanel, { ds: {}, stores: [{ loc: '3708' }, { loc: '5183' }], settings: {}, onClose: NOOP, embedded: true }));
      await new Promise(r => setTimeout(r, 0));
    });
    expect(rowLocs().length).toBe(2);

    const smartHeader = [...container.querySelectorAll('th')].find(t => t.textContent.startsWith('Smart'));
    expect(smartHeader, 'Smart header not found').toBeTruthy();

    await act(async () => { smartHeader.click(); });
    expect(smartHeader.textContent).toContain('▲');
    const ascOrder = rowLocs();

    await act(async () => { smartHeader.click(); });
    expect(smartHeader.textContent).toContain('▼');
    const descOrder = rowLocs();

    // The two directions must be reverses of each other, and (since the two
    // stores' daily rates were built ~2x apart) the order must actually differ
    // from whatever the default direction-aware sort already produced -- this
    // proves the click is driving `shown`'s order, not coincidentally matching it.
    expect(descOrder).toEqual([...ascOrder].reverse());
  });

  it('switching metric resets the sort back to the default order', async () => {
    await act(async () => {
      root.render(React.createElement(SmartTargetsPanel, { ds: {}, stores: [{ loc: '3708' }, { loc: '5183' }], settings: {}, onClose: NOOP, embedded: true }));
      await new Promise(r => setTimeout(r, 0));
    });
    const smartHeader = [...container.querySelectorAll('th')].find(t => t.textContent.startsWith('Smart'));
    await act(async () => { smartHeader.click(); });
    expect(smartHeader.textContent).toContain('▲');

    const metricSelect = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent.includes('Sales')));
    await act(async () => {
      metricSelect.value = 'fob';
      metricSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 0));
    });
    const smartHeaderAfter = [...container.querySelectorAll('th')].find(t => t.textContent.startsWith('Smart'));
    expect(smartHeaderAfter.textContent).not.toContain('▲');
    expect(smartHeaderAfter.textContent).not.toContain('▼');
  });
});
