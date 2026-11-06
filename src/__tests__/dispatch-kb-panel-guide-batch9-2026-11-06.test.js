// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-06 batch 9: 6 more real, traffic-relevant nav
// panels -- Store Compare, Product Mix, DAR Daypart Analytics, FOB Reference Table, Email
// Digests, Anomaly Scan. Both named plan-doc candidate sources (GM-routine cross-walk,
// Supervisor-tier list) are exhausted as of batches 5/7; picked by a fresh direct
// panel-registry.js sweep (kind:'nav'/'optional', 70 entries) diffed against the 100 existing
// KB_ARTICLES keys. NOTE: the sweep's original 6th pick, 'priority-brief', turned out to already
// be fully covered by the pre-existing `priority_brief` entry -- swapped for the genuinely
// uncovered `fob-reference-table` panel instead. Each verified against its own real source file
// before writing, per this repo's "measure, don't reason" standing rule.
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

describe('Knowledge Base — store_compare_guide (task #75)', () => {
  it('is findable and explains the 2-5 store cap', () => {
    mount();
    openArticle('Store Compare — Panel Guide');
    expect(container.textContent).toContain('2–5 stores');
    expect(container.textContent).toContain('a 6th pick is blocked');
  });

  it('states target-range metrics get no best-value star', () => {
    mount();
    openArticle('Store Compare — Panel Guide');
    expect(container.textContent).toContain('target-range metrics');
  });
});

describe('Knowledge Base — product_mix_dashboard_guide (task #75)', () => {
  it('is findable and explains the lazy-fill Cloud source', () => {
    mount();
    openArticle('Product Mix — Panel Guide');
    expect(container.textContent).toContain('ensureLazyFill');
    expect(container.textContent).toContain('qsr_product_mix');
  });

  it('flags the hand-rolled modal backdrop panel-contract gap', () => {
    mount();
    openArticle('Product Mix — Panel Guide');
    expect(container.textContent).toContain('hand-rolled full-screen backdrop');
    expect(container.textContent).toContain('ModalShell');
  });
});

describe('Knowledge Base — dar_daypart_guide (task #75)', () => {
  it('is findable and distinguishes dar_rows from qsr_daily_activity', () => {
    mount();
    openArticle('DAR Daypart Analytics — Panel Guide');
    expect(container.textContent).toContain('dar_rows');
    expect(container.textContent).toContain('qsr_daily_activity');
  });

  it('states these are two separate datasets, not a contradiction', () => {
    mount();
    openArticle('DAR Daypart Analytics — Panel Guide');
    expect(container.textContent).toContain('two separate datasets');
  });
});

describe('Knowledge Base — fob_reference_table_guide (task #75)', () => {
  it('is findable and explains the cumulative-MTD-to-daily-delta reconstruction', () => {
    mount();
    openArticle('FOB Reference Table — Panel Guide');
    expect(container.textContent).toContain('fobDailyDeltas()');
    expect(container.textContent).toContain('MONTH-TO-DATE CUMULATIVE');
  });

  it('states Projected blends MTD with the L3M average, weighted toward MTD as the month progresses', () => {
    mount();
    openArticle('FOB Reference Table — Panel Guide');
    expect(container.textContent).toContain('weighted more toward MTD as the month progresses');
  });
});

describe('Knowledge Base — email_digests_guide (task #75)', () => {
  it('is findable and explains the fixed EMAIL_DIGEST_CATALOG', () => {
    mount();
    openArticle('Email Digests — Panel Guide');
    expect(container.textContent).toContain('EMAIL_DIGEST_CATALOG');
  });

  it('distinguishes this from Reports Hub My Reports', () => {
    mount();
    openArticle('Email Digests — Panel Guide');
    expect(container.textContent).toContain('My Reports');
  });
});

describe('Knowledge Base — anomaly_scan_guide (task #75)', () => {
  it('is findable and states the baseline is model-independent, not forecast-vs-actual', () => {
    mount();
    openArticle('Anomaly Scan — Panel Guide');
    expect(container.textContent).toContain('MODEL-INDEPENDENT');
  });

  it('states the auto-tag confidence threshold and the sage-chat web-search routing', () => {
    mount();
    openArticle('Anomaly Scan — Panel Guide');
    expect(container.textContent).toContain('confidence ≥ 75');
    expect(container.textContent).toContain('callSageOnce');
  });
});
