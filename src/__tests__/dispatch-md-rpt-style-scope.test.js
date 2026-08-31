// @vitest-environment happy-dom
// @ts-nocheck
// 2026-08-31 — owner reported the Decision Guide table's grid lines were STILL missing under
// Draft > Store Message > Full Report, even after the --bdr2 color fix (which targeted the
// Diagnose modal's own .md-rpt CSS). Root cause: the <style> tag defining .md-rpt's table/th/td
// border rules lived INSIDE the Diagnose modal's own JSX (`diag && h(ModalShell, ...)`), so it
// only existed in the DOM while that modal happened to be mounted. The Draft/Store-Message modal
// (`draft && h(ModalShell, ...)`) uses the SAME className for its own markdown body but is a
// separate, mutually-exclusive modal -- so its table never had these rules at all, colors
// included, no matter what the Diagnose modal's copy said.
//
// Per this repo's "would this verification still pass if reverted?" standing rule, this opens the
// REAL Draft modal via the actual button click path with the Diagnose modal never opened, and
// asserts the .md-rpt table border rule is present in the DOM anyway -- a test that only checked
// the CSS text in isolation (or only opened the Diagnose modal) would have passed on the broken
// code, exactly like the bug this dispatch found.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { periodKey } from '../engine/eom-inventory.js';

const PERIOD = periodKey(new Date());

const ONHAND = [
  { loc: '3708', wrin: 'X900', descr: 'Fried Apple Pie', cls: 'Food', onHandAmt: 30.58, lastCounted: `${PERIOD}-13` },
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
  loadQsrRawItemDetail: async () => [],
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

describe('.md-rpt table-border CSS is present when only the Draft/Store-Message modal is open (not just Diagnose)', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('opening ONLY the Draft modal (Diagnose never opened) still gets the .md-rpt table border rule in the DOM', async () => {
    await renderPanel(root);
    // Default mode is Scoreboard (we're in the EOM close window) — it renders a compact
    // tally-card view with no "✉️ Draft" button. That button lives in the full per-store table,
    // shared by the 'eom'/'progress' modes (everything except 'scoreboard'/'compliance'/
    // 'supervisor'/the 3 report tabs) — switch to EOM Count to reach it.
    await clickTab(container, 'EOM Count');

    const draftBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Draft') && b.title?.includes('Draft a store message'));
    expect(draftBtn, '"✉️ Draft" button not found — check the Scoreboard row rendered').toBeTruthy();
    await act(async () => { draftBtn.click(); await Promise.resolve(); });

    // The Draft/Store-Message modal is open; the Diagnose modal was never opened this test.
    expect(container.textContent).toMatch(/Store message/);
    expect(container.querySelector('.md-rpt')).toBeTruthy();

    // The actual bug: this rule used to live ONLY inside the (unopened) Diagnose modal's JSX.
    const styleText = [...container.querySelectorAll('style')].map(s => s.textContent).join('\n');
    expect(styleText).toMatch(/\.md-rpt table\{[^}]*border:1px solid var\(--bdr2\)/);
    expect(styleText).toMatch(/\.md-rpt td\{[^}]*border:1px solid var\(--bdr2\)/);
  });
});
