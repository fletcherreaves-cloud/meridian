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
