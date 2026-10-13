// @vitest-environment happy-dom
// @ts-nocheck
// Owner-reported live (screenshot): Above-Store One-Pager's Sales/GC section read "—" for every
// vs-LY figure (Sales vs LY, GC vs LY, and every per-store drilldown row) when a Custom date
// range ~11 months in the past was picked, despite "Product Sales" itself showing a real total.
//
// Root cause, live-measured (Supabase service-role read of labor_rows for store 3708): the data
// genuinely exists on BOTH legs (2024-11-27 and 2025-11-27), but App.js bootstraps ds.laborRows
// (400 days) and ds.qsrActSummaryRows (60 days) ONCE at startup, trailing from "today" -- the
// same bug class already fixed twice this session (Performance Reviews Auto-Fill,
// CurrentMonthPaceSection). matchedVsLY (engine/vs-ly.js) needs the picked range's own dates
// PLUS the dates 364 days further back (the LY leg) -- for an ~11-month-old Custom range, the LY
// leg lands ~23 months back, past even the 400-day window.
//
// Renders the REAL AboveStoreOnePager component (per this repo's "would this verification still
// pass if reverted?" rule) with a deliberately narrow ds (only a trailing-2-week laborRows
// window, the exact live bug shape) and a mocked widen fetch standing in for what a real
// Supabase read of the full-history table would return.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '3708';
// A fixed, unambiguous custom range ~11 months before "now" (matches the live screenshot's
// 11/27/2025 pick against an Oct 2026 "today").
const CUR_DATE = '2025-11-27';
const LY_DATE = '2024-11-28'; // EXACT 364-day shift back from CUR_DATE (matchedVsLY's own matching window)
const CUR_SALES = 7614.48;
const LY_SALES = 12487.18;

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  // Simulates labor_rows genuinely holding both legs (as live-measured) -- the widen-fetch's
  // whole point is that this data was always there, just never re-fetched for an
  // out-of-bootstrap-window custom range.
  const wideLabor = async () => ([
    { loc: LOC, date: new Date(`${LY_DATE}T12:00:00`), sales: LY_SALES, gc: 950 },
    { loc: LOC, date: new Date(`${CUR_DATE}T12:00:00`), sales: CUR_SALES, gc: 620 },
  ]);
  return { ...actual, loadLaborRows: async (daysBack) => wideLabor(daysBack), loadQsrActSummary: async () => ([]) };
});

const { AboveStoreOnePager } = await import('../views/above-store-onepager.js');

describe('AboveStoreOnePager Sales/GC vs-LY widens a stale ds window for an old Custom range (2026-10-13)', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('a ds whose laborRows only covers the last ~2 weeks still shows a real Sales vs LY % via the widened fetch', async () => {
    const narrowLaborRows = [
      { loc: LOC, date: new Date(Date.now() - 10 * 86400000), sales: 999, gc: 100 },
    ];
    await act(async () => {
      root.render(React.createElement(AboveStoreOnePager, {
        ds: { loaded: true, laborRows: narrowLaborRows, laborByLoc: {}, qsrActSummaryRows: [], qsrFobRows: [] },
        settings: {}, userEvents: {}, eventImpact: {}, onClose: () => {},
        initialScope: LOC, initialPeriod: 'custom', initialCustomRange: { s: CUR_DATE, e: CUR_DATE },
      }));
    });
    // Flush the widen-fetch effect's mocked promise chain + the resulting setWideDs/re-render.
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });

    // Before the fix: this read "—" (null pct, no LY leg reachable). After: the real matched-day
    // pct from the mocked wide fetch -- (7614.48-12487.18)/12487.18 ≈ -39.01%.
    const row = [...container.querySelectorAll('div')].find(el => el.textContent.includes('Sales vs LY (Trading Day)') && /−|-|%/.test(el.textContent));
    expect(row, 'Sales vs LY (Trading Day) row not found').toBeTruthy();
    expect(container.textContent).toMatch(/-39\.0\d%/);
    expect(container.textContent).not.toContain('Sales vs LY (Trading Day)—');
  });

  it('a ds whose laborRows already reaches back far enough does NOT trigger a widen fetch (no needless network cost)', async () => {
    const wideEnoughRows = [
      { loc: LOC, date: new Date(`2024-01-01T12:00:00`), sales: 11111, gc: 400 }, // proves the oldest-row check, not read for LY matching
      { loc: LOC, date: new Date(`${LY_DATE}T12:00:00`), sales: 55555, gc: 900 }, // real ds value, must win
      { loc: LOC, date: new Date(`${CUR_DATE}T12:00:00`), sales: CUR_SALES, gc: 620 },
    ];
    await act(async () => {
      root.render(React.createElement(AboveStoreOnePager, {
        ds: { loaded: true, laborRows: wideEnoughRows, laborByLoc: {}, qsrActSummaryRows: [], qsrFobRows: [] },
        settings: {}, userEvents: {}, eventImpact: {}, onClose: () => {},
        initialScope: LOC, initialPeriod: 'custom', initialCustomRange: { s: CUR_DATE, e: CUR_DATE },
      }));
    });
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });

    // (7614.48-55555)/55555 ≈ -86.29% -- the ALREADY-WIDE ds's own LY value must win; the mocked
    // widen-fetch's LY_SALES (12487.18, which would give -39.01%) must NOT appear.
    expect(container.textContent).toMatch(/-86\.2\d%/);
    expect(container.textContent).not.toMatch(/-39\.0\d%/);
  });
});
