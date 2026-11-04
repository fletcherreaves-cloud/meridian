// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-02: "condense sidebar nav into expand/collapse sections." Extends the
// SAME collapsible-header mechanism the Deep Dive section already uses (nav-regroup-v2.test.js)
// to the ordinary SECTIONS-driven body, v2-only -- classic stays the exact flat pre-2026-10-07
// render forever (shell-nav-snapshot.test.js's own baseline).
//
// Default flipped 2026-11-03 (owner-reported: "side panel menus still opening expanded") --
// originally shipped all-OPEN by default; now starts all-COLLAPSED (see shell.js's own comment
// on collapsedSections for why). A section expands once its header is clicked (or, per the
// accordion rule below, once ANOTHER section's header is clicked and this one gets auto-closed
// back down -- same mechanism either way).
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
  it('v2 default (changed 2026-11-03): ordinary sections render COLLAPSED -- a condensed first look, panels hidden until opened', () => {
    const { container } = mountSidebar();
    // Section headers (names) are always visible, collapsed or not.
    expect(container.textContent).toMatch(/Operations/);
    // Their panels are not, until a header is clicked.
    expect(container.textContent).not.toContain(OPS_PANEL.label);
    expect(container.textContent).not.toContain(REPORTS_PANEL.label);
  });

  it('clicking a collapsed section header expands it, showing its panels; clicking again re-collapses', () => {
    const { container, onOpenModal } = mountSidebar();
    expect(container.textContent).not.toContain(OPS_PANEL.label);
    const header = byText(container, 'Operations');
    expect(header, 'Operations section header not found').toBeTruthy();
    act(() => { header.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain(OPS_PANEL.label);
    // The panel is reachable through onOpenModal while expanded.
    const label = [...container.querySelectorAll('span')].find(s => s.textContent === OPS_PANEL.label);
    act(() => { label.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onOpenModal).toHaveBeenCalledWith(OPS_PANEL.id);
  });

  it('closing an already-open section leaves every other (already-collapsed) section untouched', () => {
    const { container } = mountSidebar();
    const header = byText(container, 'Operations');
    act(() => { header.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); // open
    expect(container.textContent).toContain(OPS_PANEL.label);
    act(() => { header.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); // close
    expect(container.textContent).not.toContain(OPS_PANEL.label);
    // Reports was never touched -- stayed collapsed the whole time, same as the default.
    expect(container.textContent).not.toContain(REPORTS_PANEL.label);
    expect(container.textContent).toMatch(/Reports/); // the header label itself still renders
  });

  it('accordion (owner request 2026-11-03): opening a section auto-collapses every other open section', () => {
    const { container } = mountSidebar();
    const reportsHeader = byText(container, 'Reports');
    const opsHeader = byText(container, 'Operations');
    act(() => { reportsHeader.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); // open Reports
    expect(container.textContent).toContain(REPORTS_PANEL.label);
    // Opening Operations should now collapse Reports automatically -- the header label itself
    // still renders (collapsed sections keep their header, only their items hide), so assert on
    // the PANEL label, not the section name.
    act(() => { opsHeader.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain(OPS_PANEL.label);
    expect(container.textContent).not.toContain(REPORTS_PANEL.label);
  });

  it('owner request 2026-11-03: picking a panel in an expanded section auto-collapses that section', () => {
    const { container, onOpenModal } = mountSidebar();
    const opsHeader = byText(container, 'Operations');
    act(() => { opsHeader.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); // open it first
    expect(container.textContent).toContain(OPS_PANEL.label);
    const label = [...container.querySelectorAll('span')].find(s => s.textContent === OPS_PANEL.label);
    act(() => { label.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    // The click still navigates (pre-existing behavior)...
    expect(onOpenModal).toHaveBeenCalledWith(OPS_PANEL.id);
    // ...and the section it lived in is now collapsed again, same as clicking its header would do.
    expect(container.textContent).not.toContain(OPS_PANEL.label);
    // Unaffected sections (e.g. Reports) stay exactly as they were (collapsed, the default).
    expect(container.textContent).not.toContain(REPORTS_PANEL.label);
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
