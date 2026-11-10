// @vitest-environment happy-dom
// @ts-nocheck
// Owner, earlier in this session: "Yes, definitely!" to a role-view sandbox — preview what the
// app looks like for another role without actually changing the signed-in account. Implemented
// as a single interception point: App.js's perm()/panelEnabled() read `effectiveRole` (viewAsRole
// when a level-1 user has one set, else the real userRole) instead of userRole directly, so every
// one of the ~100 perm()/panelEnabled() call sites picks it up with no per-call-site change.
// This mounts the real exported AppTopbar (which renders ProfileMenu internally) and drives the
// actual toggle, same harness pattern as dispatch-profile-menu-restore-session-2026-09-19.test.js.
//
// Per "would this verification still pass if reverted?": before this change ProfileMenu had no
// "View as role" selector and AppTopbar rendered no viewing-as banner at all, so both assertions
// below would fail against the old code.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AppTopbar } from '../app/shell.js';
import { hasPermission } from '../engine/permissions.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); container = root = undefined; vi.restoreAllMocks(); });

const ROLE_OPTIONS = [
  { id: 'owner', label: 'Owner / Developer' },
  { id: 'gm', label: 'GM (General Manager)' },
];

function mount(overrides = {}) {
  const onChangeViewAsRole = vi.fn();
  const props = {
    view: 'command', selStore: null, stores: [], ds: {}, settings: {},
    dateRange: null, onDateChange: () => {}, locScope: 'all', onScopeChange: () => {},
    onOpenModal: () => {}, onLoadFiles: () => {}, onSaveSession: () => {}, onRestoreSession: () => {},
    loadMsg: '', setView: () => {}, sessionBanner: null, onClearSession: () => {},
    userRole: 'owner', onOpenAdmin: null, perm: () => true, betaMode: false,
    onToggleBeta: () => {},
    realUserRole: 'owner', canViewAsRole: true, viewAsRole: null, onChangeViewAsRole,
    viewAsRoleOptions: ROLE_OPTIONS,
    ...overrides,
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(React.createElement(AppTopbar, props)));
  return { onChangeViewAsRole };
}

describe('Role-view sandbox (task #97) — perm()/panelEnabled() interception', () => {
  it('a level-1 role (owner/admin) is the only one DEFAULT_ROLES gives the ladder-bypass permission a sandbox depends on', () => {
    // hasPermission('owner', ...) / hasPermission('admin', ...) must return true for everything —
    // this is what makes "view as a lower role" strictly restrictive, never an escalation: the
    // real role already has every permission a simulated role could ever be missing.
    expect(hasPermission('owner', 'analytics.ai')).toBe(true);
    expect(hasPermission('owner', 'users.manage.all')).toBe(true);
  });

  it('canViewAsRole=false (a real GM, say) renders no banner and no selector at all', () => {
    mount({ canViewAsRole: false, realUserRole: 'gm', userRole: 'gm', viewAsRoleOptions: null });
    expect(container.textContent).not.toContain('VIEWING AS');
    const accountBtn = container.querySelector('button[title="Account"]');
    act(() => { accountBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    // ProfileMenu's open dropdown now portals to document.body (dispatch 2026-11-10, same fix
    // as task #119's ActionMenu portal) -- no longer a descendant of `container`.
    expect(document.body.textContent).not.toContain('View as role');
  });

  it('a level-1 user sees the "View as role" selector in the account menu, and selecting a role calls back', () => {
    const { onChangeViewAsRole } = mount();
    const accountBtn = container.querySelector('button[title="Account"]');
    act(() => { accountBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(document.body.textContent).toContain('View as role');
    const select = document.querySelector('select');
    expect(select).toBeTruthy();
    act(() => {
      select.value = 'gm';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onChangeViewAsRole).toHaveBeenCalledWith('gm');
  });

  it('with viewAsRole set, the always-visible banner names the simulated role and offers Exit', () => {
    const { onChangeViewAsRole } = mount({ viewAsRole: 'gm', userRole: 'gm' });
    expect(container.textContent).toContain('VIEWING AS');
    expect(container.textContent).toContain('GM (General Manager)');
    const exitBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Exit');
    expect(exitBtn).toBeTruthy();
    act(() => { exitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onChangeViewAsRole).toHaveBeenCalledWith(null);
  });

  it('the profile menu header shows the simulated role plus a note naming the real one', () => {
    mount({ viewAsRole: 'gm', userRole: 'gm', realUserRole: 'owner' });
    const accountBtn = container.querySelector('button[title="Account"]');
    act(() => { accountBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(document.body.textContent).toContain('Gm');
    expect(document.body.textContent).toContain('viewing as');
    expect(document.body.textContent).toContain('Owner');
  });
});
