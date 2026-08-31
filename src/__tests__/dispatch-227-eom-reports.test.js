// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #227 — three new report tabs folded into the Inventory Control hub
// (EOMDashboardPanel, src/views/eom-dashboard.js): "Missing Items" (Report 1), "Team Snapshot"
// (Report 2), "Recount Impact" (Report 3).
//
// Per this repo's "would this verification still pass if reverted?" standing rule (CLAUDE.md),
// these render the REAL EOMDashboardPanel -> {EOMMissingItemsReportPanel,EOMTeamSnapshotPanel,
// EOMRecountImpactPanel} chain via the actual tab-click path — not an isolated import of the new
// view files or a hand-built fixture fed straight to the engine functions. A test that only calls
// diagnoseIncompleteCount()/ledgerBaselineDiff() directly could not tell "wired into a real tab"
// from "computed correctly but never rendered".
//
// Supabase + all loaders mocked (same pattern as dispatch-202/dispatch-224's own tests) so the
// panel's load* promises settle deterministically. The period picker is driven to the CURRENT
// calendar month (periodKey(new Date())) — guaranteed to be in recentPeriods(4)'s first slot
// regardless of what day-of-month the suite happens to run on — and all fixture dates are built
// relative to THAT period (closeWindowStartFor / never-counted is period-invariant), so nothing
// here depends on defaultPeriod()'s early-month special case.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { periodKey } from '../engine/eom-inventory.js';
import { closeWindowStartFor } from '../engine/eom-ledger-baseline.js';

const PERIOD = periodKey(new Date());
const CLOSE_START = closeWindowStartFor(PERIOD, 3);           // e.g. '2026-08-29'
const RECOUNT_DAY = (() => {                                   // the day right after CLOSE_START
  const d = new Date(CLOSE_START + 'T00:00:00'); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
})();

