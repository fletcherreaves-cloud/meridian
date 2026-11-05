// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-05: Pricing Engine (src/views/pricing-engine.js /
// src/engine/pricing-engine.js) had zero KB coverage. Added `pricing_engine_guide` to
// KB_ARTICLES (src/engine/forecast.js), verified against the real MAX(price)-per-day rule,
// the 5 real tabs, and simulatePriceImpact's own constant-volume comment.
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

describe('Knowledge Base — new pricing_engine_guide article (task #75)', () => {
  it('is findable and names all 5 real tabs', () => {
    mount();
    openArticle('Per-item margin (menu price vs. food + paper cost)');
    expect(container.textContent).toContain('Rankings');
    expect(container.textContent).toContain('Item Lookup');
    expect(container.textContent).toContain('Cross-Store');
    expect(container.textContent).toContain('Price Impact');
    expect(container.textContent).toContain('Menu Prices');
  });

  it('explains the MAX(price)-per-day rule, not an average', () => {
    mount();
    openArticle('Per-item margin (menu price vs. food + paper cost)');
    expect(container.textContent).toContain('MAX(price)');
  });

  it('flags Price Impact as holding volume constant, not a demand forecast', () => {
    mount();
    openArticle('Per-item margin (menu price vs. food + paper cost)');
    expect(container.textContent).toContain('holds volume constant');
    expect(container.textContent).toContain('not a demand-elasticity forecast');
  });
});
