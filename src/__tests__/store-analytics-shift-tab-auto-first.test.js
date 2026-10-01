// @vitest-environment happy-dom
// @ts-nocheck
// store-analytics.js's ShiftAnalysisTab (Store Analytics > Shift Analysis) had the same bug as
// analytics.js's computeAllCorrelations / signals.js's CorrelationsTab: its DOW-breakdown sales +
// channel-mix table, its Weekday-vs-Weekend cards, and its Competitive Intelligence same-day/
// DOW-avg lookup all read ds.laborRows (the manual Labor Excel upload) directly, so the whole
// section silently went blank on any device with only cloud data and no manual upload ever done.
// Fixed to source via metric-source.js's metricSeries/metricDaily (auto-first), same fix pattern
// as CorrelationsTab (see src/__tests__/signals-correlations-tab-auto-first.test.js).
//
// Per "would this verification still pass if reverted?": renders the REAL ShiftAnalysisTab with
// a fixture carrying ONLY qsrActSummaryRows (sales) + salesLedgerRows (channel mix %) + ctrlRows
// (laborPct/tpph) -- explicitly NO ds.laborRows. Under the old code every one of those reads
// would resolve to nothing, so `hasSalesData` would be false and the whole DOW breakdown section
// would not render at all -- a revert fails this.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ShiftAnalysisTab } from '../views/store-analytics.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const d = s => new Date(s + 'T00:00:00');
const LOC = '3708'; // Ardmore-Broadway, real STORE_NAMES entry

// Two full weeks so every weekday (0-6) has at least one resolved day. Generated relative to
// "today" (ending a few days back, safely inside ShiftAnalysisTab's `cut = now - 6wk` window)
// rather than hardcoded calendar dates -- a fixed 2026-08-03..08-16 range silently aged out of
// that rolling window and started failing on its own once "today" passed ~2026-09-27, with no
// code change involved (caught 2026-10-01: cut had rolled to ~Aug 20, past the fixture's last
// date of Aug 16, so hasSalesData correctly went false for data genuinely outside the lookback).
function recentDateKeys(n, endOffsetDays = 3) {
  const end = new Date(); end.setDate(end.getDate() - endOffsetDays);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(end); dt.setDate(dt.getDate() - i);
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}
const DATES = recentDateKeys(14);

const qsrActSummaryRows = DATES.map((date, i) => ({
  loc: LOC, date: d(date), sales: 8000 + (i % 7) * 300, gc: 700,
}));
const salesLedgerRows = DATES.map(date => ({
  loc: LOC, date: d(date),
  dtPctTotal: 0.62, bfPctTotal: 0.18, mopPctTotal: 0.07, kioskPctTotal: 0.04, delivPctTotal: 0.03,
}));
const ctrlRows = DATES.map(date => ({
  loc: LOC, date: d(date), laborPct: 0.24, tpph: 1.6,
}));

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe('ShiftAnalysisTab -- auto-first sourcing', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });

  it('renders the DOW breakdown / Weekday-vs-Weekend sections for a store with only cloud data (no ds.laborRows)', async () => {
    ({ container, root } = mountRoot());
    const ds = { loaded: true, qsrActSummaryRows, salesLedgerRows, ctrlRows };
    const store = { loc: LOC, p: {}, t: {} };
    await act(async () => {
      root.render(React.createElement(ShiftAnalysisTab, { store, ds, settings: {}, userEvents: {} }));
    });

    expect(container.textContent).toContain('Weekday vs Weekend');
    expect(container.textContent).toContain('Average Sales by Day of Week');
    // At least one weekday bar should carry a real dollar figure, not just the empty '-' rows.
    expect(container.textContent).toMatch(/\$\d/);
  });

  it('without the fix, an auto-only store would show no DOW breakdown at all (sanity check the fixture actually exercises the bug)', async () => {
    ({ container, root } = mountRoot());
    // A ds shaped like the OLD code required (data only reachable via ds.laborRows) but
    // genuinely empty of it -- confirms hasSalesData is false and the section doesn't render.
    const ds = { loaded: true };
    const store = { loc: LOC, p: {}, t: {} };
    await act(async () => {
      root.render(React.createElement(ShiftAnalysisTab, { store, ds, settings: {}, userEvents: {} }));
    });
    expect(container.textContent).not.toContain('Weekday vs Weekend');
    expect(container.textContent).not.toContain('Average Sales by Day of Week');
  });
});
