// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-02: "role-based panel active/inactive toggles + delegated sub-role
// management." Covers the new primitive (isPanelEnabledForRole, permissions.js), its wiring
// into AppSidebar's nav + search index (shell.js), and the delegated-access scoping in
// AdminPanel/RolesTab (admin.js) -- a 'users.manage.lower' holder (e.g. a DO) sees only roles
// they outrank and can toggle their panels/permissions, but never rename/add/delete a role or
// see roles above their own level.
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DEFAULT_ROLES, isPanelEnabledForRole } from '../engine/permissions.js';
import { PANEL_BY_ID } from '../app/panel-registry.js';

global.performance = global.performance || { now: () => 0 };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, logAppAccess: () => Promise.resolve({ error: null }) };
});

const { AppSidebar } = await import('../app/shell.js');
const { AdminPanel } = await import('../views/admin.js');

describe('isPanelEnabledForRole (permissions.js)', () => {
  const roles = DEFAULT_ROLES.map(r => ({ ...r }));

  it('is true for any panel when no disabledPanels list exists on the role (default: everything visible)', () => {
    expect(isPanelEnabledForRole('proj', 'gm', roles)).toBe(true);
  });

  it('is false for a panel id explicitly in the role\'s disabledPanels', () => {
    const withDisabled = roles.map(r => r.id === 'gm' ? { ...r, disabledPanels: ['proj'] } : r);
    expect(isPanelEnabledForRole('proj', 'gm', withDisabled)).toBe(false);
    expect(isPanelEnabledForRole('attention', 'gm', withDisabled)).toBe(true); // untouched panel stays on
  });

  it('level-1 roles (admin/owner) always bypass, even if somehow listed as disabled', () => {
    const tampered = roles.map(r => r.id === 'owner' ? { ...r, disabledPanels: ['proj'] } : r);
    expect(isPanelEnabledForRole('proj', 'owner', tampered)).toBe(true);
  });

  it('fails closed for an unrecognized role id, matching hasPermission\'s own rule', () => {
    expect(isPanelEnabledForRole('proj', 'not-a-real-role', roles)).toBe(false);
  });
});

describe('AppSidebar — panelEnabled wiring (shell.js)', () => {
  const h = React.createElement;

  function mountSidebar(panelEnabled) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onOpenModal = vi.fn();
    act(() => {
      root.render(h(AppSidebar, {
        view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
        settings: { districtName: 'Test', navStyle: 'classic' }, onOpenModal, onLoadFiles: () => {},
        onSaveSession: () => {}, onRestoreSession: () => {}, loadMsg: '', perm: () => true,
        betaMode: false, panelVis: {}, panelEnabled, initialCollapsed: false,
      }));
    });
    return { container, root, onOpenModal };
  }

  it('hides a specific panel from the flat nav when panelEnabled denies it, leaving siblings untouched', () => {
    const gradedVisits = PANEL_BY_ID['graded-visits'];
    const { container } = mountSidebar(id => id !== gradedVisits.id);
    expect(container.textContent).not.toContain(gradedVisits.label);
    // A sibling in the same section (Operations) stays visible.
    expect(container.textContent).toContain(PANEL_BY_ID['customer-complaints'].label);
  });

  it('omitting panelEnabled entirely shows everything (fail-open fallback tier, same as `can`)', () => {
    const gradedVisits = PANEL_BY_ID['graded-visits'];
    const { container } = mountSidebar(undefined);
    expect(container.textContent).toContain(gradedVisits.label);
  });

  it('a role-disabled panel is also absent from the search index results', () => {
    const gradedVisits = PANEL_BY_ID['graded-visits'];
    const { container } = mountSidebar(id => id !== gradedVisits.id);
    const searchInput = container.querySelector('#nav-search');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(searchInput, gradedVisits.label);
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.textContent).toContain('No matches.');
  });
});

describe('AdminPanel / RolesTab — delegated sub-role management (admin.js)', () => {
  const h = React.createElement;

  function mount(props) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(h(AdminPanel, props)); });
    return { container, root };
  }

  it('a full-access caller (users.manage.all, e.g. admin/owner) sees every role including itself', () => {
    const { container } = mount({ onClose: () => {}, orgRoles: DEFAULT_ROLES, setOrgRoles: () => {}, userRole: 'owner' });
    expect(container.textContent).toContain('Users'); // Users tab present for full access
    // The default 'users' tab needs live Supabase (not configured in this test, or in CI) to
    // list actual accounts -- switch to Roles & Permissions, which lists roles from the
    // `orgRoles` prop directly and needs no backend, to assert the real thing under test: that
    // a full-access caller sees every role.
    const rolesTabBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Roles & Permissions');
    act(() => { rolesTabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    for (const r of DEFAULT_ROLES) expect(container.textContent).toContain(r.label);
  });

  it('a users.manage.lower caller (e.g. DO) sees only roles strictly below their own level, never peers or above', () => {
    const { container } = mount({ onClose: () => {}, orgRoles: DEFAULT_ROLES, setOrgRoles: () => {}, userRole: 'do' });
    // DO (level 3) outranks om/area_supervisor/gm/sm_am_dm (levels 4-7).
    expect(container.textContent).toContain('OM (Ops Manager)');
    expect(container.textContent).toContain('AS (Area Supervisor)');
    expect(container.textContent).toContain('GM (General Manager)');
    expect(container.textContent).toContain('SM / AM / DM');
    // Never itself, a peer, or anything above.
    expect(container.textContent).not.toContain('DO (District Ops)');
    expect(container.textContent).not.toContain('VP');
    expect(container.textContent).not.toContain('Owner / Developer');
    // Users tab is NOT offered to a scoped caller (unrelated tab, out of this feature's scope).
    expect(container.textContent).not.toContain('Users');
  });

  it('a scoped caller cannot add or delete a role (structural controls hidden)', () => {
    const { container } = mount({ onClose: () => {}, orgRoles: DEFAULT_ROLES, setOrgRoles: () => {}, userRole: 'do' });
    expect(container.textContent).not.toContain('+ New Role');
    expect(container.textContent).not.toContain('Delete');
  });

  it('a scoped caller CAN toggle panel access for a role they outrank', () => {
    const setOrgRoles = vi.fn();
    const { container } = mount({ onClose: () => {}, orgRoles: DEFAULT_ROLES, setOrgRoles, userRole: 'do' });
    const gmLabel = [...container.querySelectorAll('span')].find(s => s.textContent === 'GM (General Manager)');
    expect(gmLabel, 'GM role label not found').toBeTruthy();
    act(() => { gmLabel.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('Panel access');
  });
});
