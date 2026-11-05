// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-05: Inventory Control / EOM Dashboard
// (src/views/eom-dashboard.js) -- the all-stores End-Of-Month close hub, had zero KB coverage.
// Added `eom_dashboard_guide` to KB_ARTICLES (src/engine/forecast.js), verified against the real
// count-window domain (eom-inventory.js header comment) and the 5 folded-in report tabs.
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

describe('Knowledge Base — new eom_dashboard_guide article (task #75)', () => {
  it('is findable and explains the 3-day count window domain', () => {
    mount();
    openArticle('The all-stores End-Of-Month close hub');
    expect(container.textContent).toContain('last 3 calendar days of the month');
  });

  it('names the 5 folded-in report tabs', () => {
    mount();
    openArticle('The all-stores End-Of-Month close hub');
    expect(container.textContent).toContain('Supervisor Rollup');
    expect(container.textContent).toContain('Count Cycle');
    expect(container.textContent).toContain('Missing Items Report');
    expect(container.textContent).toContain('Team Snapshot');
    expect(container.textContent).toContain('Recount Impact');
  });

  it('states FOB is Food + Condiment only, not total food cost', () => {
    mount();
    openArticle('The all-stores End-Of-Month close hub');
    expect(container.textContent).toContain('Food + Condiment classes only');
  });
});
