// @vitest-environment happy-dom
// @ts-nocheck
// Owner request (task #98, 2026-11-06): a THIRD sidebar state beyond expanded/icon-rail -- fully
// collapsed to just a hamburger/logo click target, expanding on click. Implemented in shell.js as
// a `navHidden` flag layered ON TOP OF the existing `collapsed` (full vs. icon-rail), never
// touching it -- so expanding out of hamburger-only always restores whichever of the two the user
// was actually in before, from either starting point. Reached via double-click on the SAME
// logo/toggle element (not a new button) so the pre-existing single-click full<->rail toggle --
// and its `title`-based test lookups in dispatch-sidebar-collapsed-default-2026-11-03.test.js and
// dispatch-nav-search.test.js -- stay byte-identical.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

global.performance = global.performance || { now: () => 0 };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { AppSidebar } = await import('../app/shell.js');
const h = React.createElement;

const baseProps = {
  view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
  settings: { districtName: 'Test' }, onOpenModal: () => {}, onLoadFiles: () => {},
  onSaveSession: () => {}, onRestoreSession: () => {}, loadMsg: '', perm: () => true,
  betaMode: false, panelVis: {},
};

function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(h(AppSidebar, props)); });
  return { container, root };
}

function click(el) { act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }
function dblclick(el) { act(() => { el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); }); }
const logoOf = (container) => [...container.querySelectorAll('div')]
  .find(d => d.title === 'Collapse sidebar' || d.title === 'Expand sidebar');

describe('AppSidebar -- hamburger-only full-collapse (task #98, 2026-11-06)', () => {
  let container, root;
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('double-clicking from the expanded (full) state hides everything but the logo click target', () => {
    ({ container, root } = mount({ ...baseProps, initialCollapsed: false }));
    expect(container.textContent).toContain('Meridian'); // starts expanded
    dblclick(logoOf(container));
    // Hamburger-only: no "Meridian" wordmark, no nav item labels, no footer version string.
    expect(container.textContent).not.toContain('Meridian');
    expect(container.textContent).not.toContain('Home');
    expect(container.textContent).not.toMatch(/Data loaded|No data/);
    // The click target itself (the toggle) is still there, now offering to expand.
    expect([...container.querySelectorAll('div')].find(d => d.title === 'Expand sidebar')).toBeTruthy();
  });

  it('a single click after hamburger-only restores FULL (the state before collapsing), not icon-rail', () => {
    ({ container, root } = mount({ ...baseProps, initialCollapsed: false }));
    const logo = logoOf(container);
    dblclick(logo);
    expect(container.textContent).not.toContain('Meridian');
    click(logoOf(container));
    expect(container.textContent).toContain('Meridian'); // back to full, not the icon rail
    expect([...container.querySelectorAll('div')].find(d => d.title === 'Collapse sidebar')).toBeTruthy();
  });

  it('a single click after hamburger-only restores ICON-RAIL when that was the prior state, not full', () => {
    ({ container, root } = mount({ ...baseProps, initialCollapsed: true })); // starts rail
    expect(container.textContent).not.toContain('Meridian'); // rail has no wordmark either
    const logo = logoOf(container);
    dblclick(logo); // rail -> hamburger-only
    expect(container.textContent).not.toContain('Home'); // rail at least shows icon-only nav; verify it's gone
    click(logoOf(container)); // hamburger-only -> back to rail (never touched `collapsed`)
    // Rail still shows no wordmark (same as before double-clicking), but nav items are back.
    expect(container.textContent).not.toContain('Meridian');
    expect([...container.querySelectorAll('div')].find(d => d.title === 'Expand sidebar')).toBeTruthy();
  });

  it('the pre-existing single-click full<->rail toggle and its title text are unchanged', () => {
    ({ container, root } = mount({ ...baseProps, initialCollapsed: false }));
    expect([...container.querySelectorAll('div')].find(d => d.title === 'Collapse sidebar')).toBeTruthy();
    click(logoOf(container));
    expect([...container.querySelectorAll('div')].find(d => d.title === 'Expand sidebar')).toBeTruthy();
    expect(container.textContent).not.toContain('Meridian'); // icon rail, same as always
  });

  it('on a mobile viewport, double-clicking the logo never triggers hamburger-only (desktop-only, same invariant as the icon-rail itself)', () => {
    const origW = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    try {
      ({ container, root } = mount({ ...baseProps, initialCollapsed: true }));
      expect(container.textContent).toContain('Meridian'); // mobile never gets the icon-rail/hamburger treatment
      const logo = [...container.querySelectorAll('div')].find(d => d.title);
      dblclick(logo);
      expect(container.textContent).toContain('Meridian'); // unaffected -- still full mobile drawer content
      expect(container.textContent).toContain('Home');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: origW });
    }
  });
});
