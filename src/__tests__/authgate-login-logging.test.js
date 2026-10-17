// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-10-17 (app_access_log, "usage logs/reports for auditing") -- AuthGate.js
// now logs a real credential-based sign-in. Must fire on SIGNED_IN and must NOT fire on
// INITIAL_SESSION (an already-persisted session restored on page load/refresh) or
// TOKEN_REFRESHED (a silent background renewal) -- those aren't new credential checks, and
// logging them would make every page load/refresh look like a fresh login.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// vi.mock is hoisted above any top-level const, so the mock's own state must be created inside
// vi.hoisted() rather than referenced from an outer variable declared after it.
const { logAppAccessMock, mockSupabase, getAuthStateCallback } = vi.hoisted(() => {
  let authStateCallback = null;
  const logAppAccessMock = vi.fn().mockResolvedValue({ error: null });
  const mockSupabase = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn((cb) => {
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
  };
  return { logAppAccessMock, mockSupabase, getAuthStateCallback: () => authStateCallback };
});

vi.mock('../lib/supabase.js', () => ({
  supabase: mockSupabase,
  logAppAccess: (...args) => logAppAccessMock(...args),
}));

import { AuthGate } from '../components/AuthGate.js';

async function mount() {
  // AuthGate's auth-state effect is a no-op on 'localhost' (the dev-bypass hostname) -- override
  // so the real effect under test actually runs, matching how a deployed Vercel host behaves.
  Object.defineProperty(window, 'location', {
    value: { ...window.location, hostname: 'meridianbi.vercel.app' }, writable: true,
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(AuthGate, null, React.createElement('div', null, 'app'))); });
  await act(async () => { await Promise.resolve(); });
  return { container, root };
}

describe('AuthGate — app_access_log login logging', () => {
  let container, root;
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    logAppAccessMock.mockClear();
  });

  it('logs a login on a real SIGNED_IN event', async () => {
    ({ container, root } = await mount());
    expect(getAuthStateCallback()).toBeTruthy();
    await act(async () => { getAuthStateCallback()('SIGNED_IN', { user: { id: 'u1' } }); });
    expect(logAppAccessMock).toHaveBeenCalledWith('login');
  });

  it('does NOT log on INITIAL_SESSION (a restored session, not a new credential check)', async () => {
    ({ container, root } = await mount());
    await act(async () => { getAuthStateCallback()('INITIAL_SESSION', { user: { id: 'u1' } }); });
    expect(logAppAccessMock).not.toHaveBeenCalled();
  });

  it('does NOT log on TOKEN_REFRESHED (a silent background renewal)', async () => {
    ({ container, root } = await mount());
    await act(async () => { getAuthStateCallback()('TOKEN_REFRESHED', { user: { id: 'u1' } }); });
    expect(logAppAccessMock).not.toHaveBeenCalled();
  });

  it('does NOT log on sign-out', async () => {
    ({ container, root } = await mount());
    await act(async () => { getAuthStateCallback()('SIGNED_OUT', null); });
    expect(logAppAccessMock).not.toHaveBeenCalled();
  });
});
