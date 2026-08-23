// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #77 Step 3 -- Top/Bottom Performers is built entirely on the Step 1/2 direction
// registry (engine/metric-source.js's METRIC_SOURCES `direction`). This is the "would this
// verification still pass if reverted" bar the dispatch itself sets: renders the ACTUAL
// TopBottomPerformers consumer, not rankPerformers() directly, so a bug in the panel's own
// sort/render wiring (e.g. hardcoding ascending order regardless of direction) fails this test
// even though the engine function underneath would still be correct.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { TopBottomPerformers } from '../views/top-bottom-performers.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dk = d => d.toISOString().slice(0, 10);

// 28 consecutive days ending yesterday -- matches the panel's default 'l4w' window preset, so
// these rows are actually in range without the test needing to know the preset's exact math.
function daysBack(n) {
  const e = addDays(new Date(), -1);
  return Array.from({ length: n }, (_, i) => dk(addDays(e, -i)));
}

function mkFixture() {
  const fullWindow = daysBack(28);
  const rows = { qsrActSummaryRows: [], glimpseRows: [] };
  // Store A: high sales (good, higher-better), high labor % (bad, lower-better).
  for (const date of fullWindow) {
    rows.qsrActSummaryRows.push({ loc: '90001', date, sales: 1000 });
    rows.glimpseRows.push({ loc: '90001', date, laborPct: 0.30 });
  }
  // Store B: low sales (bad), low labor % (good) -- the mirror image of A.
  for (const date of fullWindow) {
    rows.qsrActSummaryRows.push({ loc: '90002', date, sales: 500 });
    rows.glimpseRows.push({ loc: '90002', date, laborPct: 0.10 });
  }
  // Store C: a single day, way under the 28-day floor other stores carry -- and deliberately an
  // extreme sales value (would falsely rank #1 if it leaked into the ranked list at all).
  rows.qsrActSummaryRows.push({ loc: '90003', date: fullWindow[0], sales: 999999 });
  return rows;
}

const STORES = [{ loc: '90001' }, { loc: '90002' }, { loc: '90003' }];

describe('Top/Bottom Performers (dispatch #77 Step 3)', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  // Reads the ordering of ACTUAL ranked rows, keyed by the row's own data-loc marker -- not raw
  // textContent.indexOf, which also matches the scope-picker's store pills (always sorted
  // numerically 90001<90002<90003 regardless of which metric is selected, so a naive substring
  // search would pass by coincidence on the sales case and never actually detect a flip).
  const rankedLocs = () => [...container.querySelectorAll('[data-testid="performer-row"]')].map(el => el.getAttribute('data-loc'));

  // The ranked figure is the mean of each store's DAILY values, which for a ratio metric is an
  // average-of-averages rather than the period figure a P&L would show (true Sum/Sum deferred --
  // see engine/top-bottom-performers.js's header and memory/dispatch-77.md). A bare "Labor %"
  // label would imply the period value, so the panel must say what the number actually is.
  // Asserted on the rendered panel, not on a constant, so deleting the caption fails this.
  it('states on its surface that the figure is a daily average, not the period total', () => {
    const ds = mkFixture();
    act(() => { root.render(React.createElement(TopBottomPerformers, { stores: STORES, ds, onClose: () => {} })); });
    const txt = container.textContent;
    expect(txt).toContain('daily average over the window');
    expect(txt).toContain('not the period total');
  });

  it('ranks by the higher-better metric (sales) with the higher store first', () => {
    const ds = mkFixture();
    act(() => { root.render(React.createElement(TopBottomPerformers, { stores: STORES, ds, onClose: () => {} })); });
    // Sales is the default metric -- A (1000/day) must outrank B (500/day).
    expect(rankedLocs()).toEqual(['90001', '90002']);
  });

  it('flips the ranking end-for-end when switching to a lower-better metric (Labor %)', () => {
    const ds = mkFixture();
    act(() => { root.render(React.createElement(TopBottomPerformers, { stores: STORES, ds, onClose: () => {} })); });
    const laborBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Labor %');
    expect(laborBtn).toBeTruthy();
    act(() => { laborBtn.click(); });
    // Labor % is lower-better: B (10%) now outranks A (30%) -- the exact reverse of the sales case.
    expect(rankedLocs()).toEqual(['90002', '90001']);
  });

  it('excludes the thin (n=1) store from the ranked list instead of silently ranking it', () => {
    const ds = mkFixture();
    act(() => { root.render(React.createElement(TopBottomPerformers, { stores: STORES, ds, onClose: () => {} })); });
    const text = container.textContent;
    expect(text).toContain('Insufficient data');
    expect(text).toContain('90003');
    expect(text).toContain('n=1');
    // 90003 must never appear as an actual ranked row (data-testid="performer-row") -- only in
    // the separate thin-data list -- even though its fabricated $999,999 sales value would put
    // it in first place if it leaked into the ranking.
    expect(rankedLocs()).not.toContain('90003');
    const thinLine = [...container.querySelectorAll('div')]
      .find(d => d.children.length === 0 && d.textContent && d.textContent.includes('too little data to rank'));
    expect(thinLine).toBeTruthy();
  });
});
