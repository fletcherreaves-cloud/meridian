// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-04: Labor Analysis (src/views/labor-analysis.js)
// -- the weekly Fixed/Floor/VLH labor plan named directly in the GM/Supervisor routine ("Review
// Labor Analysis Report") -- had zero KB coverage; Scheduling Hub's own article only gives it a
// one-line mention. Added `labor_analysis_guide` to KB_ARTICLES (src/engine/forecast.js),
// verified against the real auto-first/manual-gap-fill source chip and the FLH worksheet print.
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

describe('Knowledge Base — new labor_analysis_guide article (task #75)', () => {
  it('is findable and states the auto-first, manual-gap-fill-only sourcing rule', () => {
    mount();
    openArticle('The weekly Fixed/Floor/VLH labor plan');
    expect(container.textContent).toContain('lifelenz_schedule');
    expect(container.textContent).toContain('never overrides it');
  });

  it('distinguishes this weekly planning tool from Scheduling Hub\'s Labor Analytics tab', () => {
    mount();
    openArticle('The weekly Fixed/Floor/VLH labor plan');
    expect(container.textContent).toContain('FLH Worksheet');
    expect(container.textContent).toContain('Labor Analytics');
  });
});
