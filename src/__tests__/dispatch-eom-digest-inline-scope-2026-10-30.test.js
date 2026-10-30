// @vitest-environment happy-dom
// @ts-nocheck
// Owner req (2026-10-30): after being shown how to narrow to one store via the main panel's
// shared LocationSelector, asked "oh, you mean on the main screen. Can we include that in the
// pop up window?" -- the EOM Digest modal had level tabs (District/Patch/Market/Operator/Store)
// but nothing to pick WHICH location(s) are in scope; that lived only on the main panel behind
// the modal, invisible once the modal was open.
//
// Exercises the fix through the REAL EOMDashboardPanel -> "📧 Generate Report" -> EOM Digest
// modal chain: a second LocationSelector instance now renders inside the modal, driven by the
// SAME scope/patch/oneStore state (locSelValue/onLocSelChange) the main panel's own copy already
// uses -- no separate state, so picking a store in the modal immediately re-scopes the digest
// live, without closing it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ data: null, error: null }) }) },
  loadQsrOnHand: async () => ([
    { loc: '3708', wrin: 'F1', descr: 'Food Item Never Counted', cls: 'Food', onHandAmt: 10, active: true, lastCounted: null },
    { loc: '6178', wrin: 'F2', descr: 'Condiment Item Never Counted', cls: 'Condiment', onHandAmt: 25, active: true, lastCounted: null },
  ]),
  loadQsrFob: async () => [],
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

// '3708' = Ardmore-Broadway (MCDOK), '6178' = Chipley FL (Emerald Arches).
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
  expect(genBtn, '📧 Generate Report item not found').toBeTruthy();
  await act(async () => { genBtn.click(); await Promise.resolve(); await Promise.resolve(); });
}

// ModalShell renders inline (no portal), so the main panel's OWN LocationSelector is still in the
// DOM behind it -- a bare container-wide button query would find that copy, not the modal's.
// Scope to the fixed-position backdrop whose card contains the modal's own title text.
function modalCard(container) {
  const backdrop = [...document.querySelectorAll('div')].find(d => d.style.position === 'fixed' && d.textContent.includes('EOM Digest —'));
  expect(backdrop, 'EOM Digest modal backdrop not found').toBeTruthy();
  return backdrop;
}

describe('EOM Digest modal — inline Scope selector (owner req 2026-10-30)', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('renders a "Scope" location selector inside the modal, All Locations active by default', async () => {
    await renderPanel(root);
    await openDigestModal(container);
    const card = modalCard(container);
    expect(card.textContent).toContain('Scope');
    const allBtn = [...card.querySelectorAll('button')].find(b => b.textContent === 'All Locations');
    expect(allBtn, 'All Locations pill not found inside the modal').toBeTruthy();
  });

  it('picking a store inside the modal\'s own selector narrows the Store-level digest to just that store, live, without closing the modal', async () => {
    await renderPanel(root);
    await openDigestModal(container);
    const card = modalCard(container);

    const storeTab = [...card.querySelectorAll('button')].find(b => b.textContent === 'Store');
    await act(async () => { storeTab.click(); });
    expect(card.textContent).toMatch(/Email 2 groups/);

    // Drill State -> Patch -> Store via the modal's own pills (progressive mode: All Locations ->
    // states appear -> picking a state reveals its patch(es) -> picking a patch reveals its
    // stores). Store 3708's live supervisor is Zukarr Eaves (constants.js supervisorGroups seed).
    const okStateBtn = [...card.querySelectorAll('button')].find(b => b.textContent === 'OK');
    expect(okStateBtn, 'OK state pill not found').toBeTruthy();
    await act(async () => { okStateBtn.click(); });
    const patchBtn = [...card.querySelectorAll('button')].find(b => b.textContent === 'Zukarr Eaves');
    expect(patchBtn, 'Zukarr Eaves patch pill not found after narrowing to OK').toBeTruthy();
    await act(async () => { patchBtn.click(); });
    const storeBtn = [...card.querySelectorAll('button')].find(b => b.textContent.startsWith('3708'));
    expect(storeBtn, '3708 store pill not found after narrowing to OK/Zukarr Eaves').toBeTruthy();
    await act(async () => { storeBtn.click(); });

    expect(card.textContent).toContain('📧 Email 1 group');
    expect(card.textContent).not.toContain('Chipley');
  });

  it('the modal stays open the whole time — the modal title is never interrupted by a close/reopen', async () => {
    await renderPanel(root);
    await openDigestModal(container);
    const card = modalCard(container);
    const okStateBtn = [...card.querySelectorAll('button')].find(b => b.textContent === 'OK');
    await act(async () => { okStateBtn.click(); });
    // Still the same modal instance -- ModalShell's own onClose was never called.
    expect(modalCard(container).textContent).toContain('EOM Digest —');
  });
});
