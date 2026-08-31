// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #202 — EOM Supervisor Summary folded into the Inventory Control hub
// (EOMDashboardPanel, src/views/eom-dashboard.js) as a new "Supervisor Rollup" tab/mode,
// matching the "detail hub + cross-store rollup tab" precedent schedule-retention.js already
// established (dispatch #141, ScheduleRetentionRollupSection).
//
// Per this repo's "would this verification still pass if reverted?" standing rule (CLAUDE.md),
// this renders the REAL EOMDashboardPanel -> EOMSupervisorPanel chain (not an isolated helper or
// a mocked stand-in) — both via the tab-click path and via the initialMode redirect prop
// App.js's onOpenModal('eom-summary') branch now sets. A test that only imports
// EOMSupervisorPanel directly (like the old standalone panel would have been tested) could not
// tell "folded in and reachable" from "folded in but never wired into a real tab click."
//
// Supabase is mocked (same pattern as dispatch-160-onepager-panel.test.js /
// crew-schedule-panel.test.js) because EOMDashboardPanel's own body is gated on several load*
// promises settling, and EOMSupervisorPanel reads the raw `supabase` client directly (org_config
// manual-data round-trip) — in a sandbox with no real Supabase config, an unmocked call either
// hangs (real fetch) or throws (no client), leaving the panel stuck or crashed before any
// assertion below can run.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// Chainable fake matching EOMSupervisorPanel's exact call shapes:
//   supabase.from(t).select(c).eq(k,v).maybeSingle()   (manual-data read)
//   supabase.from(t).upsert(row, opts).catch(fn)        (manual-data write)
function fakeSupabaseChain() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    upsert: async () => ({ data: null, error: null }),
  };
  return chain;
}
const fakeSupabase = { from: () => fakeSupabaseChain() };

vi.mock('../lib/supabase.js', () => ({
  supabase: fakeSupabase,
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
const { PANEL_BY_ID } = await import('../app/panel-registry.js');

const STORES = [{ loc: '3708' }, { loc: '3709' }];

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function renderPanel(root, extraProps) {
  await act(async () => {
    root.render(React.createElement(EOMDashboardPanel, {
      stores: STORES, ds: {}, settings: {}, onClose: () => {}, ...extraProps,
    }));
    // Flush the mocked load* microtasks so the panel settles past its initial loading state.
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

describe('dispatch #202 — Supervisor Rollup tab inside Inventory Control', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('initialMode="supervisor" (the eom-summary redirect target) renders the real EOMSupervisorPanel content', async () => {
    await renderPanel(root, { initialMode: 'supervisor' });
    const text = container.textContent;
    // RoutePanelShell's own hub chrome, unchanged.
    expect(text).toMatch(/Inventory Control/);
    // EOMSupervisorPanel's own content — real component, not a stub.
    expect(text).toMatch(/EOM Supervisor Summary/);
    expect(text).toMatch(/Copy OP Supplies/);
    // The tab strip itself should be present (band 3 survives even with band 2 hidden).
    expect(text).toMatch(/Supervisor Rollup/);
    // Every other mode's own tab labels should ALSO still render (tab strip, not content).
    expect(text).toMatch(/Scoreboard/);
    expect(text).toMatch(/Count Cycle/);
  });

  it('clicking the Supervisor Rollup tab from the default mode switches into the same real content', async () => {
    await renderPanel(root);
    const tabs = [...container.querySelectorAll('button')];
    const tab = tabs.find(b => b.textContent === 'Supervisor Rollup');
    expect(tab, 'Supervisor Rollup tab button not found').toBeTruthy();
    await act(async () => { tab.click(); await Promise.resolve(); });
    expect(container.textContent).toMatch(/EOM Supervisor Summary/);
  });

  it('dispatch #225: supervisor mode now shows the shared location/date controls (its own internal month/year picker is gone), but still hides the 4-tab-specific export/action bands', async () => {
    await renderPanel(root, { initialMode: 'supervisor' });
    const text = container.textContent;
    // PanelChrome's shared "Reports/Scans/Monitor/Pulls" ActionMenu group is 4-tab-specific
    // (onhand-shaped rows/allRows) and still should not render in supervisor mode. (Note:
    // EOMSupervisorPanel keeps its own unrelated "⬇ CSV" button — its Op Supplies export — so
    // that text alone can't distinguish the hidden 4-tab export band; the title text can.)
    expect(text).not.toMatch(/Reports\s*Scans\s*Monitor\s*Pulls/);
    expect(container.querySelector('[title="Download the all-stores table as CSV"]')).toBeFalsy();
    // dispatch #225 Task 3/4 — the shared LocationSelector + period picker (PanelChrome's
    // location/dateControl bands) now render for supervisor mode too, replacing this panel's own
    // former internal "Period:" month/year <select> pair (which no longer exists at all).
    expect(text).not.toMatch(/Period:/);
    expect(text).toMatch(/All Locations/);
  });

  it('supervisor mode short-circuits the EOM/Cadence SummaryTiles and completion table (no cross-talk)', async () => {
    await renderPanel(root, { initialMode: 'supervisor' });
    const text = container.textContent;
    // SummaryTiles' own EOM-mode wording must not leak into Supervisor Rollup.
    expect(text).not.toMatch(/Believe done/);
    expect(text).not.toMatch(/Avg count complete/);
  });

  it('the old eom-summary registry entry is retired to kind:"internal" but keeps its id and perm, matching eom-dashboard\'s own perm (measured, not assumed — no privilege change)', () => {
    const eomSummary = PANEL_BY_ID['eom-summary'];
    const eomDashboard = PANEL_BY_ID['eom-dashboard'];
    expect(eomSummary).toBeTruthy();
    expect(eomSummary.kind).toBe('internal');
    expect(eomSummary.perm).toBe('analytics.district');
    expect(eomSummary.perm).toBe(eomDashboard.perm);
  });
});
