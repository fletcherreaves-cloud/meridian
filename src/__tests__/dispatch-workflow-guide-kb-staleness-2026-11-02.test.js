// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-02: "refresh knowledge base/help." A dedicated audit (see
// memory/finding-workflow-guide-kb-staleness-2026-11-02.md) found several in-app references to
// renamed/demoted/retired panels and a hardcoded-people-names issue in App.js's Workflow Guide
// modal and forecast.js's KB_ARTICLES. Per "would this verification still pass if reverted?",
// these mount the real exported components and read the rendered text -- they fail against the
// pre-fix copy, which really did render the stale names/paths.
//
// 2026-11-03 correction (surfaced while scoping task #62, Monthly Targets in-app editor): this
// file's own original fix (below) pointed "Lock the weekly/monthly projection" at "Planning ->
// Monthly tab" as an alternate path to Test Kitchen's Projections grid. That was wrong the day it
// was written -- Planning -> Monthly tab is MonthlyProjectionsPanel, the monthly TARGETS editor
// (a different Supabase table, monthly_targets, from locked_projections), and it has no
// lock/double-click-override mechanic at all; only Test Kitchen's Projections grid
// (ProjectionWorkflow, routePanel==='proj') does. Re-fixed here to stop claiming Planning ->
// Monthly tab is a locking path, in both the Workflow Guide modal and the locked_projections KB
// article; see memory/plan-targets-system-2026-11-02.md's "#62 SHIPPED" section for the full
// finding.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { KnowledgeBasePanel } from '../engine/forecast.js';
import { WorkflowGuidePanel } from '../app/App.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
afterEach(() => { act(() => root.unmount()); container.remove(); });

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(React.createElement(KnowledgeBasePanel, { onClose: () => {} })));
}

