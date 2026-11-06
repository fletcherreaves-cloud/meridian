// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-06 batch 12: first pass at the
// kind:'hub-tab'/'internal' panel-registry.js tier. 28 of 32 real entries turned out to
// already be covered under a different name by an existing nav-parent article; these 4 were
// genuinely uncovered under any name. See memory/finding-kb-panel-guide-2026-11-03.md's batch
// 12 section for the full measurement.
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

describe('Knowledge Base — review_target_overrides_guide (task #75)', () => {
  it('is findable and explains the override precedence cascade', () => {
    mount();
    openArticle('Targets Editor — Panel Guide');
    expect(container.textContent).toContain('Store override > Patch override > State override > Company override');
  });

  it('distinguishes itself from the Monthly & Yearly Targets grids', () => {
    mount();
    openArticle('Targets Editor — Panel Guide');
    expect(container.textContent).toContain('Do not confuse this with the Monthly & Yearly Targets grids');
  });
});

describe('Knowledge Base — performance_calculator_guide (task #75)', () => {
  it('is findable and explains the throughput formula', () => {
    mount();
    openArticle('Performance Calc — Panel Guide');
    expect(container.textContent).toContain('cars/hour = 3600 / (OEPE + 30s order time + 5s safety gap)');
  });

  it('states it shares nothing with the review-scoring engine', () => {
    mount();
    openArticle('Performance Calc — Panel Guide');
    expect(container.textContent).toContain('does not import or diverge from');
  });
});

describe('Knowledge Base — calendar_manager_guide (task #75)', () => {
  it('is findable and explains the three internal tabs', () => {
    mount();
    openArticle('Calendar — Panel Guide');
    expect(container.textContent).toContain('🔔 Pending');
    expect(container.textContent).toContain('searchUpcomingEvents');
  });

  it('states nothing writes until a human approves it from Pending', () => {
    mount();
    openArticle('Calendar — Panel Guide');
    expect(container.textContent).toContain('nothing written until a human approves it');
  });
});

describe('Knowledge Base — fcst_accuracy_guide (task #75)', () => {
  it('is findable and lists the six model columns', () => {
    mount();
    openArticle('Forecast Accuracy — Panel Guide');
    expect(container.textContent).toContain('Sched Proj');
    expect(container.textContent).toContain('Dialed-In');
  });

  it('states this is a live backtest, not a cached report', () => {
    mount();
    openArticle('Forecast Accuracy — Panel Guide');
    expect(container.textContent).toContain('This is a live backtest, not a cached report');
  });
});

describe('Knowledge Base — events_guide pill-list correction (task #75)', () => {
  it('names the real Calendar pill instead of the stale "Full ledger" substitute', () => {
    mount();
    openArticle('Events — Panel Guide');
    expect(container.textContent).toContain('Calendar (the month-grid Calendar Manager');
  });
});
