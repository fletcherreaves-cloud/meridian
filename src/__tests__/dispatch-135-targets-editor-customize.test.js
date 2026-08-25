// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #135 item 3 — "this does not need it's own panel, should be inside Customize on
// Perf Review dashboard." The Targets Editor (dispatch #132 item 3) moved from a standalone
// panel-registry.js nav entry into a new "Targets" sub-tab of Performance Review > Customize.
//
// Renders the REAL PerformanceReviewsPanel -> CustomizePanel -> TargetsEditorSection chain
// (not an isolated helper), per this repo's "would this verification still pass if reverted?"
// standing rule — a test that only imported TargetsEditorSection directly could pass unchanged
// with the Customize wiring deleted. Clicks the real Customize and Targets tab buttons and
// asserts the real editor content (including the 6 new dispatch #135 item 1 fields) appears in
// the rendered DOM.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { PerformanceReviewsPanel } = await import('../views/performance-reviews.js');

describe('#135 item 3: Targets Editor renders inside Performance Review > Customize, not standalone', () => {
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

  it('Customize tab has a Targets sub-tab that renders the real TargetsEditorSection content', async () => {
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [], ds: { loaded: true }, settings: {}, onClose: () => {}, userRole: 'admin',
      }));
    });
    const customizeBtn = [...container.querySelectorAll('button')].find(b => /^Customize/.test(b.textContent));
    expect(customizeBtn, 'Customize tab button not found').toBeTruthy();
    await act(async () => { customizeBtn.click(); });

    const targetsSubTab = [...container.querySelectorAll('button')].find(b => b.textContent === 'Targets');
    expect(targetsSubTab, 'Targets sub-tab button not found inside Customize').toBeTruthy();
    await act(async () => { targetsSubTab.click(); });

    // Real TargetsEditorSection content — the field-picker chips and the cascade preview
    // section, not a placeholder.
    expect(container.textContent).toMatch(/Set an override/);
    expect(container.textContent).toMatch(/Preview — what does one store actually resolve to/);
    // At least one of the 6 dispatch #135 item 1 fields is a real, clickable chip here.
    expect(container.textContent).toMatch(/EPB2B \(Pace Portal, %\)/);
    expect(container.textContent).toMatch(/Execution of Retention Prg\./);
  });

  it('a redirect deep-link (initialTab/initialCustomizeSection) lands directly on Customize > Targets', async () => {
    await act(async () => {
      root.render(React.createElement(PerformanceReviewsPanel, {
        stores: [], ds: { loaded: true }, settings: {}, onClose: () => {}, userRole: 'admin',
        initialTab: 'customize', initialCustomizeSection: 'targets',
      }));
    });
    // No extra clicks needed — the old standalone 'targets-editor' route's replacement
    // (App.js's modal==='targets-editor' handler) lands here directly.
    expect(container.textContent).toMatch(/Set an override/);
    expect(container.textContent).toMatch(/FS Completion T-60 \(%\)/);
  });
});
