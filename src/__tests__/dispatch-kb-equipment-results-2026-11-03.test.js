// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-03: Equipment Results (src/views/equipment-results.js,
// shipped this same session under tasks #56-58 -- PQRG equipment-settings reference, survey link
// management, results landing panel) had no KB coverage at all. Added `equipment_results_guide`
// to KB_ARTICLES (src/engine/forecast.js). Facts verified live via service-role REST reads before
// writing anything (per the "measure, don't reason" standing rule): equipment_catalog_settings
// has 240 real rows (content-range: 0-0/240), equipment_survey_entries has the settings_reviewed
// column (200 on a select, not 42703), and equipment_survey_entries itself has 0 rows today --
// so "a store with zero items just hasn't been walked yet" is a measured fact, not a guess.
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

describe('Knowledge Base — new equipment_results_guide article (task #75)', () => {
  it('is findable and describes the two real halves of the panel', () => {
    mount();
    openArticle('Survey-link management plus a cross-store rollup');
    expect(container.textContent).toContain('Link management');
    expect(container.textContent).toContain('Cross-store results rollup');
  });

  it('names the PQRG settings reference and explains a zero-item store is expected, not an error', () => {
    mount();
    openArticle('Survey-link management plus a cross-store rollup');
    expect(container.textContent).toContain('Pocket Quality Reference Guide (PQRG)');
    expect(container.textContent).toContain('a store with zero items simply hasn\'t been walked yet');
  });
});
