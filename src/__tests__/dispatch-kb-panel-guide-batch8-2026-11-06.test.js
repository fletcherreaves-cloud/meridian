// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-06 batch 8: 6 more real, traffic-relevant nav
// panels -- Events, Market Intelligence, Cash Variance Pattern, Metric Lineage, District Lens,
// Pay Rate History. Picked by a fresh direct panel-registry.js sweep (the GM-routine and
// Supervisor-tier named sources are both exhausted as of batch 7). Each verified against its
// own real source file before writing, per this repo's "measure, don't reason" standing rule.
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

describe('Knowledge Base — events_guide (task #75)', () => {
  it('is findable and explains it shares the same write path as Quick-Capture/SAGE', () => {
    mount();
    openArticle('Events — Panel Guide');
    expect(container.textContent).toContain('saveOrgEvents()');
    expect(container.textContent).toContain('log_event');
  });

  it('explains Upcoming vs Log split by the visibility field and the confidence glyph', () => {
    mount();
    openArticle('Events — Panel Guide');
    expect(container.textContent).toContain('visibility');
    expect(container.textContent).toContain('confidence glyph');
  });
});

describe('Knowledge Base — loc_intel_guide (task #75)', () => {
  it('is findable and explains the live Pearson-r statistical mode', () => {
    mount();
    openArticle('Market Intelligence — Panel Guide');
    expect(container.textContent).toContain('pearsonR()');
    expect(container.textContent).toContain('ACS5');
  });

  it('states the AI narrative only talks about already-computed figures', () => {
    mount();
    openArticle('Market Intelligence — Panel Guide');
    expect(container.textContent).toContain('callSageOnce()');
    expect(container.textContent).toContain('frame opportunities positively');
  });
});

describe('Knowledge Base — cash_variance_pattern_guide (task #75)', () => {
  it('is findable and explains there is no register-level data and no built-in flag threshold', () => {
    mount();
    openArticle('Cash Variance Pattern — Panel Guide');
    expect(container.textContent).toContain('register-NUMBER field');
    expect(container.textContent).toContain('DELIBERATELY NO built-in');
  });

  it('states the minimum 3-observed-day bucket requirement', () => {
    mount();
    openArticle('Cash Variance Pattern — Panel Guide');
    expect(container.textContent).toContain('3 observed days');
  });
});

describe('Knowledge Base — metric_lineage_guide (task #75)', () => {
  it('is findable and explains the 100% transparency directive', () => {
    mount();
    openArticle('Metric Lineage — Panel Guide');
    expect(container.textContent).toContain('100% transparency, no black-box numbers');
    expect(container.textContent).toContain('METRIC_SOURCES');
  });

  it('states hand-curated entries coexist with auto-synthesized ones', () => {
    mount();
    openArticle('Metric Lineage — Panel Guide');
    expect(container.textContent).toContain('hand-curated');
    expect(container.textContent).toContain('Calculated');
  });
});

describe('Knowledge Base — district_lens_guide (task #75)', () => {
  it('is findable and explains the real Pearson-r heatmap over a 90-day window', () => {
    mount();
    openArticle('District Lens — Panel Guide');
    expect(container.textContent).toContain('Pearson-r');
    expect(container.textContent).toContain('last CLOSED business day');
  });

  it('states the opportunity ranking weighs gap from the district average', () => {
    mount();
    openArticle('District Lens — Panel Guide');
    expect(container.textContent).toContain('gap from the district average');
  });
});

describe('Knowledge Base — pay_rate_history_guide (task #75)', () => {
  it('is findable and explains the straight-time vs blended rate-basis distinction', () => {
    mount();
    openArticle('Pay Rate History — Panel Guide');
    expect(container.textContent).toContain('straight-time');
    expect(container.textContent).toContain('blended');
  });

  it('states wage-data views are access-logged', () => {
    mount();
    openArticle('Pay Rate History — Panel Guide');
    expect(container.textContent).toContain('app_access_log');
    expect(container.textContent).toContain('ASSUMED_MANAGEMENT_WEEKLY_HOURS');
  });
});
