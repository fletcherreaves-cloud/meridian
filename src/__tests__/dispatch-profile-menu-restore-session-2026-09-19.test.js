// @vitest-environment happy-dom
// @ts-nocheck
// Backlog survey (2026-09-19): "Save/Restore Session -- relocate in nav." Both actions used to be
// two bare navItem() calls tacked onto the end of AppSidebar's nav list, outside panel-registry.js
// entirely -- 'Save Session' duplicated a home it already had in ProfileMenu ("Save session to
// file"), and 'Restore Session' had no other home at all. Both now live only in ProfileMenu
// (account-icon dropdown, top bar) -- this mounts the real exported AppTopbar (which renders
// ProfileMenu internally) and drives the actual click path.
//
// Per "would this verification still pass if reverted?": before this change ProfileMenu had no
// Restore item at all, so opening the menu and looking for "Restore session from file" would fail
// against the old code.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AppTopbar } from '../app/shell.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

function mount(overrides = {}) {
  const onRestoreSession = vi.fn();
  const onSaveSession = vi.fn();
  const props = {
    view: 'command', selStore: null, stores: [], ds: {}, settings: {},
    dateRange: null, onDateChange: () => {}, locScope: 'all', onScopeChange: () => {},
    onOpenModal: () => {}, onLoadFiles: () => {}, onSaveSession, onRestoreSession,
    loadMsg: '', setView: () => {}, sessionBanner: null, onClearSession: () => {},
    userRole: 'admin', onOpenAdmin: null, perm: () => true, betaMode: false,
    onToggleBeta: () => {},
    ...overrides,
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(React.createElement(AppTopbar, props)));
  return { onRestoreSession, onSaveSession };
}

describe('AppTopbar/ProfileMenu -- Restore Session relocated from the sidebar tail', () => {
  it('opening the account menu shows both Save and Restore session actions', () => {
    mount();
    const accountBtn = container.querySelector('button[title="Account"]');
    expect(accountBtn).toBeTruthy();
    act(() => { accountBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Save session to file');
    expect(container.textContent).toContain('Restore session from file');
  });

  it('clicking Restore session from file invokes the real onRestoreSession handler', () => {
    const { onRestoreSession } = mount();
    const accountBtn = container.querySelector('button[title="Account"]');
    act(() => { accountBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const restoreBtn = [...container.querySelectorAll('button')]
      .find(b => b.textContent.includes('Restore session from file'));
    expect(restoreBtn).toBeTruthy();
    act(() => { restoreBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onRestoreSession).toHaveBeenCalledTimes(1);
  });
});
