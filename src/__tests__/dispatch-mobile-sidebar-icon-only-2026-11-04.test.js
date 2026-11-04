// @ts-nocheck
// Owner-reported bug (2026-11-04, screenshot): the mobile nav drawer opened as a wall of bare
// icons at ~260px width -- section headers (Daily/Notifications/Reports) visible, but every
// item's own label gone, no "Meridian" header text, no search box. Root cause: AppSidebar's
// `collapsed` (the DESKTOP-only icon-rail state, shell.js -- defaults to true since task #71,
// 2026-11-03's "sidebar defaults to collapsed") was read unconditionally for every label/layout
// decision, with no `isMobile` check. So once #71 shipped, a mobile session inherited that same
// collapsed-by-default state even though `w` already special-cased mobile's width to the full
// 260px drawer -- the width said "expanded drawer," every label said "icon rail." Fixed by
// gating every such render on a new `navCollapsed = collapsed && !isMobile` instead of raw
// `collapsed` -- mobile's own open/closed affordance (mobileOpen + the hamburger) is the only
// thing that should ever hide the mobile drawer; the desktop-narrow icon rail has no mobile
// equivalent and must never apply there.
//
// This asserts the real production path: no `initialCollapsed` prop (so `collapsed` defaults to
// true, exactly as task #71 shipped it) AND a mobile-width `window.innerWidth`, together -- the
// exact combination the screenshot was taken under. A companion assertion proves the desktop
// default-collapsed behavior (#71's own intent) is unchanged by this fix.
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import ReactDOMServer from 'react-dom/server';

global.performance = global.performance || { now: () => 0 };

const h = React.createElement;

describe('AppSidebar -- mobile drawer must not inherit the desktop icon-rail default (2026-11-04)', () => {
  it('on a mobile viewport, with the production collapsed-by-default state, still renders full labels', async () => {
    const { AppSidebar } = await import('../app/shell.js');
    global.window = { innerWidth: 390, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} };
    const html = ReactDOMServer.renderToStaticMarkup(h(AppSidebar, {
      view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
      settings: { districtName: 'Test' }, onOpenModal: () => {}, onLoadFiles: () => {},
      onSaveSession: () => {}, onRestoreSession: () => {}, loadMsg: '', perm: () => true,
      betaMode: false, panelVis: {},
    }));
    // The old bug: this text never appeared on mobile because `!collapsed&&div(...'Meridian')`
    // used the desktop-default-true `collapsed` flag directly.
    expect(html).toContain('Meridian');
    // The always-visible "Home" top nav item's label -- gone entirely under the bug (navItem's
    // label span was `!collapsed&&span(...)`), present once gated on navCollapsed instead.
    expect(html).toContain('Home');
    // Section headers were never actually hidden by the bug (they don't gate on `collapsed` in
    // the v2 accordion branch) -- asserting they're still there too, so this test would have
    // caught a fix that over-corrected and broke them.
    expect(html).toContain('Daily');
  });

  it('on a desktop viewport, the production collapsed-by-default state still renders the icon rail (task #71 unchanged)', async () => {
    const { AppSidebar } = await import('../app/shell.js');
    global.window = { innerWidth: 1200, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} };
    const html = ReactDOMServer.renderToStaticMarkup(h(AppSidebar, {
      view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
      settings: { districtName: 'Test' }, onOpenModal: () => {}, onLoadFiles: () => {},
      onSaveSession: () => {}, onRestoreSession: () => {}, loadMsg: '', perm: () => true,
      betaMode: false, panelVis: {},
    }));
    expect(html).not.toContain('Meridian');
    expect(html).not.toContain('>Home<');
  });
});
