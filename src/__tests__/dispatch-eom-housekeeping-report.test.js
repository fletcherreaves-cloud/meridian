// @vitest-environment happy-dom
// @ts-nocheck
// 2026-08-31 (owner req) — the EOM Store Message "Full report" used to include an itemized
// Obsolete/Discontinued/Inactive verify-and-clear table (owner's own example of "routine
// maintenance" that never changes this month's FOB number). Owner feedback: the Full report is
// legitimately dense but every OTHER section ties back to this or next cycle's food cost; this
// one section is the sole exception, so it moves to its own "🧹 Housekeeping" view instead of
// being trimmed or hidden outright. Named "Housekeeping" (not "Follow-Up") to avoid colliding
// with the pre-existing "📣 EOM Follow-up" bulk-messaging modal in this same panel.
//
// Per this repo's "would this verification still pass if reverted?" standing rule (CLAUDE.md),
// this renders the REAL EOMDashboardPanel -> real "✉️ Draft" click -> real Store message modal
// -> real view-toggle clicks (mirrors dispatch-228-eom-dashboard-resend-button.test.js's own
// established pattern/mock list for this exact file), not an isolated call to
// formatDiagnosisReport(). A revert of either the engine split (eom-diagnosis.js) or the UI
// wiring (eom-dashboard.js's computeDraft/bodyForDraftView/draftView toggle) fails this.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ data: null, error: null }) }) },
  loadQsrOnHand: async () => ([
    { loc: '3708', wrin: 'F1', descr: 'Food Item', cls: 'Food', onHandAmt: 10, active: true, lastCounted: null },
    // Confirmed deactivated (active:false) with a real residual -> diagnoseIncompleteCount()
    // routes it to state:'stale' regardless of date (see eom-inventory.js's own comment) -- the
    // Obsolete/Discontinued/Inactive bucket this test is exercising.
    { loc: '3708', wrin: 'OLD1', descr: 'Old Discontinued Syrup', cls: 'Food', onHandAmt: 42, totalUnits: 5, active: false, lastCounted: '2020-01-15' },
  ]),
  loadQsrFob: async () => [],
  loadEomPeriods: async () => [],
  loadEomCountStatus: async () => [],
  saveEomCountStatus: async () => ({}),
  // A single row is enough to put '3708' in hasDiagData (varByLoc) so computeDraft() actually
  // runs the diagnosis engine and produces a real fullBody/followupBody, not the plain-recount
  // fallback (which never contains either). dolDiff must clear the $50 materiality floor
  // (formatDiagnosisReport's own threshold default) -- otherwise V is empty and the WHOLE Count
  // Integrity section (to-count table, early items, the Housekeeping pointer line) never renders
  // at all, a pre-existing "clean count" early-return unrelated to this test's own change.
  loadQsrVarianceStat: async () => ([{ loc: '3708', wrin: 'V1', descr: 'Variance Item', cls: 'Food', dolDiff: -60, variance: 1 }]),
  loadQsrVarianceHistory: async () => [],
  loadQsrVarianceHistoryAll: async () => [],
  loadQsrWaste: async () => [],
  loadQsrTransfers: async () => [],
  loadQsrRawItemDetail: async () => [],
  loadQsrRawItemInfo: async () => [],
  loadEomDiagConfig: async () => null,
  saveEomDiagConfig: async () => ({}),
  triggerSync: async () => ({ ok: true }),
  loadEomDigestConfig: async () => ({ levels: ['district', 'patch'], sendHourUtc: 23 }),
  saveEomDigestConfig: async () => ({ saved: true }),
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

const STORES = [{ loc: '3708' }, { loc: '3709' }];

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function renderPanel(root) {
  await act(async () => {
    root.render(React.createElement(EOMDashboardPanel, {
      stores: STORES, ds: {}, settings: {}, onClose: () => {}, initialMode: 'eom',
    }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

async function openDraft(container) {
  const draftBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '✉️ Draft');
  expect(draftBtn, '✉️ Draft button not found — check the loadQsrOnHand fixture / initialMode').toBeTruthy();
  await act(async () => { draftBtn.click(); });
}

function clickView(container, label) {
  const btn = [...container.querySelectorAll('button')].find(b => b.textContent === label);
  expect(btn, `"${label}" view button not found`).toBeTruthy();
  return act(async () => { btn.click(); });
}

describe('EOM Store message — Housekeeping view (obsolete/discontinued split out of Full)', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('a real diagnosis unlocks a 3-way Recap / Full report / 🧹 Housekeeping toggle', async () => {
    await renderPanel(root);
    await openDraft(container);
    const labels = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(labels).toContain('↩ Recap');
    expect(labels).toContain('Full report');
    expect(labels).toContain('🧹 Housekeeping');
  });

  it('Full report no longer lists the obsolete item, but points to Housekeeping for it', async () => {
    await renderPanel(root);
    await openDraft(container);
    await clickView(container, 'Full report');

    expect(container.textContent).not.toMatch(/Obsolete \/ Discontinued \/ Inactive/);
    expect(container.textContent).not.toMatch(/Old Discontinued Syrup/);
    // The pointer sentence that replaced the inline section.
    expect(container.textContent).toMatch(/obsolete\/discontinued\/inactive item.*Housekeeping report/i);
  });

  it('🧹 Housekeeping shows the obsolete item and is framed as routine maintenance, not this cycle\'s $', async () => {
    await renderPanel(root);
    await openDraft(container);
    await clickView(container, '🧹 Housekeeping');

    expect(container.textContent).toMatch(/Housekeeping — routine maintenance/);
    expect(container.textContent).toMatch(/none of this changes this month.s FOB number/i);
    expect(container.textContent).toMatch(/Obsolete \/ Discontinued \/ Inactive/);
    expect(container.textContent).toMatch(/Old Discontinued Syrup/);
    expect(container.textContent).toMatch(/OLD1/);
    // This is a genuinely SMALLER view, not the Full report with a header slapped on — none of
    // Full's this-cycle sections should leak into it.
    expect(container.textContent).not.toMatch(/Top 5 — do these now/);
    expect(container.textContent).not.toMatch(/Reference — full detail/);
  });

  it('↩ Recap never showed the obsolete item either way (unaffected by the split)', async () => {
    await renderPanel(root);
    await openDraft(container);
    // Recap is the default view on open.
    expect(container.textContent).not.toMatch(/Obsolete \/ Discontinued \/ Inactive/);
    await clickView(container, '🧹 Housekeeping');
    await clickView(container, '↩ Recap');
    expect(container.textContent).not.toMatch(/Obsolete \/ Discontinued \/ Inactive/);
  });
});
