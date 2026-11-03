// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-03: Data Manager (src/views/analytics.js's
// DataManagerPanel) is the single most-used panel in the app -- it's literally step 1 of the
// in-app Workflow Guide's DAILY cadence -- and had zero KB coverage. Added `data_manager_guide`
// to KB_ARTICLES (src/engine/forecast.js), describing the real manual-upload + on-demand-Sync
// split and the standing "auto/emailed-first, freshest-wins" sourcing rule (CLAUDE.md Dev Rules),
// verified against the real SYNC_LABEL map and auto-synced-row rendering in analytics.js rather
// than guessed.
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

describe('Knowledge Base — new data_manager_guide article (task #75)', () => {
  it('is findable and describes both manual upload and on-demand Sync', () => {
    mount();
    openArticle('The daily data-loading hub');
    expect(container.textContent).toContain('Manual upload');
    expect(container.textContent).toContain('On-demand Sync');
  });

  it('states the standing auto/emailed-first, freshest-wins sourcing rule', () => {
    mount();
    openArticle('The daily data-loading hub');
    expect(container.textContent).toContain('Auto/emailed-first, freshest-wins');
    expect(container.textContent).toContain('never override auto/emailed data');
  });
});
