// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #155 — renders the actual OperatorSummaryPanel/LaborAnalyticsPanel (not just the
// engine). Both panels' PERIODS array ends every FIXED preset on lastClosedBusinessDay() —
// which can structurally never equal today (it's always yesterday-or-earlier by construction,
// see its own comment in utils/date.js) — EXCEPT 'custom', which lets a user type today as the
// range end.
//
// This test reproduces "range.e = today" by mocking lastClosedBusinessDay() to return today,
// rather than driving the real 'custom' UI flow. That is a deliberate, disclosed substitution,
// not a shortcut around inconvenience: while writing this test we found that selecting "Custom"
// in these two panels blanks the ENTIRE panel (the "No Data Loaded" gate fires because cStart/
// cEnd start empty, so opStats/locStats -> [] the instant 'custom' is selected) before the date
// inputs a user would need are ever reachable in the DOM -- a real, pre-existing, unrelated bug,
// flagged separately in this dispatch's PR body, not fixed here (out of scope: nothing to do
// with oepe/r2p/tpph aggregation). Mocking lastClosedBusinessDay() isolates the actual question
// this dispatch cares about -- does this call site use metricRate once its range includes today
// -- from that separate defect blocking the one built-in path to reach it.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../engine/swing-feed.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, lastClosedBusinessDay: () => new Date() };
});

const { OperatorSummaryPanel, LaborAnalyticsPanel } = await import('../views/labor-tools.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOOP = () => {};
const today = new Date();
const d = (daysAgo) => { const x = new Date(today); x.setDate(x.getDate() - daysAgo); return x; };

// 5 complete days (tpph=10/day) + today, in-progress, with a much lower volume and an inflated
// per-hour rate (tpph=15) -- the same shape metric-sum-ratio.test.js's own fixtures use. No
// precomputed `tpph` field on any row, so both metricAvg and metricRate fall through to the
// same gc/actHrs derive -- isolating the aggregation method as the only variable. All 6 days
// fall within the default '4wk' period once lastClosedBusinessDay() is mocked to today.
function fixtureRows() {
  const rows = [];
  for (let i = 1; i <= 5; i++) rows.push({ loc: '10422', date: d(i), gc: 1000, actHrs: 100, sales: 10000 });
  rows.push({ loc: '10422', date: d(0), gc: 15, actHrs: 1, sales: 500 });
  return rows;
}

describe('Labor Tools TPPH uses the Σ/Σ rollup once the (mocked) period end is today (dispatch #155)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('OperatorSummaryPanel group TPPH reflects Σgc/Σhrs, not the mean-of-daily figure', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const ds = { loaded: true, qsrActSummaryRows: fixtureRows() };
    act(() => {
      root.render(React.createElement(OperatorSummaryPanel, { stores: [{ loc: '10422' }], ds, settings: {}, onClose: NOOP }));
    });
    // Σ/Σ = (1000*5+15)/(100*5+1) = 5015/501 ≈ 10.01; mean-of-daily = (10*5+15)/6 ≈ 10.83.
    // Single-store group -> the group's own simAvg('tpph') IS the store's metricRate value.
    expect(container.textContent).toContain('10.01');
    expect(container.textContent).not.toContain('10.83');
  });

  it('LaborAnalyticsPanel per-location TPPH reflects Σgc/Σhrs, not the mean-of-daily figure', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const ds = { loaded: true, qsrActSummaryRows: fixtureRows() };
    act(() => {
      root.render(React.createElement(LaborAnalyticsPanel, { stores: [{ loc: '10422' }], ds, settings: {}, onClose: NOOP }));
    });
    expect(container.textContent).toContain('10.01');
    expect(container.textContent).not.toContain('10.83');
  });
});
