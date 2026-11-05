// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-05: Daily Brief (src/features/morning-brief.js) --
// the single highest-traffic panel in the app, had zero dedicated Panel Guide article (only a
// one-line mention in panel_index). Added `morning_brief_guide` to KB_ARTICLES
// (src/engine/forecast.js), verified against the real 12-entry MORNING_RULES array (not the
// stale "9 rules" the panel's own subtitle string still shows) and the manual-first (not
// auto-first) sourcing of assembleBriefStoreData()'s headline fields.
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

const SUMMARY_MATCH = "The district's daily correlation/anomaly scan";

describe('Knowledge Base — new morning_brief_guide article (task #75)', () => {
  it('is findable and names the real rule count (12), flagging the stale "9 rules" subtitle', () => {
    mount();
    openArticle(SUMMARY_MATCH);
    expect(container.textContent).toContain('12 rule objects');
    expect(container.textContent).toContain('9 rules');
  });

  it('documents that headline fields are manual-first, the reverse of the standing auto-first rule', () => {
    mount();
    openArticle(SUMMARY_MATCH);
    expect(container.textContent).toContain('does NOT cleanly follow the app-wide auto/emailed-first');
    expect(container.textContent).toContain('REVERSE of the standing rule');
  });

  it("distinguishes this panel's own rules engine from Priority/Intelligence Brief's shared findings array", () => {
    mount();
    openArticle(SUMMARY_MATCH);
    expect(container.textContent).toContain('a different engine from Priority Brief');
  });
});
