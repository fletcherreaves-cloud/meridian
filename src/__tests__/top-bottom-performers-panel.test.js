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
import { INV_ORG_COORDS } from '../constants.js';

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

// Dispatch #77 (numerator/denominator gap, resolved 2026-08-24) -- unlike mkFixture() above,
// which reads Labor % off a PRECOMPUTED field (glimpseRows.laborPct), these two stores carry the
// resolvable numerator+denominator legs (opsLaborRows.laborDollar, qsrActSummaryRows.sales) for
// every day, so rankPerformers can compute the true Sum/Sum rather than falling back to
// mean-of-daily.
function mkRatioSumFixture() {
  const fullWindow = daysBack(28);
  const rows = { opsLaborRows: [], qsrActSummaryRows: [] };
  for (const date of fullWindow) {
    rows.opsLaborRows.push({ loc: '90004', date, laborDollar: 300 });
    rows.qsrActSummaryRows.push({ loc: '90004', date, sales: 1000 });
    rows.opsLaborRows.push({ loc: '90005', date, laborDollar: 100 });
    rows.qsrActSummaryRows.push({ loc: '90005', date, sales: 1000 });
  }
  return rows;
}
const RATIO_STORES = [{ loc: '90004' }, { loc: '90005' }];

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

  // Dispatch #104 -- the 16-metric pill row became a <select>. Same metricKey state, same
  // selection semantics; only the picker's DOM shape changed.
  it('flips the ranking end-for-end when switching to a lower-better metric (Labor %) via the metric dropdown', () => {
    const ds = mkFixture();
    act(() => { root.render(React.createElement(TopBottomPerformers, { stores: STORES, ds, onClose: () => {} })); });
    const select = container.querySelector('select');
    expect(select).toBeTruthy();
    const opt = [...select.options].find(o => o.textContent === 'Labor %');
    expect(opt).toBeTruthy();
    act(() => {
      select.value = opt.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
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

  // Dispatch #77 -- when the ratio's numerator and denominator both resolve independently (not
  // just a precomputed ratio field), the panel must show the TRUE period-total disclaimer, not
  // the daily-average one the mkFixture() cases above correctly show. Reverting rankPerformers to
  // always use mean-of-daily makes this fail (the sum-basis text would never appear).
  it('switches to the true period-total (Sum/Sum) disclaimer once the metric\'s numerator and denominator both resolve', () => {
    const ds = mkRatioSumFixture();
    act(() => { root.render(React.createElement(TopBottomPerformers, { stores: RATIO_STORES, ds, onClose: () => {} })); });
    const select = container.querySelector('select');
    const opt = [...select.options].find(o => o.textContent === 'Labor %');
    act(() => {
      select.value = opt.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const txt = container.textContent;
    expect(txt).toContain('true period total (Σ ÷ Σ)');
    expect(txt).not.toContain('daily average over the window');
  });
});

// ── Dispatch #104, Part 3 -- FOB % as a rankable category ──────────────────────
// Built on the 6-controllable-component / sales definition fobSnapshotByStore (eom-inventory.js)
// and analytics.js's dispatch-#102-fixed computeFOBMetrics already use (see metric-source.js's
// fobTotalAmt/fobPct chains). One qsr_fob row per day per store here -- unlike the real table
// (a period-to-date snapshot re-published daily), so this fixture is intentionally simple: same
// $ values every day, which keeps the Σ/Σ rollup exactly equal to the single-day ratio and lets
// the test assert a known number rather than only a direction.
function mkFobFixture() {
  const fullWindow = daysBack(28);
  const rows = { qsrFobRows: [] };
  // Store A: FOB% = 215/10000 = 2.15% (better -- FOB is lower-better).
  // Store B: FOB% = 645/10000 = 6.45% (worse).
  for (const date of fullWindow) {
    rows.qsrFobRows.push({
      loc: '90006', date, prodSalesAmt: 10000,
      compWasteAmt: 100, rawWasteAmt: 50, condimentsAmt: 30, empMgrMealsAmt: 20, statVarianceAmt: 10, unexplainedAmt: 5,
    });
    rows.qsrFobRows.push({
      loc: '90007', date, prodSalesAmt: 10000,
      compWasteAmt: 300, rawWasteAmt: 150, condimentsAmt: 90, empMgrMealsAmt: 60, statVarianceAmt: 30, unexplainedAmt: 15,
    });
  }
  return rows;
}
const FOB_STORES = [{ loc: '90006' }, { loc: '90007' }];

describe('Top/Bottom Performers -- FOB % (dispatch #104)', () => {
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

  const rankedLocs = () => [...container.querySelectorAll('[data-testid="performer-row"]')].map(el => el.getAttribute('data-loc'));

  it('offers FOB % as a selectable metric and ranks the lower (better) store first', () => {
    const ds = mkFobFixture();
    act(() => { root.render(React.createElement(TopBottomPerformers, { stores: FOB_STORES, ds, onClose: () => {} })); });
    const select = container.querySelector('select');
    const opt = [...select.options].find(o => o.textContent === 'FOB %');
    expect(opt).toBeTruthy();
    act(() => {
      select.value = opt.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // FOB % is lower-better: A (2.15%) outranks B (6.45%).
    expect(rankedLocs()).toEqual(['90006', '90007']);
  });

  it('ranks FOB % on the true Σnumerator/Σdenominator period basis, not mean-of-daily', () => {
    const ds = mkFobFixture();
    act(() => { root.render(React.createElement(TopBottomPerformers, { stores: FOB_STORES, ds, onClose: () => {} })); });
    const select = container.querySelector('select');
    const opt = [...select.options].find(o => o.textContent === 'FOB %');
    act(() => {
      select.value = opt.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const txt = container.textContent;
    expect(txt).toContain('true period total (Σ ÷ Σ)');
    // The rendered figure is the exact Σ/Σ ratio (215/10000 = 2.15%), not diluted or inflated by
    // the 28-day window -- the exact class of bug dispatch #102 fixed elsewhere on this same
    // qsr_fob table (summing snapshot $ across days would have produced a wildly different number).
    expect(txt).toContain('2.15%');
    expect(txt).toContain('6.45%');
  });
});

// ── Dispatch #104, Part 1 -- location selector, progressive reveal ─────────────
// Fallback resolution (no live owner confirmation reachable): keep the existing pill-style
// standard, but reveal one tier at a time instead of all 30+ pills flat/simultaneous. Uses REAL
// INV_ORG_COORDS store ids (unlike the synthetic 900xx fixtures above) because the hierarchy is
// built from that map -- a synthetic loc has no state/patch and would trivially pass.
describe('Top/Bottom Performers -- location selector progressive reveal (dispatch #104)', () => {
  let container, root;
  const okLoc1 = '3708', okLoc2 = '5183', flLoc = '6178';
  const REAL_STORES = [{ loc: okLoc1 }, { loc: okLoc2 }, { loc: flLoc }];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const pillButtons = () => [...container.querySelectorAll('button')];

  it('shows only All + State pills by default -- no Patch or Store pills yet', () => {
    act(() => { root.render(React.createElement(TopBottomPerformers, { stores: REAL_STORES, ds: {}, onClose: () => {} })); });
    const labels = pillButtons().map(b => b.textContent);
    expect(labels).toContain('All Locations');
    expect(labels).toContain('OK');
    expect(labels).toContain('FL');
    // Neither store's own patch (sup) name, nor any bare store loc/name pill, is present yet.
    expect(labels).not.toContain(INV_ORG_COORDS[okLoc1].sup);
    expect(labels.some(l => l && l.startsWith(okLoc1))).toBe(false);
  });

  it('clicking a State pill reveals that state\'s Patch pills, still no Store pills', () => {
    act(() => { root.render(React.createElement(TopBottomPerformers, { stores: REAL_STORES, ds: {}, onClose: () => {} })); });
    const okBtn = pillButtons().find(b => b.textContent === 'OK');
    act(() => { okBtn.click(); });
    const labels = pillButtons().map(b => b.textContent);
    expect(labels).toContain(INV_ORG_COORDS[okLoc1].sup);
    expect(labels).toContain(INV_ORG_COORDS[okLoc2].sup);
    // FL's own patch must not leak in just because a State was picked.
    expect(labels).not.toContain(INV_ORG_COORDS[flLoc].sup);
    expect(labels.some(l => l && l.startsWith(okLoc1))).toBe(false);
  });

  it('clicking a Patch pill reveals that patch\'s Store pills, and selecting one scopes the ranking to it', () => {
    const ds = mkFixtureForLoc(okLoc1);
    act(() => { root.render(React.createElement(TopBottomPerformers, { stores: REAL_STORES, ds, onClose: () => {} })); });
    act(() => { pillButtons().find(b => b.textContent === 'OK').click(); });
    const patchBtn = pillButtons().find(b => b.textContent === INV_ORG_COORDS[okLoc1].sup);
    act(() => { patchBtn.click(); });
    const storeBtn = pillButtons().find(b => b.textContent && b.textContent.startsWith(okLoc1));
    expect(storeBtn).toBeTruthy();
    act(() => { storeBtn.click(); });
    // scope.level:'store' narrows locationSelectorLocs (unchanged logic) to exactly this one loc
    // -- same substance as the pre-existing 'full' mode, just revealed progressively.
    const rows = [...container.querySelectorAll('[data-testid="performer-row"]')].map(el => el.getAttribute('data-loc'));
    expect(rows).toEqual([okLoc1]);
  });
});

// Minimal 28-day sales fixture for a single real loc, so the "select a store" test above has a
// real ranked row to assert on instead of an empty list.
function mkFixtureForLoc(loc) {
  const fullWindow = daysBack(28);
  const rows = { qsrActSummaryRows: [] };
  for (const date of fullWindow) rows.qsrActSummaryRows.push({ loc, date, sales: 1000 });
  return rows;
}
