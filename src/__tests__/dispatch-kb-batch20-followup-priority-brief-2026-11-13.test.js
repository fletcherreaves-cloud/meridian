// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), batch 20 follow-up — 2026-11-13.
//
// `priority_brief` was flagged in batch 20 as a candidate that needed more than mechanical
// wiring ("Priority Brief is referenced in several files... which one actually renders its
// title row wasn't conclusively located this pass"). Located it: the panel id `priority-brief`
// (registry label "Priority Actions" — the article itself already documents this naming
// inconsistency) renders `DistrictPriorityBrief` (src/views/analytics.js), whose own
// hand-rolled header reads "District Priority Brief" — an exact match for the article's
// documented on-screen title. Wired the InfoIcon there.
//
// Per CLAUDE.md's "would this verification still pass if reverted?" rule: mounts the real
// DistrictPriorityBrief component, clicks the real "?" InfoIcon in its header, and asserts the
// real article title appears. Reverting the wiring makes the icon vanish and this test fails.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

let container, root;
afterEach(() => {
  if (root) act(() => root.unmount());
  if (container) container.remove();
  container = null; root = null;
});

function mountEl(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
}

describe('InfoIcon rollout batch 20 follow-up (2026-11-13)', () => {
  it('District Priority Brief (priority_brief) — header InfoIcon', async () => {
    const { DistrictPriorityBrief } = await import('../views/analytics.js');
    const stores = [{ loc: '0003708', name: 'Test Store', findings: [], opsScore: 80, ctrlScore: 80, pSales: 1000, pLY: 900 }];
    mountEl(h(DistrictPriorityBrief, {
      stores, ds: {}, settings: {}, userEvents: [],
      effectiveRole: 'owner', onSelectStore: () => {}, onClose: () => {},
    }));
    expect(container.textContent).toContain('District Priority Brief');
    const icon = container.querySelector('span[title^="Click for details"]');
    expect(icon, 'InfoIcon "?" control not found').toBeTruthy();
    act(() => { icon.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Priority Brief — District Priority Brief (Tiered Daily Coaching List)');
  });
});
