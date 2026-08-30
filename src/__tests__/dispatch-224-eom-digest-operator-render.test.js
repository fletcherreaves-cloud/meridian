// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #224 Task 5 — the Operator tab + per-store FOB+components table / recount-opportunities
// list, exercised through the REAL EOMDashboardPanel -> "📧 Generate Report" -> EOM Digest modal
// chain, not an isolated helper. Per this repo's "would this verification still pass if reverted?"
// rule (CLAUDE.md): buildEomDigest()'s new 'operator' level, digestStoreRows' new operator/
// recountItems fields, and the modal's new levelTab/storeRow rendering ALL have to be wired
// correctly for these assertions to pass — reverting any one link breaks something here, unlike a
// test that only calls buildEomDigest() directly with a hand-built fixture.
//
// Harness copied from dispatch-217-eom-digest-settings-ui.test.js (same mock-module list, same
// openDigestModal helper) — see that file's own header for why the render approach was chosen.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// '3708' = Ardmore-Broadway, a real DEF_SETTINGS.operators-seeded MCDOK store under Ryan Thorley.
// '6178' = Chipley FL, a real DEF_SETTINGS.operators-seeded Emerald Arches store under Jacob
// Thorley. No live operator override is set anywhere in this file — the Operator tab groups on
// the real constants.js seed, proving Task 1-3's plumbing end to end, not a test fixture's own map.
vi.mock('../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ data: null, error: null }) }) },
  loadQsrOnHand: async () => ([
    { loc: '3708', wrin: 'F1', descr: 'Food Item Never Counted', cls: 'Food', onHandAmt: 10, active: true, lastCounted: null },
    { loc: '6178', wrin: 'F2', descr: 'Condiment Item Never Counted', cls: 'Condiment', onHandAmt: 25, active: true, lastCounted: null },
  ]),
  loadQsrFob: async () => [],
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
  loadEomDigestConfig: async () => ({ levels: ['district', 'patch'], sendHourUtc: 23 }),
  saveEomDigestConfig: async () => ({ saved: true }),
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

async function openDigestModal(container) {
  const reportsBtn = [...container.querySelectorAll('button')].find(b => b.textContent.startsWith('Reports'));
  expect(reportsBtn, 'Reports▾ action menu button not found').toBeTruthy();
  await act(async () => { reportsBtn.click(); });
  const genBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '📧 Generate Report');
  expect(genBtn, '📧 Generate Report item not found (rows.length was probably 0)').toBeTruthy();
  await act(async () => { genBtn.click(); await Promise.resolve(); await Promise.resolve(); });
}

describe('dispatch #224 Task 5 — EOM Digest modal: Operator tab + per-store detail', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('renders a 4th "Operator" level tab alongside District/Patch/Market', async () => {
    await renderPanel(root);
    await openDigestModal(container);
    const tabLabels = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(tabLabels).toContain('District');
    expect(tabLabels).toContain('Patch');
    expect(tabLabels).toContain('Market');
    expect(tabLabels).toContain('Operator');
  });

  it('renders a 4th "Operator" checkbox in the ⚙️ Scheduled send row', async () => {
    await renderPanel(root);
    await openDigestModal(container);
    const boxLabels = [...container.querySelectorAll('input[type="checkbox"]')].map(b => b.closest('label').textContent);
    expect(boxLabels).toEqual(['District', 'Patch', 'Market', 'Operator']);
  });

  it('clicking Operator groups the real stores by their LIVE operatorOf() — two different operators produce two different group cards', async () => {
    await renderPanel(root);
    await openDigestModal(container);
    const opTab = [...container.querySelectorAll('button')].find(b => b.textContent === 'Operator');
    await act(async () => { opTab.click(); });
    const text = container.textContent;
    expect(text).toMatch(/Ryan Thorley/);   // owns 3708 in the real DEF_SETTINGS.operators seed
    expect(text).toMatch(/Jacob Thorley/);  // owns 6178 in the real DEF_SETTINGS.operators seed
  });

  it('expanding a store shows its real recount-opportunities list (WRIN/Description/Class/$ at risk) — proves recountItems reached the actual render, not just buildEomDigest()\'s own output', async () => {
    await renderPanel(root);
    await openDigestModal(container);
    const opTab = [...container.querySelectorAll('button')].find(b => b.textContent === 'Operator');
    await act(async () => { opTab.click(); });

    // Ardmore-Broadway (3708, STORE_NAMES) is the collapsed store row's visible label. The
    // clickable div is nested inside a non-clickable wrapper div with the SAME textContent while
    // collapsed (both start with '▸' and contain the store name), so picking the FIRST match finds
    // the wrapper, not the element with the onClick handler — pick the INNERMOST match instead
    // (the one that contains no other candidate).
    const candidates = [...container.querySelectorAll('div')].filter(d =>
      d.textContent.includes('Ardmore-Broadway') && d.textContent.trim().startsWith('▸'));
    const storeToggle = candidates.find(d => !candidates.some(other => other !== d && d.contains(other)));
    expect(storeToggle, 'collapsed store row for Ardmore-Broadway not found').toBeTruthy();
    await act(async () => { storeToggle.click(); });

    const text = container.textContent;
    expect(text).toMatch(/Recount opportunities \(1\)/);
    expect(text).toMatch(/F1/);
    expect(text).toMatch(/Food Item Never Counted/);
    expect(text).toMatch(/\$10/); // valueAtRisk = onHandAmt = 10
  });

  it('a store with no fresh FOB data shows the explicit "no fresh FOB data" line, never a blank/silent section', async () => {
    await renderPanel(root);
    await openDigestModal(container);
    const opTab = [...container.querySelectorAll('button')].find(b => b.textContent === 'Operator');
    await act(async () => { opTab.click(); });
    const candidates = [...container.querySelectorAll('div')].filter(d =>
      d.textContent.includes('Ardmore-Broadway') && d.textContent.trim().startsWith('▸'));
    const storeToggle = candidates.find(d => !candidates.some(other => other !== d && d.contains(other)));
    expect(storeToggle, 'collapsed store row for Ardmore-Broadway not found').toBeTruthy();
    await act(async () => { storeToggle.click(); });
    expect(container.textContent).toMatch(/No fresh FOB data for this store this period/);
  });
});
