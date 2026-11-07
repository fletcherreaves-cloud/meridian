// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion) — InfoIcon rollout, Phase 3. Phase 1
// (dispatch-kb-infoicon-rollout-phase1-2026-11-06.test.js) wired 5 panels; Phase 2
// (dispatch-kb-infoicon-rollout-phase2-2026-11-06.test.js) wired 13 more. This phase wires the
// next 9 real RoutePanelShell-backed panels whose title already has a matching KB_ARTICLES key —
// Location Intelligence, Delivery & Channel Mix, Equipment Results, Reports Hub, My Reports,
// SMG VOICE, Org Summary (Operator Summary), Performance Reviews, Store One-Pager Generator —
// plus a real bugfix: Food Cost's "End of Month" mode was wired to `eom_dashboard_guide`
// (the DIFFERENT "Inventory Control" panel's article), not `food_cost_panel` (which already
// documents the End-of-Month mode as a tab within itself). `eom_dashboard_guide` itself was
// unwired until this phase — it's now correctly wired onto `EOMDashboardPanel`
// (src/views/eom-dashboard.js), the component its own content actually describes.
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
  vi.doUnmock('../lib/supabase.js');
  vi.resetModules();
});

function mountEl(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
}

// The InfoIcon's clickable "?" control carries a distinctive title attribute
// ("Click for details: <article title>") — query on that rather than on text content, since the
// visible glyph is just "?". A panel with more than one wired InfoIcon (none in this phase) would
// need an index; querySelector picks the first.
function clickInfoIcon() {
  const icon = container.querySelector('span[title^="Click for details"]');
  expect(icon, 'InfoIcon "?" control not found').toBeTruthy();
  act(() => { icon.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('InfoIcon rollout Phase 3 — Location Intelligence (loc_intel_guide)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    const { LocationIntelligence } = await import('../features/location-intel.js');
    await act(async () => {
      mountEl(h(LocationIntelligence, { allStores: [], ds: {}, settings: {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Market Intelligence — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 3 — Delivery & Channel Mix (delivery_3po)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    const { DeliveryMixPanel } = await import('../views/delivery-mix.js');
    await act(async () => {
      mountEl(h(DeliveryMixPanel, { ds: {}, stores: [], onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('3PO Delivery — Channel Mix & Delivery Platforms');
  });
});

describe('InfoIcon rollout Phase 3 — Equipment Results (equipment_results_guide)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        loadEquipmentCatalogDirect: async () => [],
        loadAllEquipmentEntriesDirect: async () => [],
        loadEquipmentSurveyLinks: async () => [],
      };
    });
    const { EquipmentResultsPanel } = await import('../views/equipment-results.js');
    await act(async () => {
      mountEl(h(EquipmentResultsPanel, { stores: [], onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Equipment Results — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 3 — Reports Hub (reports_hub_guide)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    const { ReportsHub } = await import('../views/reports-hub.js');
    await act(async () => {
      mountEl(h(ReportsHub, { can: () => true, onOpenPanel: () => {}, onLaunchSubscription: () => {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Reports Hub — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 3 — My Reports (reports_hub_guide, cross-referenced)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, loadReportSubs: async () => [], saveReportSubs: async () => {} };
    });
    const { ReportSubscriptions } = await import('../views/report-subscriptions.js');
    await act(async () => {
      mountEl(h(ReportSubscriptions, { onClose: () => {}, onLaunch: () => {} }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Reports Hub — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 3 — SMG VOICE (guest_voice_smg)', () => {
  it('renders the info icon (empty-state) and opens the real article on click', async () => {
    const { SMGVoicePanel } = await import('../views/smg-voice.js');
    await act(async () => {
      mountEl(h(SMGVoicePanel, { ds: {}, stores: [], onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Guest Voice (SMG VOICE)');
  });
});

describe('InfoIcon rollout Phase 3 — Org Summary / Operator Summary (operator_summary_guide)', () => {
  it('renders the info icon (empty-state) and opens the real article on click', async () => {
    const { OperatorSummaryPanel } = await import('../views/labor-tools.js');
    await act(async () => {
      mountEl(h(OperatorSummaryPanel, { ds: {}, stores: [], settings: {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Org Summary (Operator Summary) — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 3 — Performance Reviews (performance_reviews_guide)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, loadQsrActSummary: async () => [], loadGlimpse: async () => [], loadOpsServiceStats: async () => [] };
    });
    const { PerformanceReviewsPanel } = await import('../views/performance-reviews.js');
    await act(async () => {
      mountEl(h(PerformanceReviewsPanel, { stores: [], ds: {}, settings: {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Performance Reviews');
  });
});

describe('InfoIcon rollout Phase 3 — Inventory Control / EOM Dashboard (eom_dashboard_guide, bugfix target)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        loadQsrOnHand: async () => [],
        loadEomCountStatus: async () => [],
        loadQsrVarianceStat: async () => [],
        loadQsrWaste: async () => [],
        loadQsrTransfers: async () => [],
        loadQsrRawItemDetail: async () => [],
        loadQsrRawItemInfo: async () => [],
        loadEomCountExceptions: async () => ({}),
        loadQsrFob: async () => [],
        loadEomPeriods: async () => [],
        loadEomDiagConfig: async () => null,
        loadSelfServeTowerLocs: async () => [],
        loadPmixSalesByItems: async () => ({}),
      };
    });
    const { EOMDashboardPanel } = await import('../views/eom-dashboard.js');
    await act(async () => {
      mountEl(h(EOMDashboardPanel, { stores: [], ds: {}, settings: {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Inventory Control (EOM Dashboard) — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 3 — Store One-Pager Generator (store_one_pager_guide)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    const { StoreOnePager } = await import('../views/analytics.js');
    await act(async () => {
      mountEl(h(StoreOnePager, { stores: [], ds: {}, settings: {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Store One-Pager — Panel Guide');
  });
});

// The Food Cost / End-of-Month-mode bugfix (FOBAnalysisPanel was wiring the wrong key,
// eom_dashboard_guide, for its 'eom' mode) is covered by the UPDATED
// dispatch-kb-infoicon-rollout-phase1-2026-11-06.test.js (that's where FOBAnalysisPanel's own
// supabase-mocking pattern already lived) — its 'End of Month mode' test now asserts the
// corrected food_cost_panel key and explicitly asserts the wrong key no longer appears. Not
// duplicated here.
