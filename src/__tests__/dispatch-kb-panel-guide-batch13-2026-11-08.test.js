// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), batch 13 — 2026-11-08.
//
// Re-measured the real gap before picking this batch (grep `articleKey:\s*'...'` across
// src/app/App.js, src/views/*.js, src/features/*.js, cross-checked against the 117 real
// `KB_ARTICLES` keys): 55 wired, 62 unwired. Wired 15 more, each matched by reading its real
// mount point against the article's own content (not guessed from the key name):
// proj, workflow, pvsa, di_calibration_panel, planning_hub, scheduling_hub, panel_manager_guide,
// date_range_report_guide, targets_editor, home_at_a_glance, store_dashboard_overview,
// shift_analysis_tab, why_engine_guide, gm_letters, smart_targets.
//
// Four of those (proj, pvsa, di_calibration_panel, date_range_report_guide) use the
// "shell lives at the App.js routePanel/modal gate, not inside the mounted sub-component"
// pattern (same pattern security_panel_guide's own wiring used) — verified correct by reading
// the diff, but not given a dedicated render test here, matching that same precedent
// (memory/finding-kb-panel-guide-2026-11-03.md's "2026-11-07 — security-panel.js written AND
// wired" entry: "verification shape ... local build + full suite, no new test"), since mounting
// them meaningfully means mounting the App.js routing shell itself, not the sub-component.
//
// The other 11 keys wire an InfoIcon directly inside an exported, independently-mountable
// component, so each gets a real render-level test here per CLAUDE.md's "would this
// verification still pass if reverted?" rule — mounts the ACTUAL panel, clicks the real "?"
// InfoIcon control, and asserts the real article title appears. Reverting any one wiring
// (removing its InfoIcon call) makes that panel's "?" control vanish and its test fails.
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

