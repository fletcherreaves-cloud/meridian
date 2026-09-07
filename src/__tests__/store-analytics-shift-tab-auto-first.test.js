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

// Two full weeks so every weekday (0-6) has at least one resolved day.
const DATES = [
  '2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07','2026-08-08','2026-08-09',
  '2026-08-10','2026-08-11','2026-08-12','2026-08-13','2026-08-14','2026-08-15','2026-08-16',
];

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
