// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-10-17 (app_access_log) -- extending beyond Pay Rate History/Security to the
// other restricted-tier panels. AdminPanel (User Management) is gated behind
// perm('users.manage.all'), admin/owner only -- the single tightest permission in the system --
// so it only ever mounts once that gate has already passed, same "no internal permState dance
// needed" reasoning as Pay Rate History. Renders the REAL AdminPanel from src/views/admin.js.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AdminPanel } from '../views/admin.js';

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
  await act(async () => { root.render(React.createElement(AdminPanel, props)); });
  await act(async () => { await Promise.resolve(); });
  return { container, root };
}

describe('AdminPanel (User Management)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); logAppAccessMock.mockClear(); });

  it('logs its own view on mount (app_access_log, owner request 2026-10-17)', async () => {
    ({ container, root } = await mount({ onClose: () => {}, orgRoles: [], setOrgRoles: () => {} }));
    expect(logAppAccessMock).toHaveBeenCalledWith('panel_view', 'admin-panel');
  });
});
