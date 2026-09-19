// @vitest-environment happy-dom
// @ts-nocheck
// Backlog survey (2026-09-19): the Knowledge Base's `lifelenz_bridge` article still named the
// pre-rename panel. panel-registry.js's live nav label has been "MBI vs LifeLenz Accuracy" since
// dispatch #105 (2026-08-24), reached today via Test Kitchen -> Forecast Reports -> its tab (a
// hub-tab, not a sidebar item, since dispatch #106 Phase B) -- but the KB_ARTICLES.lifelenz_bridge
// entry in src/engine/forecast.js still had title 'LifeLenz Bridge -- WFM Comparison &
// Adjustment' and body text '**Access:** Sidebar -> LifeLenz Bridge', a name and access path that
// haven't existed in the nav for weeks.
//
// Per "would this verification still pass if reverted?": this mounts the real exported
// KnowledgeBasePanel and reads the rendered article body -- it fails against the old copy, which
// really did render the stale name and access path.
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

describe('Knowledge Base -- lifelenz_bridge article no longer names the pre-rename panel', () => {
  it('lists the article under its live title, not the retired "LifeLenz Bridge" name', () => {
    mount();
    expect(container.textContent).toContain('MBI vs LifeLenz Accuracy — WFM Comparison & Adjustment');
    expect(container.textContent).not.toContain('LifeLenz Bridge — WFM Comparison & Adjustment');
  });

  it('opening the article shows the real Test Kitchen access path, not the old sidebar one', () => {
    mount();
    const entry = [...container.querySelectorAll('div')]
      .filter(d => d.textContent.includes('Compares Meridian projections vs LifeLenz'))
      .pop();
    expect(entry).toBeTruthy();
    act(() => { entry.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Test Kitchen → Forecast Reports');
    expect(container.textContent).not.toContain('Sidebar → LifeLenz Bridge');
  });
});
