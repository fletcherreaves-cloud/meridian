// @vitest-environment happy-dom
// @ts-nocheck
// Owner req (2026-10-12): "keep the checklist monthly, add a separate weekly view -- FOB%/
// count% trend and simple count completed satisfactorily or not. Just a way to have similar
// dashboard for daily and weekly." The existing Scoreboard mode's monthly review/comms-sent
// checklist is a once-a-month workflow and stays exactly as-is; a new Monthly/Weekly/Daily
// toggle swaps in a separate, simpler view (GranularityScoreboard, eom-dashboard.js) for the
// other two. These tests render the REAL EOMDashboardPanel and click the real toggle buttons.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { periodKey } from '../engine/eom-inventory.js';

const PERIOD = periodKey(new Date());
const today = new Date().toISOString().slice(0, 10);

const ONHAND = [
  { loc: '3708', wrin: 'F1', descr: 'Fries', cls: 'Food', active: true, lastCounted: today },
  { loc: '3708', wrin: 'C1', descr: 'Ketchup', cls: 'Condiment', active: true, lastCounted: today },
];
const FOB = [
  { loc: '3708', date: `${PERIOD}-01`, prodSalesAmt: 10000, compWasteAmt: 300, rawWasteAmt: 0, condimentsAmt: 0, empMgrMealsAmt: 0, statVarianceAmt: 0, unexplainedAmt: 0 },
  { loc: '3708', date: `${PERIOD}-02`, prodSalesAmt: 20000, compWasteAmt: 500, rawWasteAmt: 0, condimentsAmt: 0, empMgrMealsAmt: 0, statVarianceAmt: 0, unexplainedAmt: 0 },
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
  loadQsrRawItemDetail: async () => [],
  loadQsrRawItemInfo: async () => [],
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
    root.render(React.createElement(EOMDashboardPanel, { stores: STORES, ds: {}, settings: {}, onClose: () => {}, initialMode: 'scoreboard' }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}
function clickButton(container, label) {
  const btn = [...container.querySelectorAll('button')].find(b => b.textContent === label);
  expect(btn, `"${label}" button not found`).toBeTruthy();
  return act(async () => { btn.click(); await Promise.resolve(); });
}

describe('Scoreboard granularity toggle (dispatch 2026-10-12)', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('defaults to Monthly -- the existing checklist, unchanged', async () => {
    await renderPanel(root);
    expect(container.textContent).toMatch(/Not started/);
    expect(container.textContent).toMatch(/Ready for you/);
  });

  it('Weekly swaps in the FOB%/count-status view and hides the monthly checklist', async () => {
    await renderPanel(root);
    await clickButton(container, 'Weekly');
    expect(container.textContent).not.toMatch(/Ready for you/);
    expect(container.textContent).toMatch(/This week/);
    expect(container.textContent).toMatch(/FOB% trend/);
  });

  it('Daily swaps in the same view with a "Today" column instead of "This week"', async () => {
    await renderPanel(root);
    await clickButton(container, 'Daily');
    expect(container.textContent).not.toMatch(/Ready for you/);
    expect(container.textContent).toMatch(/Today/);
    expect(container.textContent).toMatch(/counted today/i);
  });

  it('switching back to Monthly restores the checklist', async () => {
    await renderPanel(root);
    await clickButton(container, 'Weekly');
    await clickButton(container, 'Monthly');
    expect(container.textContent).toMatch(/Ready for you/);
  });

  it('a store with a full weekly count today reads "Complete" in the Weekly view', async () => {
    await renderPanel(root);
    await clickButton(container, 'Weekly');
    expect(container.textContent).toMatch(/Complete/);
  });
});
