// @vitest-environment happy-dom
// @ts-nocheck
// Owner req (2026-10-29): "if I wanted to resend a digest report to just one location, how
// would I do that?" -- there was no way to: District/Patch/Market/Operator were the only roll-up
// levels, Patch was the smallest unit (a supervisor's whole patch, not one store), and the
// on-demand send ignored whatever the LocationSelector was scoped to anyway (it always re-pulled
// every group at the chosen level fresh, server-side).
//
// This exercises the fix through the REAL EOMDashboardPanel -> "📧 Generate Report" -> EOM Digest
// modal chain (this repo's "would this verification still pass if reverted?" rule), the same
// harness dispatch-224-eom-digest-operator-render.test.js already established for the Operator
// tab: buildEomDigest()'s new 'store' level, digestAutoLevel's oneStore->'store' default, the
// modal's new Store levelTab, and sendDigest()'s new loc-passing all have to be wired correctly
// for these assertions to pass.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const triggerSync = vi.fn(async () => ({ ok: true }));

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
  triggerSync,
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

// '3708' = Ardmore-Broadway (MCDOK), '6178' = Chipley FL (Emerald Arches) — same real
// DEF_SETTINGS-seeded stores dispatch-224's own render test uses.
const STORES = [{ loc: '3708' }, { loc: '6178' }];

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function renderPanel(root, props = {}) {
  await act(async () => {
    root.render(React.createElement(EOMDashboardPanel, { stores: STORES, ds: {}, settings: {}, onClose: () => {}, ...props }));
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

// 2026-10-30 — the modal now ALSO has a "📬 Recipients" checklist (its own checkboxes), so a bare
// container-wide checkbox query picks up both groups. Scope to just the "⚙️ Scheduled send" box.
function schedCheckboxes(container) {
  const heading = [...container.querySelectorAll('div')].find(d => d.textContent.trim() === '⚙️ Scheduled send');
  expect(heading, '⚙️ Scheduled send heading not found').toBeTruthy();
  return [...heading.parentElement.querySelectorAll('input[type="checkbox"]')];
}

describe('EOM Digest modal — Store level (owner req 2026-10-29: resend to just one location)', () => {
  let container, root;
  beforeEach(() => { triggerSync.mockClear(); ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('renders a 5th "Store" level tab alongside District/Patch/Market/Operator', async () => {
    await renderPanel(root);
    await openDigestModal(container);
    const tabLabels = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(tabLabels).toContain('District');
    expect(tabLabels).toContain('Patch');
    expect(tabLabels).toContain('Market');
    expect(tabLabels).toContain('Operator');
    expect(tabLabels).toContain('Store');
  });

  it('"Store" does NOT appear in the ⚙️ Scheduled send checkboxes — a saved schedule must never silently blast every store daily', async () => {
    await renderPanel(root);
    await openDigestModal(container);
    const boxLabels = schedCheckboxes(container).map(b => b.closest('label').textContent);
    expect(boxLabels).toEqual(['District', 'Patch', 'Market', 'Operator']);
    expect(boxLabels).not.toContain('Store');
  });

  it('clicking Store groups the real stores one-per-store, each labeled by its own name', async () => {
    await renderPanel(root);
    await openDigestModal(container);
    const storeTab = [...container.querySelectorAll('button')].find(b => b.textContent === 'Store');
    await act(async () => { storeTab.click(); });
    const text = container.textContent;
    expect(text).toMatch(/Ardmore-Broadway/);
    expect(text).toMatch(/Chipley/);
  });

  it('a notification-bell-style deep link (initialStore) defaults the digest straight to Store level — no extra click needed', async () => {
    await renderPanel(root, { initialStore: '3708' });
    await openDigestModal(container);
    const storeTab = [...container.querySelectorAll('button')].find(b => b.textContent === 'Store');
    expect(storeTab, 'Store tab not found').toBeTruthy();
    // active-tab styling uses the gold background (#f5bc00) — same signal dispatch-224 would have
    // used had it needed to assert a non-default initial tab.
    expect(storeTab.style.background).toBe('#f5bc00');
  });

  it('clicking Email at Store level, with exactly one store in scope, passes that store\'s own loc through to the send — the actual owner request', async () => {
    await renderPanel(root, { initialStore: '3708' });
    await openDigestModal(container);
    const sendBtn = [...container.querySelectorAll('button')].find(b => b.textContent.startsWith('📧 Email'));
    expect(sendBtn, 'Email button not found').toBeTruthy();
    await act(async () => { sendBtn.click(); await Promise.resolve(); });
    expect(triggerSync).toHaveBeenCalledTimes(1);
    const [workflow, inputs] = triggerSync.mock.calls[0];
    expect(workflow).toBe('digest');
    expect(inputs.level).toBe('store');
    // Whatever loc format digestStoreRows itself carries ('3708' here, this fixture's own
    // unpadded shape) — the server-side filterRowsByLoc() pads either form the same way, so
    // the exact string here doesn't need to be 7-char zero-padded to be correct.
    expect(inputs.loc).toBe('3708');
  });

  it('clicking Email at a non-store level never sends a loc input — every other level\'s send is unaffected', async () => {
    await renderPanel(root);
    await openDigestModal(container);
    const sendBtn = [...container.querySelectorAll('button')].find(b => b.textContent.startsWith('📧 Email'));
    await act(async () => { sendBtn.click(); await Promise.resolve(); });
    expect(triggerSync).toHaveBeenCalledTimes(1);
    const [, inputs] = triggerSync.mock.calls[0];
    expect(inputs.loc).toBeUndefined();
  });
});