function clickInfoIcon() {
  const icon = container.querySelector('span[title^="Click for details"]');
  expect(icon, 'InfoIcon "?" control not found').toBeTruthy();
  act(() => { icon.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('InfoIcon rollout batch 13 (2026-11-08)', () => {
  it('Workflow Guide (workflow)', async () => {
    const { WorkflowGuidePanel } = await import('../app/App.js');
    mountEl(h(WorkflowGuidePanel, { userRole: 'owner', orgRoles: null, onClose: () => {}, onStartTour: () => {} }));
    clickInfoIcon();
    expect(container.textContent).toContain('Workflow Guide');
  });

  it('Planning Hub (planning_hub)', async () => {
    const { PlanningHubPanel } = await import('../app/App.js');
    mountEl(h(PlanningHubPanel, { ds: {}, stores: [], settings: {}, onClose: () => {} }));
    clickInfoIcon();
    expect(container.textContent).toContain('Planning Hub — Targets, Monthly, Pace, Yearly, Smart');
  });

  it('Scheduling Hub (scheduling_hub)', async () => {
    const { SchedulingHubPanel } = await import('../app/App.js');
    mountEl(h(SchedulingHubPanel, { ds: { schedRows: [], jobHours: [] }, stores: [{ loc: '6838' }], settings: {}, perm: () => true, onClose: () => {} }));
    clickInfoIcon();
    expect(container.textContent).toContain('Scheduling Hub');
  });

  it('Panel Manager (panel_manager_guide)', async () => {
    const logAppAccessMock = vi.fn().mockResolvedValue({ error: null });
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, logAppAccess: (...args) => logAppAccessMock(...args) };
    });
    const { PanelManagerPanel } = await import('../app/App.js');
    mountEl(h(PanelManagerPanel, { vis: {}, onToggle: () => {}, onShowAll: () => {}, onHideAll: () => {}, onClose: () => {} }));
    clickInfoIcon();
    expect(container.textContent).toContain('Panel Manager — Panel Guide');
  });

  it('GM Letters (gm_letters) — no-data empty state', async () => {
    const { GMCoachingBrief } = await import('../engine/coaching.js');
    mountEl(h(GMCoachingBrief, { stores: [], ds: {}, settings: {}, userEvents: {}, onClose: () => {} }));
    clickInfoIcon();
    expect(container.textContent).toContain('GM Letters — AI Coaching Letters');
  });

  it('Smart Targets (smart_targets)', async () => {
    vi.doMock('../lib/supabase.js', () => ({
      loadDailySales: vi.fn().mockResolvedValue([]),
      loadGlimpse: vi.fn().mockResolvedValue([]),
      loadQsrFob: vi.fn().mockResolvedValue([]),
      loadQsrActSummary: vi.fn().mockResolvedValue([]),
      loadSmartTargetAdjustments: vi.fn().mockResolvedValue({}),
      saveSmartTargetAdjustment: vi.fn(),
      applyOfficialTargets: vi.fn(),
    }));
    const { SmartTargetsPanel } = await import('../views/smart-targets.js');
    await act(async () => {
      mountEl(h(SmartTargetsPanel, { ds: {}, stores: [{ loc: '3708' }], settings: {}, onClose: () => {}, embedded: true }));
      await new Promise(r => setTimeout(r, 0));
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Smart Target Engine — How It Works');
  });

  it('Home / At A Glance (home_at_a_glance)', async () => {
    const { AtAGlance } = await import('../views/at-a-glance.js');
    const NOOP = () => {};
    const day = n => new Date(2026, 7, n, 12);
    await act(async () => {
      mountEl(h(AtAGlance, {
        stores: [{ loc: '10422' }], ds: { loaded: true }, settings: { weekStartDay: 3 },
        userEvents: [], lockedProjections: {}, dateRange: { s: day(1), e: day(16), label: 'MTD' },
        onOpenStore: NOOP, onCoachingSaved: NOOP, onOpenProjections: NOOP,
        onOpenPVSA: NOOP, onOpenBrief: NOOP, onNav: NOOP, onOpenModal: NOOP,
      }));
      await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Home / At A Glance — Reading the District Home Screen');
  });

  it('Why Engine (why_engine_guide) — no-data empty state', async () => {
    const { WhyEnginePanel } = await import('../views/analytics.js');
    mountEl(h(WhyEnginePanel, { stores: [], ds: { loaded: false }, settings: {}, userEvents: {}, onUpdate: () => {}, onClose: () => {} }));
    clickInfoIcon();
    expect(container.textContent).toContain('Why Engine — Root-Cause Analysis for Forecast Misses');
  });

  it('Why Engine (why_engine_guide) — loaded state', async () => {
    const { WhyEnginePanel } = await import('../views/analytics.js');
    mountEl(h(WhyEnginePanel, { stores: [], ds: { loaded: true }, settings: {}, userEvents: {}, onUpdate: () => {}, onClose: () => {} }));
    clickInfoIcon();
    expect(container.textContent).toContain('Why Engine — Root-Cause Analysis for Forecast Misses');
  });

  it('Shift Analysis Tab (shift_analysis_tab), within Store Dashboard', async () => {
    const { ShiftAnalysisTab } = await import('../views/store-analytics.js');
    mountEl(h(ShiftAnalysisTab, { store: { p: {}, t: {}, loc: '0001' }, ds: { loaded: true }, settings: {}, userEvents: {} }));
    clickInfoIcon();
    expect(container.textContent).toContain('Shift Analysis Tab — Day-of-Week, Channel Mix, and Peak-Hour Labor');
  });

  it('Store Dashboard Overview tab (store_dashboard_overview)', async () => {
    vi.doMock('../engine/forecast.js', async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, forecastRangeAsync: (loc, s, e, ds, settings, onPartial, onFinal) => { onFinal([]); } };
    });
    const { StoreDash } = await import('../views/store-analytics.js');
    const store = {
      loc: '99999', name: 'Test Store',
      p: { laborPct: 0.28, oepe: 175, tpph: 92, _cov: {} },
      t: { tOepe: 180, tTpph: 90, tCrewLabor: 0.30 },
      opsScore: 78, ctrlScore: 82, findings: [],
    };
    const dateRange = { s: new Date(Date.now() + 7 * 864e5), e: new Date(Date.now() + 14 * 864e5) }; // future -- skips weather fetch
    await act(async () => {
      mountEl(h(StoreDash, {
        store, ds: { loaded: true, laborRows: [] }, settings: {}, allStores: [store],
        onBack: () => {}, onNav: () => {}, dateRange, userEvents: {}, onUpdateSettings: () => {},
      }));
      await Promise.resolve(); await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Store Dashboard — Overview Tab');
  });

  it('Monthly Targets (targets_editor), Monthly Projections header', async () => {
    vi.doMock('../lib/supabase.js', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        listMonthlyTargetPeriods: () => Promise.resolve([]),
        loadMonthlyTargets: () => Promise.resolve({}),
        loadCustomMetricTargets: () => Promise.resolve({}),
      };
    });
    const { MonthlyProjectionsPanel } = await import('../views/analytics.js');
    await act(async () => {
      mountEl(h(MonthlyProjectionsPanel, { ds: {}, stores: [], settings: {}, onClose: () => {}, canOwnProjections: true }));
      await Promise.resolve();
    });
    clickInfoIcon();
    expect(container.textContent).toContain('Monthly & Yearly Targets — Panel Guide');
  });

  it('Yearly Targets (targets_editor), Target Categories tab only (not Sales Pace)', async () => {
    vi.doMock('../lib/supabase.js', () => ({ loadDailySales: () => Promise.resolve([]), loadCustomMetricTargets: () => Promise.resolve({}) }));
    const { YearlyProjectionsPanel } = await import('../views/yearly-projections.js');
    await act(async () => {
      mountEl(h(YearlyProjectionsPanel, { ds: {}, stores: [], settings: {}, onClose: () => {}, embedded: true, canOwnProjections: true }));
    });
    // Sales Pace is the default view -- no icon yet (that tab has its own, already-covered content).
    expect(container.querySelector('span[title^="Click for details"]')).toBeFalsy();
    const targetsTabBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Target Categories'));
    expect(targetsTabBtn, 'Target Categories tab button not found').toBeTruthy();
    await act(async () => { targetsTabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    clickInfoIcon();
    expect(container.textContent).toContain('Monthly & Yearly Targets — Panel Guide');
  });
});
