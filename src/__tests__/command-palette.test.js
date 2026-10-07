// @vitest-environment happy-dom
// @ts-nocheck
// Command palette (2026-10-07) — a reachable-from-anywhere presentation of the SAME navIndex/
// navResults/goNavResult dispatch-nav-search.test.js already proves correct for the inline
// sidebar search box. This file exercises the NEW surface only: the global ⌘K/Ctrl+K shortcut,
// the mf:openPalette event AppTopbar's visible button dispatches (decoupled the same way
// mf:toggleNav already is), Escape/backdrop dismissal, and that picking a result still reaches
// onOpenModal — not a second, independent search implementation to drift from the first.
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

const paletteInput = (container) => container.querySelector('input[placeholder="🔍 Search panels…"]');

describe('command palette', () => {
  it('is not rendered until opened', () => {
    const { container } = mountSidebar();
    expect(paletteInput(container)).toBeFalsy();
  });

  it('Ctrl+K opens it and focuses the input', () => {
    const { container } = mountSidebar();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })); });
    const input = paletteInput(container);
    expect(input).toBeTruthy();
    expect(document.activeElement).toBe(input);
  });

  it('Meta+K (Mac ⌘K) opens it too', () => {
    const { container } = mountSidebar();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })); });
    expect(paletteInput(container)).toBeTruthy();
  });

  it('the mf:openPalette event (AppTopbar\'s visible search button) opens it too, decoupled the same way mf:toggleNav already is', () => {
    const { container } = mountSidebar();
    act(() => { window.dispatchEvent(new CustomEvent('mf:openPalette')); });
    expect(paletteInput(container)).toBeTruthy();
  });

  it('typing filters results and clicking one opens the panel AND closes the palette', () => {
    const { container, onOpenModal } = mountSidebar();
    act(() => { window.dispatchEvent(new CustomEvent('mf:openPalette')); });
    const input = paletteInput(container);
    act(() => { setNativeValue(input, 'Signals'); });
    const match = [...container.querySelectorAll('div')].find(d => d.textContent === 'Signals');
    expect(match).toBeTruthy();
    act(() => { match.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onOpenModal).toHaveBeenCalledWith('signals');
    expect(paletteInput(container)).toBeFalsy();
  });

  it('Escape closes it without opening anything', () => {
    const { container, onOpenModal } = mountSidebar();
    act(() => { window.dispatchEvent(new CustomEvent('mf:openPalette')); });
    const input = paletteInput(container);
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(paletteInput(container)).toBeFalsy();
    expect(onOpenModal).not.toHaveBeenCalled();
  });

  it('clicking the backdrop closes it without opening anything', () => {
    const { container, onOpenModal } = mountSidebar();
    act(() => { window.dispatchEvent(new CustomEvent('mf:openPalette')); });
    expect(paletteInput(container)).toBeTruthy();
    // The backdrop is the palette input's great-grandparent (overlay root) -- click it directly,
    // not the centered card, which stops propagation.
    const backdrop = paletteInput(container).closest('[style*="position: fixed"]');
    expect(backdrop).toBeTruthy();
    act(() => { backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(paletteInput(container)).toBeFalsy();
    expect(onOpenModal).not.toHaveBeenCalled();
  });

  it('still shows the pre-existing inline sidebar search box unchanged (purely additive, not a replacement)', () => {
    const { container } = mountSidebar();
    expect(container.querySelector('input[placeholder="🔍 Search…"]')).toBeTruthy();
  });
});
