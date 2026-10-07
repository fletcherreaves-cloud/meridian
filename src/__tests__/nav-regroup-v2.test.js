// @vitest-environment happy-dom
// @ts-nocheck
// Nav regroup pilot (owner-approved 2026-10-07, ships ACTIVE by default — see constants.js
// DEF_SETTINGS.navStyle's own comment). 'v2' wraps the SAME Test Kitchen + optional-panel items
// shell-nav-snapshot.test.js already proves correct under 'classic' (nothing reclassified in
// panel-registry.js) in one collapsible "🔷 Deep Dive" header, collapsed by default, instead of
// two separately-rendered blocks. This file exercises the NEW grouping/collapse behavior only —
// not a second copy of the registry-correctness assertions classic mode already owns.
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PANEL_BY_ID } from '../app/panel-registry.js';

global.performance = global.performance || { now: () => 0 };

const { AppSidebar } = await import('../app/shell.js');
const h = React.createElement;

function mountSidebar(settingsOverride = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onOpenModal = vi.fn();
  act(() => {
    root.render(h(AppSidebar, {
      view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
      settings: { districtName: 'Test', ...settingsOverride }, onOpenModal, onLoadFiles: () => {},
      onSaveSession: () => {}, onRestoreSession: () => {}, loadMsg: '', perm: () => true,
      betaMode: false, panelVis: {},
    }));
  });
  return { container, root, onOpenModal };
}

const byText = (container, text) => [...container.querySelectorAll('div')].find(d => d.textContent.includes(text) && d.textContent.trim().length < text.length + 20);

describe('AppSidebar nav regroup — v2 (default, no settings.navStyle field at all)', () => {
  it('ships active even when settings carries no navStyle field (resilient default for pre-existing settings objects)', () => {
    const { container } = mountSidebar({}); // no navStyle key at all
    expect(container.textContent).toMatch(/Deep Dive/);
    expect(container.textContent).not.toMatch(/⚗ TEST KITCHEN/);
  });

  it('collapses Test Kitchen + optional panels under one closed "🔷 Deep Dive" header by default', () => {
    const { container } = mountSidebar();
    expect(container.textContent).toMatch(/Deep Dive/);
    // Closed by default -- a real Test Kitchen panel label is not in the flat text yet.
    expect(container.textContent).not.toMatch(/Projections/);
  });

  it('clicking the header reveals the same items classic mode renders flatly', () => {
    const { container } = mountSidebar();
    const header = byText(container, 'Deep Dive');
    expect(header, 'Deep Dive header not found').toBeTruthy();
    act(() => { header.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const testKitchenIds = Object.values(PANEL_BY_ID).filter(p => p.kind === 'test-kitchen');
    for (const p of testKitchenIds) expect(container.textContent).toContain(p.label);

    // Clicking again collapses it back.
    act(() => { header.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).not.toMatch(/Projections/);
  });

  it('still reaches a Deep Dive panel through onOpenModal once expanded and clicked', () => {
    const { container, onOpenModal } = mountSidebar();
    const header = byText(container, 'Deep Dive');
    act(() => { header.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    // The label renders as its own <span> inside the clickable row (navItem's shape: icon span +
    // label span as siblings under one div) -- not a <div> whose whole text is just the label.
    const projLabel = [...container.querySelectorAll('span')].find(s => s.textContent === 'Projections');
    expect(projLabel, 'Projections row not found after expanding Deep Dive').toBeTruthy();
    act(() => { projLabel.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onOpenModal).toHaveBeenCalledWith('proj');
  });

  it('renders no Deep Dive header at all under betaMode (same as classic — nothing to show)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(h(AppSidebar, {
        view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
        settings: { districtName: 'Test' }, onOpenModal: () => {}, onLoadFiles: () => {},
        onSaveSession: () => {}, onRestoreSession: () => {}, loadMsg: '', perm: () => true,
        betaMode: true, panelVis: {},
      }));
    });
    expect(container.textContent).not.toMatch(/Deep Dive/);
    act(() => { root.unmount(); });
    container.remove();
  });

  it('settings.navStyle:"classic" restores the exact pre-2026-10-07 flat rendering (the one-setting revert)', () => {
    const { container } = mountSidebar({ navStyle: 'classic' });
    expect(container.textContent).toMatch(/⚗ TEST KITCHEN/);
    expect(container.textContent).not.toMatch(/Deep Dive/);
    // Classic shows panels flat, no click needed.
    expect(container.textContent).toMatch(/Projections/);
  });
});
