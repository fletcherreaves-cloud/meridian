// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-04: Graded Visits (src/views/graded-visits.js) --
// the real CFV/RGR/EcoSure visit history -- had zero KB coverage despite being named directly in
// the GM/Supervisor routines (memory/plan-role-based-panel-gating-2026-11-03.md) and being the
// ground truth Visit Readiness's predictions get checked against. Added `graded_visits_guide` to
// KB_ARTICLES (src/engine/forecast.js), verified against the real parseGradedVisit/
// parseEcoSureVisit polymorphic report_type shape and the PeakDetailBlock comment-only default.
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

describe('Knowledge Base — new graded_visits_guide article (task #75)', () => {
  it('is findable and distinguishes itself from the predictive Visit Readiness score', () => {
    mount();
    openArticle('The real PACE/CFV/RGR/EcoSure graded-visit history');
    expect(container.textContent).toContain('Visit Readiness');
    expect(container.textContent).toContain('ground truth');
  });

  it('describes the real CFV pass threshold and the EcoSure polymorphic shape', () => {
    mount();
    openArticle('The real PACE/CFV/RGR/EcoSure graded-visit history');
    expect(container.textContent).toContain('80%');
    expect(container.textContent).toContain('pointsReceived');
  });
});
