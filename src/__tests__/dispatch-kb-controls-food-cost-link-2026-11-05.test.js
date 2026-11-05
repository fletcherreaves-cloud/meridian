// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-05: Controls <-> Food Cost Linkage
// (src/views/controls-food-cost-link.js / src/engine/controls-food-cost-link.js) had zero KB
// coverage. Added `controls_food_cost_link_guide` to KB_ARTICLES (src/engine/forecast.js),
// verified against the real monthBounds/monthsInRange calendar-month resolution and
// metricValueForRange sourcing.
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

describe('Knowledge Base — new controls_food_cost_link_guide article (task #75)', () => {
  it('is findable and explains the calendar-month alignment', () => {
    mount();
    openArticle('monthly food-cost ratios shown side by side');
    expect(container.textContent).toContain('same whole calendar months');
  });

  it('states a blank cell is a real "not reported" fact, not an error', () => {
    mount();
    openArticle('monthly food-cost ratios shown side by side');
    expect(container.textContent).toContain('not a crash or a dropped row');
  });

  it('frames the disconnect between the two families as the point of the report', () => {
    mount();
    openArticle('monthly food-cost ratios shown side by side');
    expect(container.textContent).toContain('DISCONNECT');
  });
});
