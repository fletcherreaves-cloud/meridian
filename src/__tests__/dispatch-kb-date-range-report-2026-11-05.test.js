// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-05: Date-Range Report (DateRangeReport,
// src/views/analytics.js) had zero KB coverage. Added `date_range_report_guide` to KB_ARTICLES
// (src/engine/forecast.js), verified against the real metricSeries()-based auto-first sourcing
// and the Ops Score / Ctrl Score columns' NOT being date-range-scoped (a genuine UX trap, read
// straight off the store's current standing score regardless of the picked historical range).
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

describe('Knowledge Base — new date_range_report_guide article (task #75)', () => {
  it('is findable and confirms it correctly follows the auto/emailed-first sourcing rule', () => {
    mount();
    openArticle('An ad-hoc, any-dates');
    expect(container.textContent).toContain("correctly follows the app's auto/emailed-first");
    expect(container.textContent).toContain('metricSeries(ds, loc, range, metric)');
  });

  it('flags that Ops Score / Ctrl Score are NOT scoped to the picked date range', () => {
    mount();
    openArticle('An ad-hoc, any-dates');
    expect(container.textContent).toContain('NOT scoped to the picked date range at all');
  });

  it('explains vs LY%/vs Forecast% are live-recomputed from forecastDay(), not a stored figure', () => {
    mount();
    openArticle('An ad-hoc, any-dates');
    expect(container.textContent).toContain('live-computed, not read from any stored or uploaded figure');
  });
});
