// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-02: "condense sidebar nav into expand/collapse sections." Extends the
// SAME collapsible-header mechanism the Deep Dive section already uses (nav-regroup-v2.test.js)
// to the ordinary SECTIONS-driven body, v2-only -- classic stays the exact flat pre-2026-10-07
// render forever (shell-nav-snapshot.test.js's own baseline). Default is OPEN so v2's existing
// default look is unchanged; a section only collapses once its header is clicked.
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PANEL_BY_ID } from '../app/panel-registry.js';

global.performance = global.performance || { now: () => 0 };

const { AppSidebar } = await import('../app/shell.js');
const h = React.createElement;

function mountSidebar(settingsOverride = {}, extra = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onOpenModal = vi.fn();
  act(() => {
    root.render(h(AppSidebar, {
      view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
      settings: { districtName: 'Test', ...settingsOverride }, onOpenModal, onLoadFiles: () => {},
      onSaveSession: () => {}, onRestoreSession: () => {}, loadMsg: '', perm: () => true,
      betaMode: false, panelVis: {}, initialCollapsed: false, ...extra,
    }));
  });
  return { container, root, onOpenModal };
}

// A real kind:'nav' panel in the 'operations' section -- not Test Kitchen, not Deep Dive.
const OPS_PANEL = PANEL_BY_ID['graded-visits'];
// A real kind:'nav' panel in the 'reports' section -- used to tell "header still rendered" (the
// section label text, always present) apart from "its panels are actually visible".
const REPORTS_PANEL = PANEL_BY_ID['above-store'];

const byText = (container, text) =>
  [...container.querySelectorAll('div')].find(d => d.textContent.includes(text) && d.textContent.trim().length < text.length + 20);

describe('AppSidebar — section collapse/expand (v2, owner request 2026-11-02)', () => {
  it('v2 default: ordinary sections render open (unchanged default look) with their panels visible', () => {
    const { container } = mountSidebar();
    expect(container.textContent).toContain(OPS_PANEL.label);
  });

  it('clicking a section header collapses it, hiding its panels; clicking again re-expands', () => {
    const { container, onOpenModal } = mountSidebar();
    expect(container.textContent).toContain(OPS_PANEL.label);
    const header = byText(container, 'Operations');
    expect(header, 'Operations section header not found').toBeTruthy();
    act(() => { header.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).not.toContain(OPS_PANEL.label);
    act(() => { header.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain(OPS_PANEL.label);
    // The panel is still reachable through onOpenModal once re-expanded.
    const label = [...container.querySelectorAll('span')].find(s => s.textContent === OPS_PANEL.label);
    act(() => { label.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onOpenModal).toHaveBeenCalledWith(OPS_PANEL.id);
  });

  it('collapsing one section leaves other sections untouched', () => {
    const { container } = mountSidebar();
    const header = byText(container, 'Operations');
    act(() => { header.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).not.toContain(OPS_PANEL.label);
    // Some other section's content (e.g. Reports) is still showing.
    expect(container.textContent).toMatch(/Reports/);
  });

  it('accordion (owner request 2026-11-03): re-opening a section auto-collapses every other section', () => {
    const { container } = mountSidebar();
    expect(container.textContent).toContain(REPORTS_PANEL.label);
    const opsHeader = byText(container, 'Operations');
    // Collapse Operations first (matches the test above) -- Reports' own panel stays visible.
    act(() => { opsHeader.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain(REPORTS_PANEL.label);
    // Re-opening Operations should now collapse Reports' panel (and every other section)
    // automatically -- the header label itself still renders (collapsed sections keep their
    // header, only their items hide), so assert on the PANEL label, not the section name.
    act(() => { opsHeader.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain(OPS_PANEL.label);
    expect(container.textContent).not.toContain(REPORTS_PANEL.label);
  });

  it('owner request 2026-11-03: picking a panel in an expanded section auto-collapses that section', () => {
    const { container, onOpenModal } = mountSidebar();
    expect(container.textContent).toContain(OPS_PANEL.label);
    const label = [...container.querySelectorAll('span')].find(s => s.textContent === OPS_PANEL.label);
    act(() => { label.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    // The click still navigates (pre-existing behavior)...
    expect(onOpenModal).toHaveBeenCalledWith(OPS_PANEL.id);
    // ...and the section it lived in is now collapsed, same as clicking its header would do.
    expect(container.textContent).not.toContain(OPS_PANEL.label);
    // Unaffected sections (e.g. Reports) are untouched by picking an Operations panel.
    expect(container.textContent).toContain(REPORTS_PANEL.label);
  });

  it('classic mode never shows a clickable section header -- stays the flat pre-2026-10-07 render', () => {
    const { container } = mountSidebar({ navStyle: 'classic' });
    expect(container.textContent).toContain(OPS_PANEL.label);
    const header = byText(container, 'Operations');
    // Classic's navLabel is a plain non-interactive div (no onClick), unlike v2's header.
    expect(header && header.onclick).toBeFalsy();
  });

  it('collapsed (icon-rail) sidebar mode keeps the plain non-interactive header -- same as classic', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onOpenModal = vi.fn();
    act(() => {
      root.render(h(AppSidebar, {
        view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
        settings: { districtName: 'Test' }, onOpenModal, onLoadFiles: () => {},
        onSaveSession: () => {}, onRestoreSession: () => {}, loadMsg: '', perm: () => true,
        betaMode: false, panelVis: {}, initialCollapsed: false,
      }));
    });
    // Collapse the whole sidebar via its own toggle (the "M" logo button).
    const logo = [...container.querySelectorAll('div')].find(d => d.title === 'Collapse sidebar');
    expect(logo, 'sidebar collapse toggle not found').toBeTruthy();
    act(() => { logo.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    // Label text still renders (pre-existing navLabel behavior, unaffected by this change), but
    // the header has no click handler -- nothing to toggle with no labels visible to click.
    const header = byText(container, 'Operations');
    expect(header, 'Operations label not found in icon-rail mode').toBeTruthy();
    expect(header.onclick).toBeFalsy();
    act(() => { root.unmount(); });
    container.remove();
  });
});
