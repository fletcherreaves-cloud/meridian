// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #200 (Task Group A) — LocationIntelligence (src/features/location-intel.js)
// unconditionally rendered a full-screen modal backdrop even when invoked as an inline tab from
// store-analytics.js's District View drill-down. Owner, with a screenshot: "Intelligence inside
// the district view store dashboard needs to be converted to on page like the rest of the tabs.
// it is currently popping up as a separate rendered panel."
//
// Renders the REAL LocationIntelligence consumer under both call shapes — embedded (store-
// analytics.js's inline tab) and standalone (App.js's global "Market Intelligence" nav panel) —
// per this repo's "would this verification still pass if the change were reverted" standing
// rule: a test that only checks the `embedded` prop is read, without asserting the backdrop is
// actually absent/present in the DOM, could pass unchanged with the fix half-wired.
//
// UPDATED (dispatch #206, URL migration batch 3, 2026-08-28): the standalone call shape was
// converted to route:true (routePanel==='loc-intel') — its hand-rolled position:fixed/inset:0/
// rgba(0,0,0 backdrop + '✕' close button were replaced by RoutePanelShell (a '←' Back button,
// no backdrop). The second/third tests below were re-written against the new shape rather than
// deleted, so a revert of the RoutePanelShell conversion still fails loudly here. The embedded
// call shape (first test) is completely unchanged by that conversion.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

import { LocationIntelligence } from '../features/location-intel.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ds.loaded:false is the noData path — cheapest render that still exercises the real header/
// backdrop wrapper (the thing under test), with none of liComputeAll's heavier data machinery.
const DS_EMPTY = { loaded: false };

describe('#200 LocationIntelligence — embedded prop controls backdrop/close-button, both call shapes', () => {
  let container, root;
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('embedded:true (store-analytics.js\'s inline tab) renders with NO fixed backdrop and NO own close button', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(LocationIntelligence, {
        store: { loc: '3708' }, allStores: [{ loc: '3708' }], ds: DS_EMPTY, settings: {},
        scope: 'store', embedded: true, onClose: () => {},
      }));
    });
    const outer = container.firstElementChild;
    expect(outer.style.position).not.toBe('fixed');
    expect(outer.style.background).not.toContain('rgba');
    // The header still renders (title, mode toggle, print/download) -- only chrome specific to
    // being a standalone overlay (backdrop + ✕) is gone.
    expect(container.textContent).toContain('Location Intelligence');
    const closeBtn = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === '✕');
    expect(closeBtn).toBeFalsy();
  });

  it('embedded absent (App.js\'s standalone "Market Intelligence" nav panel) now renders via RoutePanelShell — no backdrop, a "←" Back button instead of "✕"', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(LocationIntelligence, {
        allStores: [{ loc: '3708' }], ds: DS_EMPTY, settings: {},
        scope: 'district', onClose: () => {}, // no `embedded` prop, matching App.js's real call site
      }));
    });
    const outer = container.firstElementChild;
    expect(outer.style.position).not.toBe('fixed');
    expect(outer.style.background).not.toContain('rgba');
    expect(container.textContent).toContain('Location Intelligence');
    const closeBtn = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === '✕');
    expect(closeBtn).toBeFalsy();
    const backBtn = [...container.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Back');
    expect(backBtn).toBeTruthy();
  });

  it('clicking the RoutePanelShell Back button still closes the standalone (non-embedded) panel', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    let closed = false;
    await act(async () => {
      root.render(React.createElement(LocationIntelligence, {
        allStores: [{ loc: '3708' }], ds: DS_EMPTY, settings: {},
        scope: 'district', onClose: () => { closed = true; },
      }));
    });
    const backBtn = [...container.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Back');
    await act(async () => { backBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(closed).toBe(true);
  });
});
