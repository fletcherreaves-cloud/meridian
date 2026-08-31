// @vitest-environment happy-dom
// @ts-nocheck
// 2026-08-31 (owner req, verbatim): "take all the items that where lost during the month, which
// little hope of recovering by a recount at eom... show a total +/- variance dollar amount for
// clarity and how it played into eom results... I would also like to see this as a report tab too
// in the main panel Inventory Control." Then, expanded: "I really want to see the total derived
// +/- across any item that took a swing in a inter-month count... what they were and when it
// happened along with if a recount took place at the time or not and who the counting manager
// was."
//
// Per this repo's "would this verification still pass if reverted?" standing rule, this renders
// the REAL EOMDashboardPanel -> EOMSwingLedgerReportPanel chain via the actual tab-click path, not
// an isolated call into storeSwingLedger() — a test that only calls the engine function directly
// could not tell "computed correctly" from "computed correctly but never wired into the panel".
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { periodKey } from '../engine/eom-inventory.js';

const PERIOD = periodKey(new Date());

// Owner's own example scaled to one store: nuggets lost mid-month (locked, no later count),
// beef lost a week ago (locked), mcchicken gained week 1 then recounted week 4 (recovered + final).
const RAW_ITEM_DETAIL = [
  {
    loc: '3708', wrin: 'NUG', descr: 'Chicken McNuggets', itemClass: 'Food',
    history: [{ isCount: true, dt: `${PERIOD}-10`, tm: '09:00', difference: -560, variance: -80, manager: 'Lynsey Y - eo975737' }],
  },
  {
    loc: '3708', wrin: 'BEEF', descr: '4:1 Beef Patties', itemClass: 'Food',
    history: [{ isCount: true, dt: `${PERIOD}-24`, tm: '09:00', difference: -140, variance: -100, manager: 'Thorley E - e7568273' }],
  },
  // Owner's own product-reconstruction example: missing beef + buns + cheese in a ratio that
  // matches a real Cheeseburger recipe (tight fit — all three imply ~100) — reuses the same
  // engine-level fixture from eom-item-journey.test.js's reconstructMissingProducts() tests, this
  // time through the real panel.
  {
    loc: '3708', wrin: 'BUN', descr: 'Regular Bun', itemClass: 'Food',
    history: [{ isCount: true, dt: `${PERIOD}-11`, tm: '09:00', difference: -30, variance: -100, manager: 'Priscila N' }],
  },
  {
    loc: '3708', wrin: 'CHEESE', descr: 'Cheese Slice', itemClass: 'Food',
    history: [{ isCount: true, dt: `${PERIOD}-12`, tm: '09:00', difference: -30, variance: -100, manager: 'Priscila N' }],
  },
];
// qsr_raw_item_info (dispatch #184) — caseSz (case_qty) is NOT on qsr_raw_item_detail at all
// (2026-08-31 finding); it lives here, per (loc, wrin), merged into rawByLoc by eom-dashboard.js's
// rawInfoByLoc. Also the recipe data (menuItems[]) the product-reconstruction section reads.
const RAW_ITEM_INFO = [
  { loc: '3708', wrin: 'NUG', caseQty: 40, menuItems: [] },
  { loc: '3708', wrin: 'BEEF', caseQty: 100, menuItems: [
    { item_number: 7, description: 'Cheeseburger', recipe_serving_factor: 1, on_pos: 'Y' },
  ] },
  { loc: '3708', wrin: 'BUN', caseQty: 200, menuItems: [
    { item_number: 7, description: 'Cheeseburger', recipe_serving_factor: 1, on_pos: 'Y' },
  ] },
  { loc: '3708', wrin: 'CHEESE', caseQty: 200, menuItems: [
    { item_number: 7, description: 'Cheeseburger', recipe_serving_factor: 1, on_pos: 'Y' },
  ] },
];
const ONHAND = [
  { loc: '3708', wrin: 'NUG', descr: 'Chicken McNuggets', cls: 'Food', onHandAmt: 10, lastCounted: `${PERIOD}-10` },
  { loc: '3708', wrin: 'BEEF', descr: '4:1 Beef Patties', cls: 'Food', onHandAmt: 10, lastCounted: `${PERIOD}-24` },
];
const FOB = [
  { loc: '3708', date: `${PERIOD}-15`, prodSalesAmt: 100000, compWasteAmt: 800, rawWasteAmt: 400, condimentsAmt: 300, empMgrMealsAmt: 100, statVarianceAmt: 200, unexplainedAmt: 200 },
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
  loadQsrRawItemInfo: async () => RAW_ITEM_INFO,
  // Real POS sales for item 7 (Cheeseburger) — plenty sold, so the reconstruction candidate this
  // fixture already produces (2026-08-31 follow-up: plausibility re-ranking) comes back plausible,
  // proving the loader → engine → render wiring end to end, not just the engine unit tests.
  loadPmixSalesByItems: async () => ({ '3708:7': 500 }),
  loadEomDiagConfig: async () => null,
  saveEomDiagConfig: async () => ({}),
  triggerSync: async () => ({ ok: true }),
  saveEomItemDisposition: async () => ({}),
  loadEomItemDisposition: async () => [],
  loadSelfServeTowerLocs: async () => new Set(),
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

const STORES = [{ loc: '3708' }];

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

function clickTab(container, label) {
  const tab = [...container.querySelectorAll('button')].find(b => b.textContent === label);
  expect(tab, `"${label}" tab button not found`).toBeTruthy();
  return act(async () => { tab.click(); await Promise.resolve(); });
}

describe('Count-Swing Ledger report tab — real EOMDashboardPanel render', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('surfaces both locked real-loss swings, manager attribution, and the net total', async () => {
    await renderPanel(root);
    await clickTab(container, 'Count Swings');
    const text = container.textContent;

    expect(text).toMatch(/Count-Swing Ledger/);
    expect(text).toMatch(/Chicken McNuggets/);
    expect(text).toMatch(/4:1 Beef Patties/);
    // Manager attribution (owner: "who the counting manager was").
    expect(text).toMatch(/Lynsey Y/);
    expect(text).toMatch(/Thorley E/);
    // Both swings are each item's only/final count, before the close window — locked real losses.
    // (4, not 2 — this fixture also carries the BUN/CHEESE shortages the reconstruction test below
    // reuses; all four are single, pre-window counts, so all four are locked.)
    expect(text).toMatch(/Locked/);
    expect(text).toMatch(/4 locked real loss/);
    // Case-formatted quantities (owner: cases, 2 decimals) — 80 units / 40 case size = 2.00 cs.
    expect(text).toMatch(/2\.00 cs/);
    // Net total (owner: "show a total +/- variance dollar amount") — -560 -140 -30 -30.
    expect(text).toMatch(/-\$760|−\$760/);
  });

  // 2026-08-31 (owner req, verbatim): "if i was missing 100 pieces of fresh beef and 110 regular
  // buns and 98 slices of cheese, i would envision that as either 100 cheeseburgers or 50
  // McDoubles possibly unaccounted for." Real render, not just the engine-level unit test in
  // eom-item-journey.test.js — proves reconstructMissingProducts() is actually wired through
  // eom-dashboard.js's rawInfoByLoc into the report, not just computed correctly in isolation.
  it('surfaces the product-reconstruction section — beef+bun+cheese shortages imply Cheeseburgers', async () => {
    await renderPanel(root);
    await clickTab(container, 'Count Swings');
    // Extra flush for the plausibility-re-ranking effect (2026-08-31 follow-up): it fires only
    // AFTER the first-pass candidate list exists (itself downstream of rawDetail/rawInfo loading),
    // so its own loadPmixSalesByItems round-trip is a third async hop beyond what renderPanel's
    // own tick count was tuned for.
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    const text = container.textContent;

    expect(text).toMatch(/Possible product reconstruction/);
    expect(text).toMatch(/Cheeseburger/);
    expect(text).toMatch(/tight fit/i);
    expect(text).toMatch(/3 ingredients agree/);
    // Real-sales plausibility badge (2026-08-31 follow-up) — the mock's 500 real sales for item 7
    // makes this candidate plausible, proving loadPmixSalesByItems is actually wired through, not
    // just present in the engine's own unit tests.
    expect(text).toMatch(/500 sold recently/);
  });
});
