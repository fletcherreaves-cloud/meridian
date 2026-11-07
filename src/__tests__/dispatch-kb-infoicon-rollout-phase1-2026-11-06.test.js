// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion) — InfoIcon rollout, Phase 1. The `InfoIcon({articleKey})`
// component (src/engine/forecast.js) already existed and was already used in 4 files, but wiring
// it onto more panel headers was flagged as a real, unstarted gap since the very first KB batch
// (memory/finding-kb-panel-guide-2026-11-03.md, "Left for a later pass"). This is the first slice:
// 5 panels (6 wirings, since Food Cost/End of Month is one component with two KB keys depending
// on its mode), picked from real RoutePanelShell-wrapped panels whose title already has a matching
// KB_ARTICLES key, mechanically verified rather than wired blind.
//
// Per CLAUDE.md's "would this verification still pass if the change were reverted?" rule: each
// test renders the ACTUAL panel component (not a stand-in), clicks the real "?" InfoIcon control,
// and asserts the real article text appears — reverting the wiring (removing the InfoIcon prop)
// would make the "?" control vanish and these tests fail.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

let container, root;
afterEach(() => {
  if (root) act(() => root.unmount());
  if (container) container.remove();
  container = null; root = null;
});

function mountEl(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
}

// The InfoIcon's clickable "?" control carries a distinctive title attribute
// ("Click for details: <article title>") — query on that rather than on text content, since the
// visible glyph is just "?".
function clickInfoIcon() {
  const icon = container.querySelector('span[title^="Click for details"]');
  expect(icon, 'InfoIcon "?" control not found').toBeTruthy();
  act(() => { icon.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('InfoIcon rollout Phase 1 — Needs Attention (attention_guide)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, loadUserSetting: async () => null };
    });
    const { AttentionPanel } = await import('../views/analytics.js');
    await act(async () => {
      mountEl(h(AttentionPanel, {
        stores: [], ds: {}, dateRange: { start: new Date('2026-11-01'), end: new Date('2026-11-06') },
        swingAcks: {}, swingItems: [], onSelectStore: () => {}, onClose: () => {},
        onCoachingSaved: () => {}, onPayEventSaved: () => {},
      }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Needs Attention — Panel Guide');
    vi.doUnmock('../lib/supabase.js');
  });
});

// CORRECTED Phase 3 (dispatch-kb-infoicon-rollout-phase3-2026-11-06.test.js) — this component's
// 'eom' mode used to wire the WRONG key, eom_dashboard_guide (the real content behind that key
// describes the separate `EOMDashboardPanel`/"Inventory Control" panel, not this one). Both modes
// now correctly wire food_cost_panel, which documents the End-of-Month mode as a tab within this
// same panel. eom_dashboard_guide is wired onto its real target panel in Phase 3 instead.
describe('InfoIcon rollout Phase 1 — Food Cost / End of Month (food_cost_panel)', () => {
  let resolveLoadQsrFob;
  afterEach(() => { resolveLoadQsrFob = undefined; vi.doUnmock('../lib/supabase.js'); vi.resetModules(); });

  async function mountFOB(initialMode) {
    vi.resetModules();
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, loadQsrFob: () => new Promise((resolve) => { resolveLoadQsrFob = resolve; }) };
    });
    const { FOBAnalysisPanel } = await import('../views/analytics.js');
    await act(async () => {
      mountEl(h(FOBAnalysisPanel, {
        stores: [], ds: { fobRows: [], wasteRows: [], targets: {}, monthlyTargets: {} },
        settings: {}, onClose: () => {}, initialMode,
      }));
    });
    await act(async () => {
      resolveLoadQsrFob([]);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
  }

  it('Food Cost mode: renders the info icon and opens food_cost_panel', async () => {
    await mountFOB(undefined);
    clickInfoIcon();
    expect(container.textContent).toContain('Food Cost — Panel Guide');
  });

  it('End of Month mode: renders the info icon and opens food_cost_panel (not eom_dashboard_guide)', async () => {
    await mountFOB('eom');
    clickInfoIcon();
    expect(container.textContent).toContain('Food Cost — Panel Guide');
    expect(container.textContent).not.toContain('Inventory Control (EOM Dashboard) — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 1 — Data Manager (data_manager_guide)', () => {
  function fakeSupabaseChain() {
    const chain = {
      select: () => chain, order: () => chain, eq: () => chain, gte: () => chain, limit: () => chain,
      single: async () => ({ data: null, error: null }),
      then: (resolve) => resolve({ data: null, count: 0, error: null }),
    };
    return chain;
  }
  const fakeSupabase = { from: () => fakeSupabaseChain() };

  afterEach(() => { vi.doUnmock('../lib/supabase.js'); vi.resetModules(); });

  it('renders the info icon and opens data_manager_guide', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, supabase: fakeSupabase, loadDataCompletenessIncidents: vi.fn(async () => []) };
    });
    const { DataManagerPanel } = await import('../views/analytics.js');
    await act(async () => {
      mountEl(h(DataManagerPanel, { ds: { loaded: true }, idbCoverage: {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Data Manager — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 1 — Events (events_guide)', () => {
  afterEach(() => { vi.doUnmock('../lib/supabase.js'); vi.resetModules(); });

  it('renders the info icon and opens events_guide', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase.js', () => ({ loadEventImpact: () => Promise.resolve([]) }));
    const { EventsPanel } = await import('../views/events-panel.js');
    await act(async () => {
      mountEl(h(EventsPanel, { stores: [], ds: {}, settings: {}, userEvents: {}, onUpdate: () => {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Events — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 1 — Inventory Intelligence (inventory_guide)', () => {
  afterEach(() => { vi.doUnmock('../lib/supabase.js'); vi.resetModules(); });

  it('renders the info icon (empty-state shell) and opens inventory_guide', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, loadQsrInventorySummary: () => Promise.resolve([]) };
    });
    const { InventoryIntelligence } = await import('../views/inventory.js');
    await act(async () => {
      mountEl(h(InventoryIntelligence, { stores: [], ds: {}, settings: {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Inventory Intelligence — Panel Guide');
  });
});
