// @vitest-environment happy-dom
// @ts-nocheck
// Task #91 follow-on (2026-11-07): a brand-new user's first sign-in (OTP verified -> password
// set) now shows a one-time notification-consent screen before entering the app, instead of
// the browser's own cold permission prompt. Mirrors authgate-login-logging.test.js's mocked-
// supabase + vi.hoisted shape.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { setConsentMock, detectCapabilityMock, subscribeMock, mockSupabase, getAuthStateCallback } = vi.hoisted(() => {
  let authStateCallback = null;
  const setConsentMock = vi.fn().mockResolvedValue({ saved: true });
  const detectCapabilityMock = vi.fn().mockResolvedValue('unsupported');
  const subscribeMock = vi.fn().mockResolvedValue({ ok: true });
  const mockSupabase = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn((cb) => {
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
    },
  };
  return { setConsentMock, detectCapabilityMock, subscribeMock, mockSupabase, getAuthStateCallback: () => authStateCallback };
});

vi.mock('../lib/supabase.js', () => ({
  supabase: mockSupabase,
  logAppAccess: vi.fn().mockResolvedValue({ error: null }),
  setNotificationConsent: (...args) => setConsentMock(...args),
}));

vi.mock('../lib/push-subscribe.js', () => ({
  detectPushCapability: (...args) => detectCapabilityMock(...args),
  subscribeToPush: (...args) => subscribeMock(...args),
}));

import { AuthGate } from '../components/AuthGate.js';

async function mount() {
  // 'localhost' bypasses AuthGate entirely -- override so the real flow under test runs.
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

function setValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function findBtn(container, text) {
  return Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes(text));
}

// Drives AuthGate from the login screen, through the forgot-password/OTP-invite flow that is
// how every new account is onboarded today, through setting a first password, and lands on the
// notification-consent screen (not yet dismissed).
async function driveToConsentScreen(container) {
  await act(async () => { findBtn(container, 'Forgot password?').click(); });
  await act(async () => { setValue(container.querySelector('input[type="email"]'), 'new.gm@example.com'); });
  mockSupabase.auth.signInWithOtp = vi.fn().mockResolvedValue({ error: null });
  await act(async () => { findBtn(container, 'Send Code').click(); });
  await act(async () => { await Promise.resolve(); });

  mockSupabase.auth.verifyOtp = vi.fn().mockImplementation(async () => {
    await act(async () => { getAuthStateCallback()('SIGNED_IN', { user: { id: 'u1' } }); });
    return { error: null };
  });
  await act(async () => { setValue(container.querySelector('input[inputmode="numeric"]'), '123456'); });
  await act(async () => { findBtn(container, 'Verify Code').click(); });
  await act(async () => { await Promise.resolve(); });

  const pwInputs = container.querySelectorAll('input[type="password"]');
  await act(async () => { setValue(pwInputs[0], 'correct-horse-9'); setValue(pwInputs[1], 'correct-horse-9'); });
  await act(async () => { findBtn(container, 'Set Password & Enter').click(); });
  await act(async () => { await Promise.resolve(); });
}

describe('AuthGate — notification-consent screen on a brand-new user sign-in', () => {
  let container, root;
  beforeEach(() => {
    setConsentMock.mockClear();
    detectCapabilityMock.mockClear();
    subscribeMock.mockClear();
  });
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
  });

  it('shows the consent screen after a first-time password set, not the app directly, and "Not now" declines + enters the app', async () => {
    detectCapabilityMock.mockResolvedValue('off');
    ({ container, root } = await mount());
    await driveToConsentScreen(container);

    expect(container.textContent).not.toContain('app');
    expect(container.textContent).toContain('Stay in the Loop');

    await act(async () => { findBtn(container, 'Not now').click(); });
    await act(async () => { await Promise.resolve(); });

    expect(setConsentMock).toHaveBeenCalledWith('declined');
    expect(subscribeMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain('app');
  });

  it('"Enable Alerts" subscribes the device, records "granted", and then enters the app', async () => {
    detectCapabilityMock.mockResolvedValue('off');
    subscribeMock.mockResolvedValue({ ok: true });
    ({ container, root } = await mount());
    await driveToConsentScreen(container);

    await act(async () => { findBtn(container, 'Enable Alerts').click(); });
    await act(async () => { await Promise.resolve(); });

    expect(subscribeMock).toHaveBeenCalled();
    expect(setConsentMock).toHaveBeenCalledWith('granted');
    expect(container.textContent).toContain('app');
  });

  it('shows a plain explanation + "Continue" (no Enable button) when the browser is unsupported, and records nothing else to try', async () => {
    detectCapabilityMock.mockResolvedValue('unsupported');
    ({ container, root } = await mount());
    await driveToConsentScreen(container);

    expect(container.textContent).toContain('Device Alerts');
    expect(container.textContent).toContain("aren’t supported in this browser");
    expect(findBtn(container, 'Enable Alerts')).toBeUndefined();

    await act(async () => { findBtn(container, 'Continue').click(); });
    await act(async () => { await Promise.resolve(); });

    expect(setConsentMock).toHaveBeenCalledWith('declined');
    expect(container.textContent).toContain('app');
  });
});
