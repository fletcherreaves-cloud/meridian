// @vitest-environment happy-dom
// @ts-nocheck
// Owner-reported 2026-11-10, portrait phone: "Can't reach far right icon in portrait mode" --
// the far-right icon is ProfileMenu's account button. AppTopbar's right-side actions group
// (src/app/shell.js) had flexShrink:0 and no overflowX, and the outer bar itself has no
// overflowX either -- so on a narrow viewport the combined width of Search/SAGE/Log something/
// scope pills/DatePicker/NotificationBell/Settings/ProfileMenu simply ran past the right edge
// with nothing to scroll it into view. Same shape and same established fix as the hub tab bars
// (dispatch-hub-tabbar-scroll-2026-11-10.test.js) and PanelChrome.js's own Inventory Control
// pilot: minWidth:0 + overflowX:'auto' (+ overflowY:'visible', since NotificationBell/ProfileMenu
// render their own dropdowns as descendants of this div via position:'absolute').
//
// Renders the REAL AppTopbar and inspects the actual DOM style of the right-actions wrapper, per
// this repo's "would this verification still pass if reverted" standing rule.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AppTopbar } from '../app/shell.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); container = null; root = null; });

function mount(overrides = {}) {
  const props = {
    view: 'command', selStore: null, stores: [], ds: {}, settings: {},
    dateRange: null, onDateChange: () => {}, locScope: 'all', onScopeChange: () => {},
    onOpenModal: () => {}, onLoadFiles: () => {}, onSaveSession: () => {}, onRestoreSession: () => {},
    loadMsg: '', setView: () => {}, sessionBanner: null, onClearSession: () => {},
    userRole: 'admin', onOpenAdmin: null, perm: () => true, betaMode: false,
    onToggleBeta: () => {},
    ...overrides,
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(React.createElement(AppTopbar, props)); });
}

describe('AppTopbar right-actions group scrolls instead of overflowing (dispatch 2026-11-10)', () => {
  it('the wrapper around Search/SAGE/.../ProfileMenu has overflowX:auto + minWidth:0, no flexShrink:0', () => {
    mount();
    const searchBtn = container.querySelector('button[title="Search panels (Ctrl/⌘K)"]');
    expect(searchBtn, 'top bar search button not found').toBeTruthy();
    const group = searchBtn.parentElement;
    expect(group.style.overflowX).toBe('auto');
    expect(group.style.overflowY).toBe('visible');
    expect(group.style.minWidth).toBe('0');
    expect(group.style.flexShrink).not.toBe('0');
  });

  it('the account (ProfileMenu) button is inside that same scrollable group, reachable regardless of viewport width', () => {
    mount();
    const accountBtn = container.querySelector('button[title="Account"]');
    expect(accountBtn, 'Account button not found').toBeTruthy();
    const searchBtn = container.querySelector('button[title="Search panels (Ctrl/⌘K)"]');
    const group = searchBtn.parentElement;
    expect(group.contains(accountBtn), 'Account button is not inside the scrollable right-actions group').toBe(true);
  });
});

// Follow-up, same day (owner-reported): "our menu fix at top of app did same thing it did in
// inventory control. Cannot see the dropdowns now." overflowY:'visible' on the right-actions
// group above does NOT reliably survive the CSS Overflow spec's cross-axis coercion on every
// engine (the exact thing task #119 diagnosed for ActionMenu/PanelChrome) -- NotificationBell's
// and ProfileMenu's dropdowns were still position:'absolute' descendants of that scrollable
// group, so they could still get clipped into its own tiny box. Fixed the same way #119 was:
// portal the open panel to document.body, position:'fixed' from the toggle's own screen coords.
describe('NotificationBell / ProfileMenu dropdowns escape the scrollable right-actions group (dispatch 2026-11-10)', () => {
  it('NotificationBell renders its open panel outside the scrollable group, position:fixed, not absolute', async () => {
    mount();
    const bellBtn = container.querySelector('button[title="Notifications"]');
    expect(bellBtn, 'Notifications bell button not found').toBeTruthy();
    await act(async () => { bellBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const heading = [...document.querySelectorAll('div')].find(d => d.textContent === 'Notifications' && d.parentElement);
    expect(heading, 'open notifications panel not found in document').toBeTruthy();
    const panel = heading.parentElement;
    expect(container.contains(panel), 'notifications panel must not be a descendant of the scrollable top bar').toBe(false);
    expect(panel.style.position).toBe('fixed');
  });

  it('ProfileMenu renders its open panel outside the scrollable group, position:fixed, not absolute', async () => {
    mount();
    const accountBtn = container.querySelector('button[title="Account"]');
    expect(accountBtn, 'Account button not found').toBeTruthy();
    await act(async () => { accountBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const signOut = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Sign'));
    expect(signOut, 'open profile panel (Sign out item) not found in document').toBeTruthy();
    // Walk up to the panel itself (the bordered dropdown box, not the backdrop) to check position.
    let panel = signOut;
    while (panel && panel.style.position !== 'fixed') panel = panel.parentElement;
    expect(panel, 'profile panel with position:fixed not found').toBeTruthy();
    expect(container.contains(panel), 'profile panel must not be a descendant of the scrollable top bar').toBe(false);
  });
});