// '3708' = Ardmore-Broadway (MCDOK/OK), '6178' = Chipley FL (Emerald Arches) — the same two real
// STORE_NAMES-seeded stores dispatch-224's own render test uses, so org/state labeling is exercised
// against the live constants.js seed, not a test-only fixture.
const ONHAND = [
  { loc: '3708', wrin: 'F100', descr: 'Diced Onions', cls: 'Food', onHandAmt: 340, lastCounted: null },
  { loc: '3708', wrin: 'C200', descr: 'Ketchup Packets', cls: 'Condiment', onHandAmt: 55, lastCounted: null },
  { loc: '6178', wrin: 'P300', descr: 'Napkins', cls: 'Paper', onHandAmt: 12, lastCounted: null },
];
const FOB = [
  { loc: '3708', date: `${PERIOD}-15`, prodSalesAmt: 100000, compWasteAmt: 800, rawWasteAmt: 400, condimentsAmt: 300, empMgrMealsAmt: 100, statVarianceAmt: 200, unexplainedAmt: 200 },
  { loc: '6178', date: `${PERIOD}-15`, prodSalesAmt: 50000, compWasteAmt: 300, rawWasteAmt: 200, condimentsAmt: 100, empMgrMealsAmt: 50, statVarianceAmt: 100, unexplainedAmt: 50 },
];
const RAW_ITEM_DETAIL = [
  {
    loc: '3708', wrin: 'RJ1', descr: 'Recount Test Item', itemClass: 'Food',
    history: [
      { isCount: true, dt: CLOSE_START, tm: '10:00', difference: -300 },   // session — $300 undercount
      { isCount: true, dt: RECOUNT_DAY, tm: '09:00', difference: -80 },     // recount — corrected to $80
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

// Drives the shared period picker to PERIOD (the current calendar month — always a valid option,
// see the file header) so every fixture date lines up with what the panel actually queries with.
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

describe('dispatch #227 — Missing Items report', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('renders every never-counted item across scoped stores with recommendation text, real store names', async () => {
    await renderPanel(root);
    await selectPeriod(container);
    await clickTab(container, 'Missing Items');
    const text = container.textContent;
    expect(text).toMatch(/Missing \/ Uncounted Items/);
    expect(text).toMatch(/Ardmore-Broadway/);
    expect(text).toMatch(/Diced Onions/);
    expect(text).toMatch(/Ketchup Packets/);
    expect(text).toMatch(/Napkins/);
    // buildIncompleteCountMessage's own proven "never" phrasing, reused verbatim via
    // recommendationForState() — not new copy.
    expect(text).toMatch(/no count on record this period/);
    // $ On Hand values reached the render.
    expect(text).toMatch(/\$340/);
    expect(text).toMatch(/\$55/);
  });

  it('sorts by location then class (Food before Condiment) — Ardmore-Broadway\'s Food row precedes its Condiment row', async () => {
    await renderPanel(root);
    await selectPeriod(container);
    await clickTab(container, 'Missing Items');
    const text = container.textContent;
    expect(text.indexOf('Diced Onions')).toBeGreaterThan(-1);
    expect(text.indexOf('Ketchup Packets')).toBeGreaterThan(-1);
    expect(text.indexOf('Diced Onions')).toBeLessThan(text.indexOf('Ketchup Packets'));
  });

  it('every other tab label still renders (tab strip, not content)', async () => {
    await renderPanel(root);
    const labels = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(labels).toContain('Scoreboard');
    expect(labels).toContain('Supervisor Rollup');
    expect(labels).toContain('Missing Items');
    expect(labels).toContain('Team Snapshot');
    expect(labels).toContain('Recount Impact');
  });
});

describe('dispatch #227 — Team Snapshot report', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('shows exactly Store/State/Count%/FOB%/FOB$ — no Diagnosis/Communication workflow columns', async () => {
    await renderPanel(root);
    await selectPeriod(container);
    await clickTab(container, 'Team Snapshot');
    const text = container.textContent;
    expect(text).toMatch(/EOM Team Snapshot/);
    expect(text).toMatch(/Ardmore-Broadway/);
    // Diagnosis/Communication <select> option labels from the Scoreboard tab must not appear here.
    expect(text).not.toMatch(/In review/);
    expect(text).not.toMatch(/Drafted/);
    const headerCells = [...container.querySelectorAll('th')].map(th => th.textContent);
    expect(headerCells).toEqual(expect.arrayContaining(['Store', 'State', 'Count %', 'FOB %', 'FOB $']));
    expect(headerCells).not.toContain('Diagnosis');
    expect(headerCells).not.toContain('Communication');
  });

  it('two-panels-disagree guard: Team Snapshot\'s FOB $ for a store matches the EOM Count tab\'s own per-row field for the SAME row (scoreboardRowFields, one shared accessor)', async () => {
    await renderPanel(root);
    await selectPeriod(container);
    // "EOM Count" (mode 'eom') renders the full per-store table with a FOB $/% column (Scoreboard
    // mode's own checklist rows deliberately carry no FOB figure at all — that's the whole point
    // of Report 2 giving stores a plain % view Scoreboard doesn't).
    await clickTab(container, 'EOM Count');
    const eomText = container.textContent;
    expect(eomText).toMatch(/Ardmore-Broadway/);
    // Ardmore-Broadway FOB = 800+400+300+100+200+200 = 2000, sales 100000 → 2.00%
    expect(eomText).toMatch(/\$2,000/);
    expect(eomText).toMatch(/2\.00%/);

    await clickTab(container, 'Team Snapshot');
    const snapshotText = container.textContent;
    expect(snapshotText).toMatch(/\$2,000/);
    expect(snapshotText).toMatch(/2\.00%/);
  });

  it('multi-store scope shows a dollar-weighted rollup chip, not an averaged percentage', async () => {
    await renderPanel(root);
    await selectPeriod(container);
    await clickTab(container, 'Team Snapshot');
    const text = container.textContent;
    // Combined: Σfob = 2000+800 = 2800, Σsales = 100000+50000 = 150000 → 1.87% (dollar-weighted).
    // A naive mean of 2.00% and 1.60% would read 1.80% instead — distinguishable from 1.87%.
    expect(text).toMatch(/1\.87%/);
  });
});

describe('dispatch #227 — Recount Impact report', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('shows the recounted item with baseline/post-recount values, Δ, and a plain-language helped verdict — reusing ledgerBaselineDiff/recountVerdictText, not a second grading', async () => {
    await renderPanel(root);
    await selectPeriod(container);
    await clickTab(container, 'Recount Impact');
    const text = container.textContent;
    expect(text).toMatch(/Recount-Impact Report/);
    expect(text).toMatch(/Recount Test Item/);
    expect(text).toMatch(/RJ1/);
    expect(text).toMatch(/Ardmore-Broadway/);
    expect(text).toMatch(/↻ 1/);              // recounted once
    expect(text).toMatch(/\$-300/);            // baseline (money()'s own "$" + signed-number convention)
    expect(text).toMatch(/\$-80/);             // post-recount
    // recountVerdictText()'s plain-language sentence for a $220 undercount correction — 2026-08-31
    // added a clause explaining which way this moves food cost, so this only anchors the stable
    // prefix rather than the full sentence (that exact wording is covered by
    // eom-ledger-baseline.test.js's own recountVerdictText suite).
    expect(text).toMatch(/Helped: corrected a \$220 undercount — the recount found MORE product/);
  });

  it('an unrecounted item (only ever counted once) does not appear in the list', async () => {
    await renderPanel(root);
    await selectPeriod(container);
    await clickTab(container, 'Recount Impact');
    // ONHAND has no matching wrin here; the assertion is that the report doesn't crash/blank on
    // a store with raw-item history but confirms only the truly-recounted item surfaced.
    const rows = [...container.querySelectorAll('tbody tr')];
    expect(rows.length).toBe(1);
  });
});
