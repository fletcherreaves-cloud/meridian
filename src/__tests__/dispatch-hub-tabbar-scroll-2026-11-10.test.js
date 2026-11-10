// @vitest-environment happy-dom
// @ts-nocheck
// Owner-reported 2026-11-10 (At A Glance screenshot of the Labor & Scheduling hub): the tab bar
// (12 tabs) wrapped onto a second row instead of scrolling, and in RoutePanelShell's header flex
// row (title div is flex:1/minWidth:0, headerExtra is its sibling) that squeezed the "Labor &
// Scheduling" title down to a near-unreadable sliver ("Labor" / "& Scheduling" on separate
// lines) rather than pushing the tabs to their own second line. "Easy fix, give the tabs the
// scrolling option like we did in Inventory Control" -- PanelChrome.js's own band-3 tabs style
// is exactly that established pattern: minWidth:0 (so the flex item CAN shrink below its content
// width) + overflowX:'auto' (so it scrolls instead of clipping or forcing its parent to grow).
// Applied to both of App.js's hub tab bars (Scheduling -- the one in the screenshot -- and
// Planning, which shares the literal same pre-fix style object per its own "this one's literal
// template" comment).
//
// Renders the REAL SchedulingHubPanel/PlanningHubPanel and inspects the actual DOM style of the
// tab bar's wrapping div, per this repo's "would this verification still pass if reverted"
// standing rule -- a test that only checked a style literal in the source file could pass
// unchanged with the wrong div restyled instead.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { SchedulingHubPanel, PlanningHubPanel } from '../app/App.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

describe('Hub tab bars scroll horizontally instead of wrapping (dispatch 2026-11-10)', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); container = null; root = null; });

  function mount(el) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(el); });
  }

  it('SchedulingHubPanel tab bar: no flexWrap:wrap, has overflowX:auto + minWidth:0', () => {
    mount(h(SchedulingHubPanel, {
      ds: { schedRows: [], jobHours: [] }, stores: [{ loc: '6838' }], settings: {},
      perm: () => true, onClose: () => {},
    }));
    const tabBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Pay Events'));
    expect(tabBtn, 'a hub tab button was not found').toBeTruthy();
    const bar = tabBtn.parentElement;
    expect(bar.style.flexWrap).not.toBe('wrap');
    expect(bar.style.overflowX).toBe('auto');
    expect(bar.style.minWidth).toBe('0');
  });

  it('PlanningHubPanel tab bar: same fix (shared the identical pre-fix style literal)', () => {
    mount(h(PlanningHubPanel, { ds: {}, stores: [], settings: {}, onClose: () => {} }));
    const tabBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Monthly'));
    expect(tabBtn, 'a hub tab button was not found').toBeTruthy();
    const bar = tabBtn.parentElement;
    expect(bar.style.flexWrap).not.toBe('wrap');
    expect(bar.style.overflowX).toBe('auto');
    expect(bar.style.minWidth).toBe('0');
  });
});
