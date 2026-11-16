// @vitest-environment happy-dom
// @ts-nocheck
// Owner report, live, screenshot of a real store's "3 Peaks × Labor Gap" section (Shift Analysis
// tab): OEPE/R2P/KVS/Parked/Sales all real, TPPH "—" for all three dayparts. Measured live
// against production: the whole section reads a manual "3 Peaks" Excel upload (peaks_rows) that
// hadn't been refreshed since 2026-06-30 (4.5 months stale), and TPPH had NEVER had a non-zero
// value in that table, ever -- a 2026-11-05 header-alias fix had never been exercised against a
// real re-upload. Per CLAUDE.md's standing rule ("manual sourcing is always temporary... the fix
// is the auto stream that covers it, never a request for another spreadsheet"), store-dash.js's
// new autoFirstPeaks() derives the same metrics from the already-pulled HOURLY qsr_daily_activity
// stream (src/engine/daypart-peaks.js) and prefers it over the stale manual upload.
//
// This file covers the merge logic (autoFirstPeaks) and, per "would this verification still pass
// if reverted?", a REAL render of ShiftAnalysisTab reproducing the exact bug scenario: stale
// manual peaks data with tpph:0 (matching the real production shape) alongside fresh auto
// daypart activity -- the call site a fix touching only the engine would miss.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { autoFirstPeaks } from '../views/store-dash.js';
import { ShiftAnalysisTab } from '../views/store-analytics.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const LOC = '3708'; // Ardmore-Broadway, real STORE_NAMES entry
const d = s => new Date(s + 'T12:00:00Z');

function hourRow(dt, hour_slot, overrides = {}) {
  return {
    loc: LOC, dt, hour_slot,
    product_sales: 0, transactions: 0,
    dt_untilserve: 0, dt_untilstore: 0, dt_heldtime: 0, dt_trans_cnt: 0, dt_carsheld: 0,
    fc_untilserve: 0, fc_untilclosedrawer: 0, fc_trans_cnt: 0,
    mfy1_untilserve: 0, mfy1_trans_cnt: 0, mfy2_untilserve: 0, mfy2_trans_cnt: 0,
    actual_punched_hours: 0,
    ...overrides,
  };
}

// Recent dates inside the default 6-week trailing window, mirroring
// store-analytics-shift-tab-auto-first.test.js's own rolling-window-safe pattern.
function recentDateKeys(n, endOffsetDays = 3) {
  const end = new Date(); end.setDate(end.getDate() - endOffsetDays);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(end); dt.setDate(dt.getDate() - i);
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}
const DATES = recentDateKeys(5);

// Real auto-pulled hourly activity: real transactions + punched hours in the lunch window, every
// recent day -- exactly the shape loadDaypartActivity() returns.
const daypartActivityRows = DATES.flatMap(dt => [
  hourRow(dt, '12:00', { transactions: 100, actual_punched_hours: 10, product_sales: 1000 }),
  hourRow(dt, '13:00', { transactions: 150, actual_punched_hours: 15, product_sales: 1500 }),
  hourRow(dt, '14:00', { transactions: 50, actual_punched_hours: 25, product_sales: 500 }),
]);

// The stale manual upload: real OEPE/R2P/KVS/Sales, tpph literally 0 on every row -- the EXACT
// production shape measured live (peaks_rows, 2026-06-30, tpph never once non-zero).
const peaksSvcRows = [{ loc: LOC, date: d('2026-06-30'), slice: 'lunch', oepe: 132, r2p: 114, kvst: 33, parkPct: 0.1473, dtGC: 50 }];
const peaksSalesRows = [{ loc: LOC, date: d('2026-06-30'), slice: 'lunch', netSales: 4731, gc: 400, avgCheck: 11.8, tpph: 0 }];

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe('autoFirstPeaks — merge logic', () => {
  it('prefers the auto-derived TPPH when the auto stream has real coverage for a daypart', () => {
    const ds = { peaksSvcRows, peaksSalesRows, daypartActivityRows };
    const r = autoFirstPeaks(ds, LOC, 6);
    // Σtxns=300*5days=1500, Σhours=50*5days=250 -> 6.0 -- the real auto figure, not the stale 0.
    expect(r.lunch.tpph).toBeCloseTo(6.0, 5);
    expect(r.lunch.count).toBeGreaterThan(0);
  });

  it('falls back to the manual figure for a daypart the auto stream has no coverage for', () => {
    // breakfast/dinner have no daypartActivityRows at all -- must fall back to the (zero) manual
    // data rather than silently reporting a fabricated auto zero as if it were real.
    const ds = { peaksSvcRows, peaksSalesRows, daypartActivityRows };
    const r = autoFirstPeaks(ds, LOC, 6);
    expect(r.breakfast.count).toBe(0); // manual's own count for breakfast (no rows for that slice)
  });

  it('falls back entirely to analyzePeaks when there is no auto data for this store at all', () => {
    const ds = { peaksSvcRows, peaksSalesRows, daypartActivityRows: [] };
    const r = autoFirstPeaks(ds, LOC, 6);
    expect(r.lunch.tpph).toBe(0); // the stale manual figure, unchanged -- no auto data to prefer
    expect(r.lunch.netSales).toBe(4731);
  });
});

describe('ShiftAnalysisTab — 3 Peaks × Labor Gap TPPH (real render, reproduces the live bug)', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });

  it('shows a real TPPH number (not "—") once auto daypart activity is present, with the stale manual upload still in ds', async () => {
    ({ container, root } = mountRoot());
    const ds = { loaded: true, peaksSvcRows, peaksSalesRows, daypartActivityRows };
    const store = { loc: LOC, p: {}, t: {} };
    await act(async () => {
      root.render(React.createElement(ShiftAnalysisTab, { store, ds, settings: {}, userEvents: {} }));
    });
    const tpphLabels = [...container.querySelectorAll('span')].filter(el => el.textContent === 'TPPH');
    expect(tpphLabels.length).toBeGreaterThan(0);
    const values = tpphLabels.map(el => el.nextSibling?.textContent || el.parentElement.querySelector('span:last-child')?.textContent);
    expect(values.some(v => /^\d+\.\d\d$/.test(v || ''))).toBe(true);
  });

  it('sanity check: with ONLY the stale manual upload (no auto data), TPPH genuinely renders as "—" -- confirms the fixture reproduces the real bug', async () => {
    ({ container, root } = mountRoot());
    const ds = { loaded: true, peaksSvcRows, peaksSalesRows, daypartActivityRows: [] };
    const store = { loc: LOC, p: {}, t: {} };
    await act(async () => {
      root.render(React.createElement(ShiftAnalysisTab, { store, ds, settings: {}, userEvents: {} }));
    });
    const tpphLabels = [...container.querySelectorAll('span')].filter(el => el.textContent === 'TPPH');
    expect(tpphLabels.length).toBeGreaterThan(0);
    const values = tpphLabels.map(el => el.parentElement.querySelector('span:last-child')?.textContent);
    expect(values.every(v => v === '—')).toBe(true);
  });
});
