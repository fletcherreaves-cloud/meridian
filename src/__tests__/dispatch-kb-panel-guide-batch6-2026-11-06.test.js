// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-06 batch 6: 6 more real, traffic-relevant nav
// panels -- Trend Explorer, Conversion Efficiency Ratio, Oil Efficiency, Labor Opportunity Cost,
// Weather Impact, Loss Prevention Summary. Each verified against its own real source file before
// writing, per this repo's "measure, don't reason" standing rule.
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

describe('Knowledge Base — trend_explorer_guide (task #75)', () => {
  it('is findable and explains it reuses Scanner, not a second correlation engine', () => {
    mount();
    openArticle('Pick any metric in the registry');
    expect(container.textContent).toContain('scanAllPairs()');
    expect(container.textContent).toContain('no second correlation math');
  });

  it('states this panel is deliberately single-store only', () => {
    mount();
    openArticle('Pick any metric in the registry');
    expect(container.textContent).toContain('SINGLE-STORE ONLY');
    expect(container.textContent).toContain('never average averages');
  });
});

describe('Knowledge Base — conversion_efficiency_guide (task #75)', () => {
  it('is findable and explains the manual-upload sourcing', () => {
    mount();
    openArticle('Food usage vs. target by raw item');
    expect(container.textContent).toContain('Owner_Operator_<name>.pdf');
    expect(container.textContent).toContain('loadConversionEfficiency()');
  });

  it('states only one period per store counts, never summed', () => {
    mount();
    openArticle('Food usage vs. target by raw item');
    expect(container.textContent).toContain('NEVER summed across months');
  });
});

describe('Knowledge Base — oil_efficiency_guide (task #75)', () => {
  it('is findable and cross-references the VITO pilot use of the same data', () => {
    mount();
    openArticle('Oil use vs. target and filtration compliance');
    expect(container.textContent).toContain('VITO fry-filtration pilot');
  });

  it('states a Quality Concern flag matters before the dollar figure', () => {
    mount();
    openArticle('Oil use vs. target and filtration compliance');
    expect(container.textContent).toContain('Quality Concern');
    expect(container.textContent).toContain('food-safety-adjacent');
  });
});

describe('Knowledge Base — labor_opportunity_cost_guide (task #75)', () => {
  it('is findable and explains the needed-vs-scheduled signedBasis distinction', () => {
    mount();
    openArticle('OT, overstaffing, and understaffing $');
    expect(container.textContent).toContain('signedBasis');
    expect(container.textContent).toContain('NEEDED-hours baseline');
    expect(container.textContent).toContain('SCHEDULE instead');
  });

  it('states totals are summed and hour-gap columns are averaged', () => {
    mount();
    openArticle('OT, overstaffing, and understaffing $');
    expect(container.textContent).toContain('summed across the whole selected date range');
    expect(container.textContent).toContain('double-count');
  });
});

describe('Knowledge Base — weather_impact_guide (task #75)', () => {
  it('is findable and explains why this is a split, not a matched-day design', () => {
    mount();
    openArticle('How rain and heat have historically moved');
    expect(container.textContent).toContain('matched-day design');
    expect(container.textContent).toContain('Promo/Discount ROI');
  });

  it('states this is single-store scoped, not a district-wide rule', () => {
    mount();
    openArticle('How rain and heat have historically moved');
    expect(container.textContent).toContain('OWN measured weather sensitivity');
  });
});

describe('Knowledge Base — loss_prevention_summary_guide (task #75)', () => {
  it('is findable and explains every column resolves through metricValueForRange', () => {
    mount();
    openArticle('Discount / Promo / Cash O/S');
    expect(container.textContent).toContain('metricValueForRange()');
    expect(container.textContent).toContain('no new resolution logic');
  });

  it('distinguishes this flat scan from a dedicated lever report', () => {
    mount();
    openArticle('Discount / Promo / Cash O/S');
    expect(container.textContent).toContain('Promo ROI');
  });
});
