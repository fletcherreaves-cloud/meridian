// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-03: the Panel Guide batch (PR #1631) covered 20
// high-traffic panels but never wrote one for the Monthly/Yearly Targets editors -- a real gap
// given #61/#62 (this same session) just turned both from read-only grids into click-to-edit
// ones. Added `targets_editor` to KB_ARTICLES (src/engine/forecast.js). Given how many real
// stale-fact bugs this exact subject (Targets vs. the separate locked_projections system) has
// produced today (see dispatch-workflow-guide-kb-staleness-2026-11-02.test.js), this mounts the
// real KnowledgeBasePanel rather than asserting against the source string, per "would this
// verification still pass if reverted?".
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

describe('Knowledge Base — new targets_editor article (task #75)', () => {
  it('is findable and describes click-to-edit + full-row save, not a workbook-only path', () => {
    mount();
    openArticle('The in-app Monthly and Yearly Targets grids');
    expect(container.textContent).toContain('click any store\'s cell to open an input');
    expect(container.textContent).toContain('writes the WHOLE row');
  });

  it('explicitly states neither grid has a lock mechanic, and points to the real one (promoted out of Test Kitchen, v5.685)', () => {
    mount();
    openArticle('The in-app Monthly and Yearly Targets grids');
    expect(container.textContent).toContain('Neither grid has a lock, double-click-override, or approval mechanic');
    expect(container.textContent).toContain('▦ Projections');
    expect(container.textContent).toContain('Forecasting and Labor Projections');
    expect(container.textContent).not.toContain('Test Kitchen → ▦ Projections');
  });
});
