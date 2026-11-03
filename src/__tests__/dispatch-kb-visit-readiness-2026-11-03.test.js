// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-03: Visit Readiness is a shipped, significant
// feature (v4.501, src/engine/visit-readiness.js) that was never covered by the original
// 20-article Panel Guide batch (PR #1631). Added `visit_readiness_guide` to KB_ARTICLES
// (src/engine/forecast.js), matching the batch's house style and the real weights
// (READINESS_WEIGHTS: speed .35/accuracy .30/quality .20/leadership .15) and the real
// EcoSure-vs-proxy food-safety behavior documented in CLAUDE.md's Panels & Modules table.
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

describe('Knowledge Base — new visit_readiness_guide article (task #75)', () => {
  it('is findable and states the real sub-score weights', () => {
    mount();
    openArticle('Per-store predicted PACE graded-visit readiness');
    expect(container.textContent).toContain('Speed 35%');
    expect(container.textContent).toContain('Accuracy 30%');
    expect(container.textContent).toContain('Quality 20%');
    expect(container.textContent).toContain('Leadership 15%');
  });

  it('describes top risk drivers and keeps food-safety status out of the composite', () => {
    mount();
    openArticle('Per-store predicted PACE graded-visit readiness');
    expect(container.textContent).toContain('top risk drivers');
    expect(container.textContent).toContain('kept OUT of the readiness composite');
  });
});
