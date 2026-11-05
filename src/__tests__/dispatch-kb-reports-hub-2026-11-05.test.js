// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-05: Reports Hub (src/views/reports-hub.js) had
// zero KB coverage AND was missing entirely from panel_index's own ANALYTICS directory listing
// (confirmed by reading panel_index's real detail string -- it jumped from Task Queue straight
// to Forecast Brief). Added `reports_hub_guide` to KB_ARTICLES (src/engine/forecast.js) plus the
// missing panel_index bullet, in the same pass.
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

describe('Knowledge Base — new reports_hub_guide article (task #75)', () => {
  it('is findable and explains it is a pure navigation layer, not a computation', () => {
    mount();
    openArticle('The categorized index of every report-shaped panel');
    expect(container.textContent).toContain('pure router/index');
    expect(container.textContent).toContain('has no data sourcing of its own');
  });

  it('names the 7 category tabs plus My Reports', () => {
    mount();
    openArticle('The categorized index of every report-shaped panel');
    expect(container.textContent).toContain('Daily & Operations');
    expect(container.textContent).toContain('Sales & Forecasting');
    expect(container.textContent).toContain('Guest Experience');
    expect(container.textContent).toContain('Labor & Payroll');
    expect(container.textContent).toContain('Financial & Promotions');
    expect(container.textContent).toContain('Leadership & Above-Store');
    expect(container.textContent).toContain('Custom Reports');
  });
});

describe('panel_index — Reports Hub gap fix (task #75)', () => {
  it('now names Reports Hub in the ANALYTICS directory, between Task Queue and Forecast Brief', () => {
    mount();
    openArticle('A live map of every Meridian panel');
    const text = container.textContent;
    expect(text).toContain('Reports Hub');
    const taskQueueIdx = text.indexOf('Task Queue');
    const reportsHubIdx = text.indexOf('Reports Hub');
    const forecastBriefIdx = text.indexOf('Forecast Brief');
    expect(taskQueueIdx).toBeGreaterThan(-1);
    expect(reportsHubIdx).toBeGreaterThan(taskQueueIdx);
    expect(forecastBriefIdx).toBeGreaterThan(reportsHubIdx);
  });
});
