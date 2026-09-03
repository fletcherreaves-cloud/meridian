// @vitest-environment happy-dom
// @ts-nocheck
// EOM Dashboard's "🔗 Share" button (createEomShareLink) had no way to see or revoke a link
// afterward -- loadEomShareLinks/revokeEomShareLink existed in supabase.js with zero consumers
// (metric-inventory-2026-08-07.md's dead-loader list). This adds "🔗 Manage Share Links" to the
// Reports action group: lists links for the current period, revoke button per active row.
//
// Renders the REAL EOMDashboardPanel and drives the actual Reports-dropdown click path (this
// repo's "would this verification still pass if reverted?" standing rule) rather than calling
// loadEomShareLinks/revokeEomShareLink directly.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

let loadLinksMock, revokeLinkMock;

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ data: null, error: null }) }) },
  loadQsrOnHand: async () => [],
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
  loadPmixSalesByItems: async () => [],
  loadEomDiagConfig: async () => null,
  saveEomDiagConfig: async () => ({}),
  triggerSync: async () => ({ ok: true }),
  loadEomDigestConfig: async () => null,
  saveEomDigestConfig: async () => ({}),
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
  loadEomShareLinks: async (...args) => loadLinksMock(...args),
  revokeEomShareLink: async (...args) => revokeLinkMock(...args),
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

async function openLinksModal(container) {
  const trigger = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Reports'));
  expect(trigger, 'Reports ActionMenu trigger not found').toBeTruthy();
  await act(async () => { trigger.click(); });
  const item = [...container.querySelectorAll('button')].find(b => b.textContent === '🔗 Manage Share Links');
  expect(item, '🔗 Manage Share Links item not found').toBeTruthy();
  await act(async () => {
    item.click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

describe('EOM Dashboard — Manage Share Links', () => {
  let container, root;
  beforeEach(() => {
    loadLinksMock = vi.fn(async () => [
      { token: 'tok-active', loc: '3708', storeName: 'Ardmore-Broadway', createdAt: '2026-09-01T12:00:00Z', expiresAt: '2026-09-15T12:00:00Z', revoked: false, viewCount: 3, lastViewedAt: '2026-09-02T09:00:00Z', acknowledgedAt: null },
      { token: 'tok-revoked', loc: '6178', storeName: 'Chipley', createdAt: '2026-08-20T12:00:00Z', expiresAt: '2026-09-03T12:00:00Z', revoked: true, viewCount: 1, lastViewedAt: null, acknowledgedAt: null },
    ]);
    revokeLinkMock = vi.fn(async () => ({ error: null }));
    ({ container, root } = mountRoot());
  });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('lists share links for the current period with store name, view count, and status', async () => {
    await renderPanel(root);
    await openLinksModal(container);
    expect(loadLinksMock).toHaveBeenCalled();
    const text = container.textContent;
    expect(text).toMatch(/Ardmore-Broadway/);
    expect(text).toMatch(/Chipley/);
    expect(text).toMatch(/Active/);
    expect(text).toMatch(/Revoked/);
  });

  it('shows a Revoke button only for the active (non-revoked) link', async () => {
    await renderPanel(root);
    await openLinksModal(container);
    const revokeButtons = [...container.querySelectorAll('button')].filter(b => b.textContent === 'Revoke');
    expect(revokeButtons.length).toBe(1);
  });

  it('clicking Revoke calls revokeEomShareLink with the link\'s token and refreshes the list', async () => {
    await renderPanel(root);
    await openLinksModal(container);
    const revokeBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Revoke');
    await act(async () => {
      revokeBtn.click();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    expect(revokeLinkMock).toHaveBeenCalledWith('tok-active', true);
    // refreshLinks() re-calls loadEomShareLinks after a successful revoke.
    expect(loadLinksMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('shows a no-links message when the period has none', async () => {
    loadLinksMock = vi.fn(async () => []);
    await renderPanel(root);
    await openLinksModal(container);
    expect(container.textContent).toMatch(/No share links found/);
  });
});
