// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-10-17 (app_access_log) -- extending beyond Pay Rate History/Security to the
// other restricted-tier panels. Settings is gated behind perm('settings.view') (VP/DO/Admin/Owner
// only), so it only ever mounts once that gate has already passed -- same "no internal permState
// dance needed" reasoning as Pay Rate History. Renders the REAL Settings from
// src/views/management.js (exported as `Settings`).
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { Settings } from '../views/management.js';
import { DEF_SETTINGS } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const logAppAccessMock = vi.fn().mockResolvedValue({ error: null });

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, logAppAccess: (...args) => logAppAccessMock(...args) };
});

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Settings, props)); });
  await act(async () => { await Promise.resolve(); });
  return { container, root };
}

describe('Settings panel', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); logAppAccessMock.mockClear(); });

  it('logs its own view on mount (app_access_log, owner request 2026-10-17)', async () => {
    ({ container, root } = await mount({ settings: DEF_SETTINGS, onUpdate: () => {}, onClose: () => {}, userRole: 'admin' }));
    expect(logAppAccessMock).toHaveBeenCalledWith('panel_view', 'settings');
  });
});

// "Your Access" indicator (fresh-eyes role audit, 2026-11-11, memory/finding-fresh-eyes-role-audit-
// 2026-11-11.md §4 Q11b, owner-approved "implement all of the items"). Identity tab is the default
// activeSection, so no tab click is needed before asserting.
describe('Settings panel — "Your Access" block', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); logAppAccessMock.mockClear(); });

  it('shows the role label and "All N stores" when accessibleLocs is unset', async () => {
    ({ container, root } = await mount({ settings: DEF_SETTINGS, onUpdate: () => {}, onClose: () => {}, userRole: 'gm', accessibleLocs: null }));
    const text = container.textContent;
    expect(text).toContain('Your Access');
    expect(text).toContain('GM'); // DEFAULT_ROLES label for 'gm'
    expect(text).toMatch(/All \d+ stores/);
    expect(text).toContain('No store restriction is set on your account');
  });

  it('shows the restricted-store count and names when accessibleLocs is a real subset', async () => {
    ({ container, root } = await mount({ settings: DEF_SETTINGS, onUpdate: () => {}, onClose: () => {}, userRole: 'gm', accessibleLocs: ['3708'] }));
    const text = container.textContent;
    expect(text).toMatch(/1 of \d+/);
    expect(text).toContain('Ardmore-Broadway');
    expect(text).toContain('This is intentional, set by an admin for your account');
  });

  it('falls back to the raw role id if it is not a recognized DEFAULT_ROLES id', async () => {
    ({ container, root } = await mount({ settings: DEF_SETTINGS, onUpdate: () => {}, onClose: () => {}, userRole: 'not_a_real_role', accessibleLocs: null }));
    expect(container.textContent).toContain('not_a_real_role');
  });
});
