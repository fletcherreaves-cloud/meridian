// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-03: "set the side bar menu to collapsed by default." AppSidebar's
// `collapsed` (the whole-sidebar icon-rail mode, shell.js) now defaults to true via a new
// `initialCollapsed` prop that itself defaults to true -- every other sidebar test explicitly
// passes initialCollapsed:false to keep exercising the FULL nav content/click paths those tests
// were written for, so THIS is the one file that asserts the real production default (no prop
// passed at all, exactly how App.js's own <AppSidebar> call site renders it) rather than relying
// on any other file's setup to prove it.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

global.performance = global.performance || { now: () => 0 };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { AppSidebar } = await import('../app/shell.js');
const h = React.createElement;

describe('AppSidebar -- collapsed by default (owner request 2026-11-03)', () => {
  let container, root;
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('renders icon-rail (collapsed) on first mount with no initialCollapsed prop passed', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(h(AppSidebar, {
        view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
        settings: { districtName: 'Test' }, onOpenModal: () => {}, onLoadFiles: () => {},
        onSaveSession: () => {}, onRestoreSession: () => {}, loadMsg: '', perm: () => true,
        betaMode: false, panelVis: {},
      }));
    });
    const logo = [...container.querySelectorAll('div')].find(d => d.title === 'Expand sidebar');
    expect(logo, 'expected the collapse toggle to read "Expand sidebar" (i.e. already collapsed)').toBeTruthy();
    // No nav label text renders in icon-rail mode.
    expect(container.textContent).not.toContain('Meridian');
  });

  it('clicking the toggle expands it, and the toggle title flips to "Collapse sidebar"', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(h(AppSidebar, {
        view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
        settings: { districtName: 'Test' }, onOpenModal: () => {}, onLoadFiles: () => {},
        onSaveSession: () => {}, onRestoreSession: () => {}, loadMsg: '', perm: () => true,
        betaMode: false, panelVis: {},
      }));
    });
    const logo = [...container.querySelectorAll('div')].find(d => d.title === 'Expand sidebar');
    act(() => { logo.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Meridian');
    const logoAfter = [...container.querySelectorAll('div')].find(d => d.title === 'Collapse sidebar');
    expect(logoAfter).toBeTruthy();
  });
});
