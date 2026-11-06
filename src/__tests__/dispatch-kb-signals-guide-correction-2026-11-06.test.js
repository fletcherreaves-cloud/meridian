// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base), content correction (2026-11-06): the batch-12 KB sweep flagged
// signals_guide as substantially stale — its own "Several tabs" list named only 5 (LiveOps,
// Baseline Anomalies, Speed of Service, Signal Lab, Scanner) against the real 10-tab bar in
// src/views/signals.js (Live Ops / Projection Accuracy / Park × OEPE / Store Controls / Built-in
// / Signal Lab / Scanner / Correlations / CSAT Drivers / Graveyard). Two of the old 5 weren't
// even real top-level tabs: Baseline Anomalies is a strip rendered inside Live Ops, and Speed of
// Service is a completely separate panel (dt-speedofservice.js, its own speed_of_service_guide
// article) that Signals never contained. See
// memory/finding-kb-panel-guide-2026-11-03.md's batch-12 section for the original finding and
// the "2026-11-06 content correction" section this fix adds.
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

describe('Knowledge Base — signals_guide correction (task #75)', () => {
  it('names all 10 real tabs, including the 5 the old article omitted', () => {
    mount();
    openArticle('Signals — Live Alerts and Correlation Discovery');
    expect(container.textContent).toContain('Projection Accuracy');
    expect(container.textContent).toContain('Park × OEPE');
    expect(container.textContent).toContain('Store Controls');
    expect(container.textContent).toContain('Correlations');
    expect(container.textContent).toContain('CSAT Drivers');
    expect(container.textContent).toContain('Graveyard');
  });

  it('places Baseline Anomalies correctly inside Live Ops and excludes Speed of Service as a tab', () => {
    mount();
    openArticle('Signals — Live Alerts and Correlation Discovery');
    expect(container.textContent).toContain('inside this same tab, not a separate one');
    expect(container.textContent).toContain('Speed of Service itself is a separate panel with its own KB article');
  });
});
