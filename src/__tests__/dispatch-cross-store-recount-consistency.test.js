// @vitest-environment happy-dom
// @ts-nocheck
// Cross-store recount consistency (2026-08-31, memory/scoping-sage-mcnuggets-learning-2026-08-31.md):
// the SAME item recounted at multiple stores in one period, with SOME recounts helping and OTHERS
// hurting, surfaces as a new "⚠ Cross-Store Inconsistency" section in the Recount Impact report.
//
// Per this repo's "would this verification still pass if reverted?" standing rule (CLAUDE.md), this
// renders the REAL EOMDashboardPanel -> EOMRecountImpactPanel chain via the actual tab-click path,
// not an isolated call into crossStoreRecountConsistency() — a test that only calls the engine
// function directly could not tell "computed correctly" from "computed correctly but never wired
// into the panel", which is exactly the class of bug the dispatch-227 print test in this same
// directory was written to catch for a different feature.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { periodKey } from '../engine/eom-inventory.js';
import { closeWindowStartFor } from '../engine/eom-ledger-baseline.js';

const PERIOD = periodKey(new Date());
const CLOSE_START = closeWindowStartFor(PERIOD, 3);
const RECOUNT_DAY = (() => {
  const d = new Date(CLOSE_START + 'T00:00:00'); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
})();

// Minimal on-hand + FOB presence for both stores -- recountImpactRows only iterates stores that
// show up in the panel's own scoped `rows` (built from allRows, which needs FOB/on-hand data to
// produce a row per store), same fixture shape dispatch-227-eom-reports.test.js's own Recount
// Impact case uses.
const ONHAND = [
  { loc: '3708', wrin: 'X900', descr: 'Cross-Store Test Item', cls: 'Food', onHandAmt: 10, lastCounted: RECOUNT_DAY },
  { loc: '6178', wrin: 'X900', descr: 'Cross-Store Test Item', cls: 'Food', onHandAmt: 10, lastCounted: RECOUNT_DAY },
];
const FOB = [
  { loc: '3708', date: `${PERIOD}-15`, prodSalesAmt: 100000, compWasteAmt: 800, rawWasteAmt: 400, condimentsAmt: 300, empMgrMealsAmt: 100, statVarianceAmt: 200, unexplainedAmt: 200 },
  { loc: '6178', date: `${PERIOD}-15`, prodSalesAmt: 50000, compWasteAmt: 300, rawWasteAmt: 200, condimentsAmt: 100, empMgrMealsAmt: 50, statVarianceAmt: 100, unexplainedAmt: 50 },
];

// Two stores, the SAME wrin, opposite recount outcomes -- the exact shape of the real McNuggets
// finding (four stores hurt, two helped) scaled down to the minimum that still proves the point.
const RAW_ITEM_DETAIL = [
  {
    loc: '3708', wrin: 'X900', descr: 'Cross-Store Test Item', itemClass: 'Food',
    history: [
      { isCount: true, dt: CLOSE_START, tm: '10:00', difference: -20 },     // session — near-zero
      { isCount: true, dt: RECOUNT_DAY, tm: '09:00', difference: -400 },     // recount — HURT badly
    ],
  },
  {
    loc: '6178', wrin: 'X900', descr: 'Cross-Store Test Item', itemClass: 'Food',
    history: [
      { isCount: true, dt: CLOSE_START, tm: '10:00', difference: -350 },    // session — real undercount
      { isCount: true, dt: RECOUNT_DAY, tm: '09:00', difference: -40 },      // recount — HELPED a lot
    ],
  },
];

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ data: null, error: null }) }) },
  loadQsrOnHand: async () => ONHAND,
  loadQsrFob: async () => FOB,
  loadEomPeriods: async () => [],
  loadEomCountStatus: async () => [],
  saveEomCountStatus: async () => ({}),
  loadQsrVarianceStat: async () => [],
  loadQsrVarianceHistory: async () => [],
  loadQsrVarianceHistoryAll: async () => [],
  loadQsrWaste: async () => [],
  loadQsrTransfers: async () => [],
  loadQsrRawItemDetail: async () => RAW_ITEM_DETAIL,
  loadQsrRawItemInfo: async () => [],
  loadEomDiagConfig: async () => null,
  saveEomDiagConfig: async () => ({}),
  triggerSync: async () => ({ ok: true }),
  saveEomItemDisposition: async () => ({}),
  loadEomItemDisposition: async () => [],
  loadSelfServeTowerLocs: async () => [],
  saveEomSnapshots: async () => ({}),
  loadEomSnapshots: async () => [],
  saveEomSecondaryReview: async () => ({}),
  loadEomSecondaryReview: async () => [],
  saveEomCountException: async () => ({}),
  deleteEomCountException: async () => ({}),
  loadEomCountExceptions: async () => ({}),
  createEomShareLink: async () => ({}),
  loadEbosMonthlyByStore: async () => ({}),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { EOMDashboardPanel } = await import('../views/eom-dashboard.js');

const STORES = [{ loc: '3708' }, { loc: '6178' }];

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function renderPanel(root) {
  await act(async () => {
    root.render(React.createElement(EOMDashboardPanel, { stores: STORES, ds: {}, settings: {}, onClose: () => {} }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

async function selectPeriod(container) {
  const sel = container.querySelector('select');
  expect(sel, 'period <select> not found').toBeTruthy();
  await act(async () => {
    sel.value = PERIOD;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

function clickTab(container, label) {
  const tab = [...container.querySelectorAll('button')].find(b => b.textContent === label);
  expect(tab, `"${label}" tab button not found`).toBeTruthy();
  return act(async () => { tab.click(); await Promise.resolve(); });
}

describe('cross-store recount consistency — real EOMDashboardPanel render', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('surfaces the cross-store inconsistency section when the same item helps at one store and hurts at another', async () => {
    await renderPanel(root);
    await selectPeriod(container);
    await clickTab(container, 'Recount Impact');
    const text = container.textContent;
    expect(text).toMatch(/Cross-Store Inconsistency/);
    expect(text).toMatch(/Cross-Store Test Item/);
    expect(text).toMatch(/X900/);
    expect(text).toMatch(/2 stores/);
    expect(text).toMatch(/1 helped/);
    expect(text).toMatch(/1 hurt/);
    // Both stores' names appear in the per-store breakdown chips.
    expect(text).toMatch(/Ardmore-Broadway/);
    expect(text).toMatch(/Chipley/);
    // Still shows the underlying flat table too — this is additive, not a replacement.
    expect(text).toMatch(/Recount-Impact Report/);
  });
});
