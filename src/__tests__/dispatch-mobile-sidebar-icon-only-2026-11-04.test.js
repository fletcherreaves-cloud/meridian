// @ts-nocheck
// Owner-reported bug (2026-11-04, screenshot): the mobile nav drawer opened as a wall of bare
// icons at ~260px width -- section headers (Daily/Notifications/Reports) visible, but every
// item's own label gone, no "Meridian" header text, no search box. Root cause: AppSidebar's
// `collapsed` (the DESKTOP-only icon-rail state, shell.js) was read unconditionally for every
// label/layout decision, with no `isMobile` check -- so whenever `collapsed` happened to be true
// (as it was under task #71's since-reversed collapsed-by-default, 2026-11-03), a mobile session
// inherited that same icon-rail state even though `w` already special-cased mobile's width to the
// full 260px drawer -- the width said "expanded drawer," every label said "icon rail." Fixed by
// gating every such render on a new `navCollapsed = collapsed && !isMobile` instead of raw
// `collapsed` -- mobile's own open/closed affordance (mobileOpen + the hamburger) is the only
// thing that should ever hide the mobile drawer; the desktop-narrow icon rail has no mobile
// equivalent and must never apply there.
//
// Deliberately passes `initialCollapsed: true` explicitly on BOTH viewports, rather than relying
// on whatever the production default currently is -- the real regression this guards is "mobile
// must never inherit the desktop collapsed flag," which only a genuinely-collapsed `collapsed`
// state can prove. The production default itself (collapsed-by-default 2026-11-03, reversed to
// expanded-by-default 2026-11-05) is covered separately by
// dispatch-sidebar-collapsed-default-2026-11-03.test.js -- tying this test to that default too
// would make it fail on every future default flip for no reason related to the bug it exists for.
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import ReactDOMServer from 'react-dom/server';

global.performance = global.performance || { now: () => 0 };

const h = React.createElement;

describe('AppSidebar -- mobile drawer must not inherit the desktop icon-rail state (2026-11-04)', () => {
  it('on a mobile viewport, with collapsed=true, still renders full labels', async () => {
    const { AppSidebar } = await import('../app/shell.js');
    global.window = { innerWidth: 390, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} };
    const html = ReactDOMServer.renderToStaticMarkup(h(AppSidebar, {
      view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
      settings: { districtName: 'Test' }, onOpenModal: () => {}, onLoadFiles: () => {},
      onSaveSession: () => {}, onRestoreSession: () => {}, loadMsg: '', perm: () => true,
      betaMode: false, panelVis: {}, initialCollapsed: true,
    }));
    // The old bug: this text never appeared on mobile because `!collapsed&&div(...'Meridian')`
    // used the desktop collapsed flag directly.
    expect(html).toContain('Meridian');
    // The always-visible "Home" top nav item's label -- gone entirely under the bug (navItem's
    // label span was `!collapsed&&span(...)`), present once gated on navCollapsed instead.
    expect(html).toContain('Home');
    // Section headers were never actually hidden by the bug (they don't gate on `collapsed` in
    // the v2 accordion branch) -- asserting they're still there too, so this test would have
    // caught a fix that over-corrected and broke them.
    expect(html).toContain('Daily');
  });

  it('on a desktop viewport, collapsed=true still renders the icon rail (task #71\'s mechanism unchanged, independent of its default)', async () => {
    const { AppSidebar } = await import('../app/shell.js');
    global.window = { innerWidth: 1200, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} };
    const html = ReactDOMServer.renderToStaticMarkup(h(AppSidebar, {
      view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
      settings: { districtName: 'Test' }, onOpenModal: () => {}, onLoadFiles: () => {},
      onSaveSession: () => {}, onRestoreSession: () => {}, loadMsg: '', perm: () => true,
      betaMode: false, panelVis: {}, initialCollapsed: true,
    }));
    expect(html).not.toContain('Meridian');
    expect(html).not.toContain('>Home<');
  });
});
