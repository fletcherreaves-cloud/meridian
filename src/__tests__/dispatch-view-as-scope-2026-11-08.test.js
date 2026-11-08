// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-08: "add a way for me to select what patch or operator or store to
// mimic when I select in a alternate view. Tag @ would be awesome!" Extends the View As Role
// sandbox (task #97, dispatch-view-as-role-sandbox-2026-11-05.test.js) with a second selector
// that narrows a store/patch-altitude simulation down to one real store or one real supervisor's
// patch, plus a visible "@<name>" tag in the always-on banner confirming what's being mimicked.
// Operator scoping already has its own self-service picker on Curated Home itself (The Ledger,
// v5.689) and is NOT duplicated here.
//
// Per "would this verification still pass if reverted?": before this change, ProfileMenu's
// second select and the banner's "@" tag didn't exist at all, so these assertions fail against
// the old code.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AppTopbar } from '../app/shell.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); container = root = undefined; vi.restoreAllMocks(); });

const ROLE_OPTIONS = [
  { id: 'owner', label: 'Owner / Developer' },
  { id: 'gm', label: 'GM (General Manager)' },
  { id: 'do', label: 'DO (District Ops)' },
];
// Real-shaped options, same {id,label} contract App.js's viewAsScopeOptions produces.
const STORE_SCOPE_OPTIONS = [{ id: '3708', label: 'Ardmore-Broadway' }, { id: '5183', label: 'Chickasha-So 4th' }];
const PATCH_SCOPE_OPTIONS = [{ id: 'Robert Spencer', label: 'Robert Spencer' }, { id: 'Krystiana Langford', label: 'Krystiana Langford' }];

function mount(overrides = {}) {
  const onChangeViewAsRole = vi.fn();
  const onChangeViewAsScope = vi.fn();
  const props = {
    view: 'command', selStore: null, stores: [], ds: {}, settings: {},
    dateRange: null, onDateChange: () => {}, locScope: 'all', onScopeChange: () => {},
    onOpenModal: () => {}, onLoadFiles: () => {}, onSaveSession: () => {}, onRestoreSession: () => {},
    loadMsg: '', setView: () => {}, sessionBanner: null, onClearSession: () => {},
    userRole: 'owner', onOpenAdmin: null, perm: () => true, betaMode: false,
    onToggleBeta: () => {},
    realUserRole: 'owner', canViewAsRole: true, viewAsRole: null, onChangeViewAsRole,
    viewAsRoleOptions: ROLE_OPTIONS,
    viewAsScope: null, onChangeViewAsScope, viewAsScopeOptions: [], viewAsScopeLabel: null,
    ...overrides,
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(React.createElement(AppTopbar, props)));
  return { onChangeViewAsRole, onChangeViewAsScope };
}

describe('View As Role sandbox — scope picker + "@" tag (owner request 2026-11-08)', () => {
  it('a store-altitude simulation with real store options shows a second select; picking one calls back', () => {
    const { onChangeViewAsScope } = mount({ viewAsRole: 'gm', userRole: 'gm', viewAsScopeOptions: STORE_SCOPE_OPTIONS, viewAsScopeLabel: 'Store' });
    const accountBtn = container.querySelector('button[title="Account"]');
    act(() => { accountBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const selects = container.querySelectorAll('select');
    expect(selects.length).toBe(2); // role select + scope select
    const scopeSelect = selects[1];
    expect(scopeSelect.textContent).toContain('Ardmore-Broadway');
    act(() => { scopeSelect.value = '3708'; scopeSelect.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(onChangeViewAsScope).toHaveBeenCalledWith('3708');
  });

  it('a patch-altitude simulation offers real supervisor names, not store names', () => {
    mount({ viewAsRole: 'do', userRole: 'do', viewAsScopeOptions: PATCH_SCOPE_OPTIONS, viewAsScopeLabel: 'Patch' });
    const accountBtn = container.querySelector('button[title="Account"]');
    act(() => { accountBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Krystiana Langford');
    expect(container.textContent).toContain('which patch');
  });

  it('no scope options (e.g. a district-altitude role) means no second select at all', () => {
    mount({ viewAsRole: 'owner', userRole: 'owner', viewAsScopeOptions: [], viewAsScopeLabel: null });
    const accountBtn = container.querySelector('button[title="Account"]');
    act(() => { accountBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelectorAll('select').length).toBe(1); // role select only
  });

  it('with a scope picked, the always-on banner tags it with "@<name>"', () => {
    mount({ viewAsRole: 'gm', userRole: 'gm', viewAsScope: '3708', viewAsScopeOptions: STORE_SCOPE_OPTIONS, viewAsScopeLabel: 'Store' });
    expect(container.textContent).toContain('VIEWING AS');
    expect(container.textContent).toContain('@ Ardmore-Broadway');
  });

  it('with no scope picked, the banner names only the role — no stray "@"', () => {
    mount({ viewAsRole: 'gm', userRole: 'gm', viewAsScopeOptions: STORE_SCOPE_OPTIONS, viewAsScopeLabel: 'Store' });
    expect(container.textContent).toContain('VIEWING AS');
    expect(container.textContent).not.toContain('@ ');
  });
});
