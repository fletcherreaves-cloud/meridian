// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion) — InfoIcon rollout, Phase 2. Phase 1
// (dispatch-kb-infoicon-rollout-phase1-2026-11-06.test.js) wired 5 panels. This phase wires the
// next 13 real RoutePanelShell-backed panels whose title already has a matching KB_ARTICLES key
// — Visit Readiness, Graded Visits, Customer Complaints, Crew Schedule, Task Queue, Pricing
// Engine, Speed of Service, Weekly Count Status, Digital Checklists, Promo/Discount ROI, Trend
// Explorer, Above-Store One-Pager, Local News — picked the same way Phase 1 was: clean, single-
// header `RoutePanelShell` calls, confirmed by reading each file directly rather than assumed.
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
// visible glyph is just "?".
function clickInfoIcon() {
  const icon = container.querySelector('span[title^="Click for details"]');
  expect(icon, 'InfoIcon "?" control not found').toBeTruthy();
  act(() => { icon.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('InfoIcon rollout Phase 2 — Visit Readiness (visit_readiness_guide)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    const { VisitReadinessPanel } = await import('../views/visit-readiness.js');
    await act(async () => {
      mountEl(h(VisitReadinessPanel, { ds: {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Visit Readiness — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 2 — Graded Visits (graded_visits_guide)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, loadGradedVisits: async () => [], saveGradedVisits: async () => {}, loadVisitDAR: async () => ({ hours: [] }) };
    });
    const { GradedVisitsPanel } = await import('../views/graded-visits.js');
    await act(async () => {
      mountEl(h(GradedVisitsPanel, { ds: {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Graded Visits — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 2 — Customer Complaints (customer_complaints_guide)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    const { CustomerComplaintsPanel } = await import('../views/customer-complaints.js');
    await act(async () => {
      mountEl(h(CustomerComplaintsPanel, { ds: { complaintCases: [] }, stores: [], onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Customer Complaints — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 2 — Crew Schedule (crew_schedule_guide)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, loadLifeLenzShiftAssignments: async () => [] };
    });
    const { CrewSchedulePanel } = await import('../views/crew-schedule-panel.js');
    await act(async () => {
      mountEl(h(CrewSchedulePanel, { onClose: () => {}, stores: [] }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Crew Schedule — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 2 — Task Queue (task_queue_guide)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, loadSessionNotes: async () => [], loadTasks: async () => [], loadFeatureRequests: async () => [] };
    });
    const { TaskQueuePanel } = await import('../views/task-queue.js');
    await act(async () => {
      mountEl(h(TaskQueuePanel, { onClose: () => {}, settings: {} }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Task Queue — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 2 — Pricing Engine (pricing_engine_guide)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        loadQsrMenuItemActivitySummary: async () => [],
        loadQsrMenuItemRecipe: async () => [],
        loadQsrProductOutage: async () => [],
        loadQsrMenuPriceComparison: async () => [],
      };
    });
    const { PricingEnginePanel } = await import('../views/pricing-engine.js');
    await act(async () => {
      mountEl(h(PricingEnginePanel, { stores: [], ds: {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Pricing Engine — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 2 — Speed of Service (speed_of_service_guide)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, loadDtHistory: async () => [] };
    });
    const { DTSpeedOfServicePanel } = await import('../views/dt-speedofservice.js');
    await act(async () => {
      mountEl(h(DTSpeedOfServicePanel, { stores: [], onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Speed of Service — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 2 — Weekly Count Status (weekly_count_status_guide)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, loadQsrOnHand: async () => [], loadWeeklyCountDayOverrides: async () => ({}) };
    });
    const { WeeklyCountStatusPanel } = await import('../views/weekly-count-status-report.js');
    await act(async () => {
      mountEl(h(WeeklyCountStatusPanel, { stores: [], ds: {}, settings: {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Weekly Count Status — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 2 — Digital Checklists (digital_checklists_guide)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, loadChecklistSubmission: async () => null, saveChecklistSubmission: async () => {} };
    });
    const { ChecklistFillPanel } = await import('../views/checklist-fill.js');
    await act(async () => {
      mountEl(h(ChecklistFillPanel, { onClose: () => {}, stores: [] }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Digital Checklists — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 2 — Promo / Discount ROI (promo_roi_guide)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    const { PromoRoiPanel } = await import('../views/promo-roi.js');
    await act(async () => {
      mountEl(h(PromoRoiPanel, { ds: {}, userEvents: {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Promo / Discount ROI — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 2 — Trend Explorer (trend_explorer_guide)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    const { TrendExplorerPanel } = await import('../views/trends.js');
    await act(async () => {
      mountEl(h(TrendExplorerPanel, { ds: {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Trend Explorer — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 2 — Above-Store One-Pager (above_store_guide)', () => {
  it('renders the info icon (rollup view) and opens the real article on click', async () => {
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
        loadEomCountStatus: async () => [],
        loadLaborRows: async () => null,
        loadQsrActSummary: async () => null,
      };
    });
    const { AboveStoreOnePager } = await import('../views/above-store-onepager.js');
    await act(async () => {
      mountEl(h(AboveStoreOnePager, { ds: {}, settings: {}, userEvents: {}, eventImpact: {}, onClose: () => {} }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Above-Store One-Pager — Panel Guide');
  });
});

describe('InfoIcon rollout Phase 2 — Local News (news_guide)', () => {
  it('renders the info icon and opens the real article on click', async () => {
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, loadNewsMentions: async () => [] };
    });
    const { NewsPanel } = await import('../views/news-panel.js');
    await act(async () => {
      mountEl(h(NewsPanel, { onClose: () => {}, stores: [] }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Local News — Panel Guide');
  });
});
