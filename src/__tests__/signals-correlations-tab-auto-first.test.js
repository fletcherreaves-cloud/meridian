// @vitest-environment happy-dom
// @ts-nocheck
// signals.js's CorrelationsTab (Signals -> Correlations) had the same bug as analytics.js's
// computeAllCorrelations (a sibling consumer of the same CORR_TARGETS/CORR_PREDICTORS catalog):
// it joined RAW ds.laborRows/opsRows/ctrlRows rows by date, manual-upload-only, so the tab
// showed "No data" for any store whose recent days only an auto/cloud stream covered. Fixed to
// source via metric-source.js's metricSeries (auto-first), same fix as analytics.js.
//
// Per "would this verification still pass if reverted?": renders the REAL CorrelationsTab
// (exported specifically for this, same reasoning as ParkOepeTab's own export) with a fixture
// carrying ONLY qsrActSummaryRows and explicitly NO ds.laborRows/opsRows/ctrlRows -- under the
// old code `joined` would always be empty, so a revert shows the "No data" empty state and
// fails this.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { CorrelationsTab } from '../views/signals.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const d = s => new Date(s + 'T00:00:00');
const LOC = '3708'; // Ardmore-Broadway, real STORE_NAMES entry

const DAYS = [
  ['2026-08-01', 180, 8000], ['2026-08-02', 150, 9000], ['2026-08-03', 200, 7000],
  ['2026-08-04', 160, 8800], ['2026-08-05', 140, 9500], ['2026-08-06', 220, 6500],
  ['2026-08-07', 170, 8200], ['2026-08-08', 190, 7500], ['2026-08-09', 155, 9100],
  ['2026-08-10', 210, 6800], ['2026-08-11', 145, 9300], ['2026-08-12', 175, 8000],
];
const qsrActSummaryRows = DAYS.map(([date, oepe, sales]) => ({ loc: LOC, date: d(date), oepe, sales, gc: Math.round(sales / 10) }));

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe('CorrelationsTab -- auto-first sourcing', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });

  it('shows real correlations for a store whose data is entirely auto-sourced (no manual laborRows/opsRows/ctrlRows)', async () => {
    ({ container, root } = mountRoot());
    const ds = { loaded: true, qsrActSummaryRows };
    await act(async () => { root.render(React.createElement(CorrelationsTab, { ds })); });

    const sel = container.querySelector('select');
    expect(sel, 'store <select> not found').toBeTruthy();
    await act(async () => { sel.value = LOC; sel.dispatchEvent(new Event('change', { bubbles: true })); });

    expect(container.textContent).not.toMatch(/No data for/);
    expect(container.textContent).toContain('Drive-Thru Speed (OEPE)');
  });

  it('without the fix, an auto-only store would show the empty state (sanity check the fixture actually exercises the bug)', async () => {
    ({ container, root } = mountRoot());
    // A ds shaped like the OLD code required (data only reachable via laborRows/opsRows/ctrlRows)
    // but genuinely empty of those -- confirms the empty state itself renders correctly for a
    // store with no data, i.e. this isn't a test that would pass no matter what.
    const ds = { loaded: true };
    await act(async () => { root.render(React.createElement(CorrelationsTab, { ds })); });
    const sel = container.querySelector('select');
    await act(async () => { sel.value = LOC; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.textContent).toMatch(/No data for/);
  });
});
