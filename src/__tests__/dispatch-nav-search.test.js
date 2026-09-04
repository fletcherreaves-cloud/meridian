// @vitest-environment happy-dom
// @ts-nocheck
// Global nav search (owner req: "a search bar at the top of the menu to find anything in-app").
// shell-nav-snapshot.test.js already confirms the search box's static markup doesn't disturb the
// exact nav-text snapshot; this file renders AppSidebar for real (react-dom/client, not
// renderToStaticMarkup) and exercises the actual interactive behavior — typing, filtering,
// clicking a result — since a static-markup test can't see hooks/event handlers at all and would
// pass unchanged even if the search were wired to nothing.
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

global.performance = global.performance || { now: () => 0 };

const { AppSidebar } = await import('../app/shell.js');
const h = React.createElement;

function setNativeValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function mountSidebar(props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onOpenModal = vi.fn();
  act(() => {
    root.render(h(AppSidebar, {
      view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
      settings: { districtName: 'Test' }, onOpenModal, onLoadFiles: () => {},
      onSaveSession: () => {}, onRestoreSession: () => {}, loadMsg: '', perm: () => true,
      betaMode: false, panelVis: {}, ...props,
    }));
  });
  return { container, root, onOpenModal };
}

describe('nav search', () => {
  it('typing a panel label filters to a matching result, and clicking it calls onOpenModal with that panel id', () => {
    const { container, onOpenModal } = mountSidebar();
    const input = container.querySelector('input[placeholder="🔍 Search…"]');
    expect(input).toBeTruthy();

    act(() => { setNativeValue(input, 'Signals'); });
    const match = [...container.querySelectorAll('div')].find(d => d.textContent === 'Signals');
    expect(match).toBeTruthy();

    act(() => { match.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onOpenModal).toHaveBeenCalledWith('signals');
  });

  it('a query matching nothing shows "No matches." rather than a stale/empty dropdown', () => {
    const { container } = mountSidebar();
    const input = container.querySelector('input[placeholder="🔍 Search…"]');
    act(() => { setNativeValue(input, 'zzzznonexistentpanelzzzz'); });
    expect(container.textContent).toContain('No matches.');
  });

  it('an empty query shows no dropdown at all (not an empty list, not "No matches.")', () => {
    const { container } = mountSidebar();
    const input = container.querySelector('input[placeholder="🔍 Search…"]');
    act(() => { setNativeValue(input, 'Signals'); });
    expect(container.textContent).toContain('Signals');
    act(() => { setNativeValue(input, ''); });
    expect(container.textContent).not.toContain('No matches.');
  });

  it('a permission the user lacks excludes that panel from search results (same gate the sidebar itself uses)', () => {
    // 'signals' requires 'analytics.store' per panel-registry.js — deny everything.
    const { container } = mountSidebar({ perm: () => false });
    const input = container.querySelector('input[placeholder="🔍 Search…"]');
    act(() => { setNativeValue(input, 'Signals'); });
    expect(container.textContent).toContain('No matches.');
  });

  it('is not rendered at all when the sidebar is collapsed (no room for a text box in the 48px rail)', () => {
    // Collapse via the logo-click toggle (component-local state, no prop for it).
    const { container } = mountSidebar();
    const logo = container.querySelector('[title="Collapse sidebar"]');
    expect(logo).toBeTruthy();
    act(() => { logo.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelector('input[placeholder="🔍 Search…"]')).toBeNull();
  });
});
