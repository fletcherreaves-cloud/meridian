// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-08: a fresh gap audit (panel-registry.js's 132
// panel ids cross-referenced against KB_ARTICLES' keys) found the `proj` (Projections) and
// `workflow` (Workflow Guide) nav panels had zero KB coverage. Along the way, found something
// more urgent: Projections, Proj vs Actuals, and DI Calibration were promoted out of Test
// Kitchen into the real sidebar the night before (v5.685, commit f9f932f5) -- and
// locked_projections/planning_hub/pvsa/di_calibration_panel's own "Access:" copy, plus the
// Workflow Guide modal's hardcoded lock steps, still said "Test Kitchen" everywhere. Fixed all
// of it in the same pass. Per "would this verification still pass if reverted?": every
// assertion below fails against the pre-fix copy, which really did say Test Kitchen for a panel
// that had already moved out of it.
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

describe('Knowledge Base — new proj article (task #75)', () => {
  it('is findable and explains the lock/approve ownership gate', () => {
    mount();
    openArticle('Projections — Panel Guide');
    expect(container.textContent).toContain('Projections & Targets owner');
    expect(container.textContent).toContain('DO/VP and above, or a user explicitly granted ownership');
  });

  it('distinguishes a locked value from a plain override', () => {
    mount();
    openArticle('Projections — Panel Guide');
    expect(container.textContent).toContain('Double-click any cell to override');
    expect(container.textContent).toContain('Lock');
    expect(container.textContent).toContain('Approve');
  });
});

describe('Knowledge Base — new workflow article (task #75)', () => {
  it('is findable and describes the DAILY/WEEKLY/MONTHLY cadence', () => {
    mount();
    openArticle('Workflow Guide');
    expect(container.textContent).toContain('DAILY');
    expect(container.textContent).toContain('WEEKLY');
    expect(container.textContent).toContain('MONTHLY');
  });

  it('states WEEKLY/MONTHLY are hidden for single-store roles', () => {
    mount();
    openArticle('Workflow Guide');
    expect(container.textContent).toContain('level 5+');
  });
});

describe('Knowledge Base — locked_projections/pvsa/di_calibration_panel no longer send users to Test Kitchen (promoted out, v5.685)', () => {
  it('locked_projections points to the real sidebar, not Test Kitchen', () => {
    mount();
    openArticle('How to lock projections, what happens when you do');
    expect(container.textContent).toContain('Forecasting and Labor Projections');
    expect(container.textContent).not.toContain('⚗ Test Kitchen → ▦ Projections');
    expect(container.textContent).not.toContain('⚗ Test Kitchen → ◑ Proj vs Actuals');
  });

  it('pvsa (Proj vs Actuals) article Access line no longer says Test Kitchen', () => {
    mount();
    openArticle('Proj vs Actuals — Forecast Backtest Report');
    expect(container.textContent).toContain('Forecasting and Labor Projections');
    expect(container.textContent).not.toContain('⚗ Test Kitchen → ◑ Proj vs Actuals');
  });

  it('di_calibration_panel article Access line no longer says Test Kitchen', () => {
    mount();
    openArticle('DI Calibration — Panel & Workflow');
    expect(container.textContent).toContain('Forecasting and Labor Projections');
    expect(container.textContent).not.toContain('⚗ Test Kitchen → ◎ DI Calibration');
  });

  it('panel_index lists Projections/Proj vs Actuals/DI Calibration under a real Forecasting section, not Test Kitchen', () => {
    mount();
    openArticle('A live map of every Meridian panel');
    expect(container.textContent).toContain('FORECASTING AND LABOR PROJECTIONS');
    expect(container.textContent).toContain('Promoted out of Test Kitchen (v5.685)');
    expect(container.textContent).not.toContain('A forecast/diagnostic lab: Projections, Proj vs Actuals');
  });
});

describe('Knowledge Base — security_guide duplicate removed (security_panel_guide is the real, wired article)', () => {
  it('only one "Security — Panel Guide" article exists, and it is the subject-grouped one actually wired to the Security panel', () => {
    mount();
    const matches = [...container.querySelectorAll('div')].filter(d => d.textContent.trim() === 'Security — Panel Guide');
    expect(matches.length).toBe(1);
  });
});
