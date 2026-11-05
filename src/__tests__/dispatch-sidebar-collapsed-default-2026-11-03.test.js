// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-03: "set the side bar menu to collapsed by default." AppSidebar's
// `collapsed` (the whole-sidebar icon-rail mode, shell.js) defaulted to true via a new
// `initialCollapsed` prop that itself defaulted to true.
//
// REVERSED 2026-11-05 (owner): the icon-only rail on first open read as confusing, not a
// convenience -- default flipped back to EXPANDED (full labeled nav). `initialCollapsed` now
// defaults to false. Every other sidebar test explicitly passes initialCollapsed:false to keep
// exercising the FULL nav content/click paths those tests were written for, so THIS is still the
// one file that asserts the real production default (no prop passed at all, exactly how App.js's
// own <AppSidebar> call site renders it) rather than relying on any other file's setup to prove it.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

global.performance = global.performance || { now: () => 0 };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { AppSidebar } = await import('../app/shell.js');
const h = React.createElement;

describe('AppSidebar -- expanded by default (owner reversal 2026-11-05)', () => {
  let container, root;
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('renders the full labeled nav (expanded) on first mount with no initialCollapsed prop passed', () => {
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
    const logo = [...container.querySelectorAll('div')].find(d => d.title === 'Collapse sidebar');
    expect(logo, 'expected the collapse toggle to read "Collapse sidebar" (i.e. already expanded)').toBeTruthy();
    // Nav label text renders in expanded mode.
    expect(container.textContent).toContain('Meridian');
  });

  it('clicking the toggle collapses it, and the toggle title flips to "Expand sidebar"', () => {
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
    const logo = [...container.querySelectorAll('div')].find(d => d.title === 'Collapse sidebar');
    act(() => { logo.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const logoAfter = [...container.querySelectorAll('div')].find(d => d.title === 'Expand sidebar');
    expect(logoAfter).toBeTruthy();
  });
});
