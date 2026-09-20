// @vitest-environment happy-dom
// @ts-nocheck
// Backlog survey (2026-09-20): §6 "Remaining EOM list" -- "wire monthly_targets into
// fob-components + variance threshold." Verified live: eom-diagnosis.js's 'fob-components' check
// (the FIRST check in DEFAULT_CHECKS, order:10) reads `ctx.data.targets` and only fires a finding
// when a target key is present -- but eom-dashboard.js's buildDiagResult() (the ONLY thing that
// feeds runDiagnosis() in production, via both the 🔬 Diagnose modal and the Draft/message flow)
// never included a `targets` key in its `data` object at all. So this check has never fired for
// any store, ever, despite dispatch #176 already fixing its key-name mapping to match
// FOB_COMPONENTS. diagOptsFor() (same file) already builds the exact right `tg` object for the
// report NARRATIVE text -- this reuses that same tg-building pattern, feeding it into
// buildDiagResult's `data.targets` instead of inventing a new one.
//
// Per "would this verification still pass if reverted?": this opens the REAL 🔬 Diagnose modal
// via the actual button click path (not a direct runDiagnosis()/eom-diagnosis.js unit test, which
// would pass even with the wiring bug since it can hand-supply `targets` itself) and asserts the
// FOB-components finding text renders in both the report body and the action-items list. Store
// 3708's real DEFAULT_TARGETS (constants.js) has tCompWaste:0.002 -- the mocked FOB row below
// gives it a 0.8% actual Completed-Waste rate, 0.6pp over target (over the check's 0.25pp band),
// so "Completed Waste over target" should appear. Before this fix it never did, for any store.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { periodKey } from '../engine/eom-inventory.js';

const PERIOD = periodKey(new Date());

const FOB = [
  { loc: '3708', date: `${PERIOD}-15`, prodSalesAmt: 100000, compWasteAmt: 800, rawWasteAmt: 400, condimentsAmt: 300, empMgrMealsAmt: 100, statVarianceAmt: 200, unexplainedAmt: 200 },
];

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ data: null, error: null }) }) },
  loadQsrOnHand: async () => [],
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
    root.render(React.createElement(EOMDashboardPanel, { stores: STORES, ds: {}, settings: {}, onClose: () => {} }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

describe('EOM Diagnose modal -- fob-components check now actually fires against real targets', () => {
  let container, root;
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('opening the real 🔬/📋 Diagnose report for a store with an over-target FOB component shows the finding', async () => {
    ({ container, root } = mountRoot());
    await renderPanel(root);

    // Default mode here (today's date is outside the last-3-days EOM close window that would
    // switch this panel to Scoreboard) is the year-round "EOM Count" table, whose "🔬 Diagnose"
    // button calls the SAME openDiag()->buildDiagResult() path as Scoreboard's "📋 Report" button.
    // Not actually disabled: r.components.sales is truthy from the mocked FOB row even though
    // hasDiagData (variance/waste/transfers) is empty -- disabled only requires ONE of the two.
    const diagBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🔬 Diagnose');
    expect(diagBtn, '"🔬 Diagnose" button not found — check the EOM Count row rendered').toBeTruthy();
    expect(diagBtn.disabled, 'Diagnose button unexpectedly disabled').toBe(false);
    await act(async () => { diagBtn.click(); await Promise.resolve(); });

    expect(container.textContent).toMatch(/Food-Cost Diagnosis/);
    // The actual bug: this text never appeared anywhere in the report or action-items list before
    // buildDiagResult() carried a `targets` key, no matter how far over target a component ran.
    expect(container.textContent).toMatch(/Completed Waste over target/);
  });
});
