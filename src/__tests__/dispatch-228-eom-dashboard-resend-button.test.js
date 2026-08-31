// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #228 — the EOM Dashboard's per-store "Store message" modal gets a new "🔄 Resend"
// button that regenerates the count-completion notification from CURRENT data and resends it,
// wired to triggerSync('resend_notify', { loc, period }) — the same call shape as the existing
// "📧 Generate Report" -> Send button's triggerSync('digest', { level }) call (dispatch #215).
//
// Per this repo's "would this verification still pass if reverted?" standing rule (CLAUDE.md),
// this renders the REAL EOMDashboardPanel -> real "✉️ Draft" click -> real Store message
// ModalShell -> real "🔄 Resend" click chain (not an isolated helper) — mirrors
// dispatch-217-eom-digest-settings-ui.test.js's own established pattern for this exact file,
// including its mock module list (copied verbatim) so this test exercises the panel under the
// same conditions that test already proves stable.
//
// initialMode:'eom' is passed explicitly (rather than relying on defaultModeFor()'s own
// date-dependent default) so this test's outcome does not depend on which day it happens to run.
// The "✉️ Draft" button lives in the EOM Count table (Diagnosis/Communication columns per store)
// specifically — measured directly (not assumed): the Scoreboard checklist mode's own per-store
// row renders a different action set ("📋 Report"/"☐ Reviewed"/"☐ Comms"), not "✉️ Draft" at all.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const triggerSync = vi.fn(async () => ({ ok: true }));

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ data: null, error: null }) }) },
  loadQsrOnHand: async () => ([
    { loc: '3708', wrin: 'F1', descr: 'Food Item', cls: 'Food', onHandAmt: 10, active: true, lastCounted: null },
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
  triggerSync,
  loadEomDigestConfig: async () => ({ levels: ['district', 'patch'], sendHourUtc: 23 }),
  saveEomDigestConfig: async () => ({ saved: true }),
  saveEomItemDisposition: async () => ({}),
  loadEomItemDisposition: async () => [],
  // Must be a real Set — eom-dashboard.js's own useEffect does
  // `loadSelfServeTowerLocs().then(setSelfServeTowers)` with no wrapping, and openDiag/openDraft
  // both call `selfServeTowers.has(...)` directly on whatever this resolves to.
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

describe('dispatch #228 — EOM Dashboard "🔄 Resend" button', () => {
  let container, root;
  beforeEach(() => { triggerSync.mockClear(); ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('opening a store\'s "✉️ Draft" message modal shows a "🔄 Resend" button, distinct from Copy message/Mark as sent', async () => {
    await renderPanel(root);
    const draftBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '✉️ Draft');
    expect(draftBtn, '✉️ Draft button not found — check the loadQsrOnHand fixture / initialMode').toBeTruthy();
    await act(async () => { draftBtn.click(); });

    expect(container.textContent).toMatch(/Store message/);
    const resendBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🔄 Resend');
    expect(resendBtn, '🔄 Resend button not found in the Store message modal').toBeTruthy();
    // It is a real, separate action from the existing two.
    expect([...container.querySelectorAll('button')].some(b => b.textContent === 'Copy message')).toBe(true);
    expect([...container.querySelectorAll('button')].some(b => b.textContent === 'Mark as sent')).toBe(true);
  });

  it('clicking "🔄 Resend" calls triggerSync(\'resend_notify\', { loc, period }) with the open store\'s loc and the panel\'s current period — the SAME call shape as the digest Send button\'s triggerSync(\'digest\', {...})', async () => {
    await renderPanel(root);
    const draftBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '✉️ Draft');
    await act(async () => { draftBtn.click(); });

    const resendBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🔄 Resend');
    await act(async () => { resendBtn.click(); await Promise.resolve(); await Promise.resolve(); });

    expect(triggerSync).toHaveBeenCalledTimes(1);
    const [workflow, inputs] = triggerSync.mock.calls[0];
    expect(workflow).toBe('resend_notify');
    expect(inputs).toHaveProperty('loc');
    expect(inputs).toHaveProperty('period');
    expect(String(inputs.loc)).toMatch(/3708/); // the fixture's own loc, unpadded or padded
    expect(String(inputs.period)).toMatch(/^\d{4}-\d{2}$/);
  });

  it('shows an inline success message after a successful resend, and disables the button while in flight', async () => {
    let resolveTrigger;
    triggerSync.mockImplementationOnce(() => new Promise(res => { resolveTrigger = res; }));
    await renderPanel(root);
    const draftBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '✉️ Draft');
    await act(async () => { draftBtn.click(); });

    const resendBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🔄 Resend');
    act(() => { resendBtn.click(); });
    await Promise.resolve();
    // Busy state: the button relabels and disables while the call is in flight.
    const busyBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🔄 Resending…');
    expect(busyBtn, 'button did not show a busy state while triggerSync was in flight').toBeTruthy();
    expect(busyBtn.disabled).toBe(true);

    await act(async () => { resolveTrigger({ ok: true }); await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toMatch(/Resend started/);
  });

  it('shows the error text inline when triggerSync returns an error, rather than throwing', async () => {
    triggerSync.mockResolvedValueOnce({ error: 'workflow not found' });
    await renderPanel(root);
    const draftBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '✉️ Draft');
    await act(async () => { draftBtn.click(); });
    const resendBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🔄 Resend');
    await act(async () => { resendBtn.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toMatch(/workflow not found/);
  });
});
