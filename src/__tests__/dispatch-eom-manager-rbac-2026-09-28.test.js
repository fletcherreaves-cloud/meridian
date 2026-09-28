// @vitest-environment happy-dom
// @ts-nocheck
// 2026-09-28 — owner RBAC decision on the 2026-09-27 "My Store" single-store recap feature:
// "Narrower fix, store specific at that level unless overridden in settings." Two real changes,
// both revert-sensitive at the call site (renders the actual EOMDashboardPanel, not just the
// registry field or a pure function):
//
//   1. panel-registry.js's eom-dashboard perm widened 'analytics.district' -> 'analytics.store'
//      so manager/gm/sm_am_dm can reach the panel at all.
//   2. eom-dashboard.js's SINGLE_STORE_ROLES gained 'manager' (joining 'gm'/'sm_am_dm') -- a
//      manager with accessible_locs resolving to exactly one store lands on the single-store
//      'mystore' tab, same as a GM; a manager with multi-store or null (unrestricted)
//      accessible_locs falls through to the ordinary multi-store dashboard -- the "override in
//      settings" lever the owner asked for, reusing the existing accessible_locs field rather
//      than a new toggle.
//   3. A real bug this widening would otherwise have introduced: the mode-init useState used to
//      read `initialMode || (singleStoreLoc ? 'mystore' : ...)`, so a legacy deep link setting
//      initialMode:'scoreboard' (the EOM notification bell, widened to analytics.store in the
//      same pass) would have overridden 'mystore' for a single-store role -- landing them on a
//      mode with no matching TAB_LIST button. Fixed to check singleStoreLoc FIRST.
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PANEL_BY_ID } from '../app/panel-registry.js';

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ data: null, error: null }) }) },
  loadQsrOnHand: async () => ([
    { loc: '3708', wrin: 'F1', descr: 'Food Item', cls: 'Food', onHandAmt: 10, active: true, lastCounted: '2026-08-25' },
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
  loadPmixSalesByItems: async () => [],
  loadEomDiagConfig: async () => null,
  saveEomDiagConfig: async () => ({}),
  triggerSync: async () => ({ ok: true }),
  loadEomDigestConfig: async () => null,
  saveEomDigestConfig: async () => ({}),
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
  createEomShareLink: async () => ({ token: 'x', error: null }),
  loadEomShareLinks: async () => [],
  revokeEomShareLink: async () => ({}),
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

async function renderPanel(root, extraProps = {}) {
  await act(async () => {
    root.render(React.createElement(EOMDashboardPanel, {
      stores: STORES, ds: {}, settings: {}, onClose: () => {}, ...extraProps,
    }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

describe('eom-dashboard registry perm (2026-09-28 RBAC widening)', () => {
  it('eom-dashboard is analytics.store, not analytics.district', () => {
    expect(PANEL_BY_ID['eom-dashboard'].perm).toBe('analytics.store');
  });
});

describe('EOMDashboardPanel single-store default view — manager role (2026-09-28)', () => {
  it('a manager with exactly one accessible_loc lands on the single "My Store" tab, same as a GM', async () => {
    const { container, root } = mountRoot();
    await renderPanel(root, { userRole: 'manager', accessibleLocs: ['3708'] });
    const text = container.textContent;
    expect(text).toMatch(/My Store/);
    expect(text).not.toMatch(/Scoreboard/);
    expect(text).not.toMatch(/Supervisor Rollup/);
    document.body.innerHTML = '';
  });

  it('a manager with MULTIPLE accessible_locs falls through to the ordinary multi-store dashboard (the "override in settings" lever)', async () => {
    const { container, root } = mountRoot();
    await renderPanel(root, { userRole: 'manager', accessibleLocs: ['3708', '6178'] });
    const text = container.textContent;
    expect(text).toMatch(/Scoreboard/);
    expect(text).not.toMatch(/My Store/);
    document.body.innerHTML = '';
  });

  it('a manager with accessibleLocs===null (unrestricted, every profile that has ever existed) also falls through to the multi-store dashboard', async () => {
    const { container, root } = mountRoot();
    await renderPanel(root, { userRole: 'manager', accessibleLocs: null });
    const text = container.textContent;
    expect(text).toMatch(/Scoreboard/);
    expect(text).not.toMatch(/My Store/);
    document.body.innerHTML = '';
  });

  it('a VP (analytics.district role, not in SINGLE_STORE_ROLES) sees the multi-store dashboard even with exactly one accessible_loc', async () => {
    const { container, root } = mountRoot();
    await renderPanel(root, { userRole: 'vp', accessibleLocs: ['3708'] });
    const text = container.textContent;
    expect(text).toMatch(/Scoreboard/);
    expect(text).not.toMatch(/My Store/);
    document.body.innerHTML = '';
  });
});

describe('mode-init bug fix — singleStoreLoc must win over a legacy initialMode (2026-09-28)', () => {
  it('a single-store manager passed initialMode:"scoreboard" (simulating the EOM notification-bell deep link) still lands on "My Store", not stuck on a tab their narrowed strip has no button for', async () => {
    const { container, root } = mountRoot();
    await renderPanel(root, { userRole: 'manager', accessibleLocs: ['3708'], initialMode: 'scoreboard', initialStore: '3708' });
    const text = container.textContent;
    expect(text).toMatch(/My Store/);
    // The pre-fix behavior would have shown the Scoreboard's own body/heading with no "My Store"
    // tab button present to click back to it -- assert the recap intro line renders instead.
    expect(text).toMatch(/EOM recap/);
    document.body.innerHTML = '';
  });

  it('a multi-store VP passed initialMode:"compliance" (the legacy count-cycle redirect) still honors that legacy mode -- the fix only changes singleStoreLoc roles', async () => {
    const { container, root } = mountRoot();
    await renderPanel(root, { userRole: 'vp', accessibleLocs: null, initialMode: 'compliance' });
    const text = container.textContent;
    expect(text).toMatch(/Count Cycle/);
    document.body.innerHTML = '';
  });
});
