// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-05: Daily Brief (src/features/morning-brief.js) --
// the single highest-traffic panel in the app, had zero dedicated Panel Guide article (only a
// one-line mention in panel_index). Added `morning_brief_guide` to KB_ARTICLES
// (src/engine/forecast.js), verified against the real 12-entry MORNING_RULES array.
//
// Updated same day, same session: the article originally documented a real manual-first
// sourcing bug in assembleBriefStoreData() (and the then-still-stale "9 rules" subtitle) as a
// live problem. Both were fixed in the same session (see src/features/morning-brief.js and
// App.js's subtitle string) -- the article and this test were updated together so neither goes
// stale the moment the code it describes changes underneath it.
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

describe('Knowledge Base — morning_brief_guide article (task #75, updated for the sourcing fix)', () => {
  it('is findable and names the real rule count (12), with the subtitle fix reflected', () => {
    mount();
    openArticle(SUMMARY_MATCH);
    expect(container.textContent).toContain('12 rule objects');
    expect(container.textContent).toContain('Correlation engine · 12 rules');
  });

  it('documents the sourcing fix as fixed, not as a live problem', () => {
    mount();
    openArticle(SUMMARY_MATCH);
    expect(container.textContent).toContain('Fixed 2026-11-05');
    expect(container.textContent).toContain('metricDaily()');
    expect(container.textContent).not.toContain('does NOT cleanly follow');
  });

  it("distinguishes this panel's own rules engine from Priority/Intelligence Brief's shared findings array", () => {
    mount();
    openArticle(SUMMARY_MATCH);
    expect(container.textContent).toContain('a different engine from Priority Brief');
  });
});