function openArticle(matchText) {
  const entry = [...container.querySelectorAll('div')]
    .filter(d => d.textContent.includes(matchText)).pop();
  expect(entry, `article matching "${matchText}" not found`).toBeTruthy();
  act(() => { entry.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('Knowledge Base — locked_projections article no longer sends users to a demoted panel as if it were a plain sidebar item', () => {
  it('names Test Kitchen -> Projections as the only lock path, not Planning -> Monthly tab (a separate Targets editor with no lock mechanic)', () => {
    mount();
    openArticle('How to lock projections, what happens when you do');
    expect(container.textContent).toContain('Test Kitchen → ▦ Projections');
    expect(container.textContent).not.toContain('Open Planning → Monthly tab (the day-to-day path)');
    expect(container.textContent).not.toContain('Forecasting > Projections');
    expect(container.textContent).not.toContain('Forecasting > Proj vs Actuals');
  });

  it('says locked projections are cloud-synced via Supabase, not localStorage-only', () => {
    mount();
    openArticle('How to lock projections, what happens when you do');
    expect(container.textContent).toContain('cloud-synced across devices');
    expect(container.textContent).not.toContain('saved to localStorage');
  });
});

describe('Knowledge Base — planning_hub article no longer claims the Monthly/Yearly Targets tabs have a lock/double-click-override mechanic', () => {
  it('Monthly section describes click-to-edit + Excel upload, not double-click-override-and-lock', () => {
    mount();
    openArticle('One panel, five tabs, covering every projection and target workflow');
    expect(container.textContent).toContain('Click any store\'s cell to edit it in place');
    expect(container.textContent).toContain('This tab has no lock or double-click-override mechanic');
    expect(container.textContent).not.toContain('AI-generated forecasts you review, override (double-click a cell), and lock');
  });

  it('Yearly section no longer claims "same locked/override mechanics as Monthly"', () => {
    mount();
    openArticle('One panel, five tabs, covering every projection and target workflow');
    expect(container.textContent).not.toContain('same locked/override mechanics as Monthly');
    expect(container.textContent).toContain('No lock mechanic here either');
  });

  it('names Test Kitchen -> Projections as the real place sales projections get locked', () => {
    mount();
    openArticle('One panel, five tabs, covering every projection and target workflow');
    expect(container.textContent).toContain('Test Kitchen → ▦ Projections');
  });
});

describe('Knowledge Base — smart_targets article points to its real current home', () => {
  it('says Planning → Smart Targets tab, not the retired standalone sidebar entry', () => {
    mount();
    openArticle('Data-driven target generation that analyzes your historical performance');
    expect(container.textContent).toContain('Planning → Smart Targets tab');
    expect(container.textContent).not.toContain('Sidebar → 🎯 Smart Targets');
  });
});

describe('Workflow Guide modal — WEEKLY/MONTHLY "lock the projection" steps no longer claim Planning -> Monthly tab can lock', () => {
  function mountGuide() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(React.createElement(WorkflowGuidePanel, {
      userRole: 'owner', orgRoles: undefined, onClose: () => {}, onStartTour: () => {},
    })));
  }

  it('weekly lock step points to Test Kitchen Projections, not Planning -> Monthly tab', () => {
    mountGuide();
    expect(container.textContent).toContain('1. Lock the weekly projection');
    expect(container.textContent).toContain('Open ▦ Projections in ⚗ Test Kitchen');
    expect(container.textContent).not.toContain('Open Planning → Monthly tab (or ▦ Projections');
  });

  it('monthly lock step points to the Test Kitchen Projections grid, not Planning -> Monthly tab', () => {
    mountGuide();
    expect(container.textContent).toContain('1. Lock the monthly projection');
    expect(container.textContent).toContain('Open the Test Kitchen Projections grid');
    expect(container.textContent).not.toContain('Open Planning → Monthly tab and set the period to Month');
  });
});

describe('Knowledge Base — panel_index article no longer misclassifies optional panels as Test Kitchen', () => {
  it('does not list Anomaly Scan/Why Engine under the Test Kitchen bullet', () => {
    mount();
    openArticle('A live map of every Meridian panel');
    expect(container.textContent).not.toContain('plus AI tools (Anomaly Scan, Why Engine)');
  });

  it('describes Task Queue as the merged list, not two separate panels', () => {
    mount();
    openArticle('A live map of every Meridian panel');
    expect(container.textContent).not.toContain('Feature Requests / Task Queue');
    expect(container.textContent).toContain('Task Queue');
  });
});

describe('Knowledge Base — panel_index article, label/count drift found 2026-11-03 against the live panel-registry.js', () => {
  it('says Events, not the retired "Events & Tags" label', () => {
    mount();
    openArticle('A live map of every Meridian panel');
    expect(container.textContent).toContain('Events — promo / known-event calendar');
    expect(container.textContent).not.toContain('Events & Tags — promo');
  });

  it('says Leaderboards, not "Rankings" (panel-registry.js label for id \'ranking\')', () => {
    mount();
    openArticle('A live map of every Meridian panel');
    expect(container.textContent).toContain('Leaderboards');
    expect(container.textContent).not.toContain('Rankings — rank stores');
  });

  it('says the Scheduling hub has 12 tabs, not 5, and names the 7 tabs the old count missed', () => {
    mount();
    openArticle('A live map of every Meridian panel');
    expect(container.textContent).toContain('12 tabs');
    expect(container.textContent).not.toContain('one hub, five tabs');
    for (const tab of ['Pay Events', 'Schedule Discipline', 'Compliance Audit', 'Employee Performance', 'Labor Allocation', 'Training Retention', 'Retention Rollup']) {
      expect(container.textContent).toContain(tab);
    }
  });

  it('says Above-Store One-Pager, not the retired standalone "Leadership One-Pager" panel (dispatch #190)', () => {
    mount();
    openArticle('A live map of every Meridian panel');
    expect(container.textContent).toContain('Above-Store One-Pager — district/operator rollup');
    expect(container.textContent).not.toContain('Leadership One-Pager — weekly cascade review');
  });
});
