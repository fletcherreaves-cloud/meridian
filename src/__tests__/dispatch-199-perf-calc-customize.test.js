// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #199 — mirrors dispatch #135 item 3's move exactly: the Performance Calculator
// (formerly store-dash.js's standalone `PerformanceCalculator`, panel-registry id 'perf-calc',
// kind:'optional') moved into a new "Calculator" sub-tab of Performance Review > Customize.
//
// Renders the REAL PerformanceReviewsPanel -> CustomizePanel -> PerformanceCalculatorSection
// chain (not an isolated helper), per this repo's "would this verification still pass if
// reverted?" standing rule — a test that only imported PerformanceCalculatorSection directly
// could pass unchanged with the Customize wiring deleted. Clicks the real Customize and
// Calculator tab buttons and asserts the real calculator content appears in the rendered DOM.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { PerformanceReviewsPanel } = await import('../views/performance-reviews.js');

describe('#199: Performance Calculator renders inside Performance Review > Customize, not standalone', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('Customize tab has a Calculator sub-tab that renders the real PerformanceCalculatorSection content', async () => {
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [], ds: { loaded: true }, settings: {}, onClose: () => {}, userRole: 'admin',
      }));
    });
    const customizeBtn = [...container.querySelectorAll('button')].find(b => /^Customize/.test(b.textContent));
    expect(customizeBtn, 'Customize tab button not found').toBeTruthy();
    await act(async () => { customizeBtn.click(); });

    const calcSubTab = [...container.querySelectorAll('button')].find(b => b.textContent === 'Calculator');
    expect(calcSubTab, 'Calculator sub-tab button not found inside Customize').toBeTruthy();
    await act(async () => { calcSubTab.click(); });

    // Real PerformanceCalculatorSection content — the what-if model header, sliders, and
    // projected-impact chain, not a placeholder.
    expect(container.textContent).toMatch(/Performance Calculator/);
    expect(container.textContent).toMatch(/Adjust Metrics/);
    expect(container.textContent).toMatch(/Projected Impact/);
    expect(container.textContent).toMatch(/Impact Chain/);
    expect(container.querySelector('input[type="range"]'), 'no slider input rendered').toBeTruthy();
  });

  it('a redirect deep-link (initialTab/initialCustomizeSection) lands directly on Customize > Calculator', async () => {
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [], ds: { loaded: true }, settings: {}, onClose: () => {}, userRole: 'admin',
        initialTab: 'customize', initialCustomizeSection: 'calculator',
      }));
    });
    // No extra clicks needed — the old standalone 'perf-calc' route's replacement (App.js's
    // modal==='perf-calc' handler) lands here directly.
    expect(container.textContent).toMatch(/Performance Calculator/);
    expect(container.textContent).toMatch(/Projected Impact/);
  });
});
