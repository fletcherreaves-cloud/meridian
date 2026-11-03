// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-02: "refresh knowledge base/help." A dedicated audit (see
// memory/finding-workflow-guide-kb-staleness-2026-11-02.md) found several in-app references to
// renamed/demoted/retired panels and a hardcoded-people-names issue in App.js's Workflow Guide
// modal and forecast.js's KB_ARTICLES. Per "would this verification still pass if reverted?",
// these mount the real exported components and read the rendered text -- they fail against the
// pre-fix copy, which really did render the stale names/paths.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { KnowledgeBasePanel } from '../engine/forecast.js';

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
  it('points to Planning + names the real Test Kitchen panels, not "Forecasting > Projections"', () => {
    mount();
    openArticle('How to lock projections, what happens when you do');
    expect(container.textContent).toContain('Planning → Monthly tab');
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

describe('Knowledge Base — smart_targets article points to its real current home', () => {
  it('says Planning → Smart Targets tab, not the retired standalone sidebar entry', () => {
    mount();
    openArticle('Data-driven target generation that analyzes your historical performance');
    expect(container.textContent).toContain('Planning → Smart Targets tab');
    expect(container.textContent).not.toContain('Sidebar → 🎯 Smart Targets');
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
