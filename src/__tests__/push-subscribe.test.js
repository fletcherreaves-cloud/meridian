// @vitest-environment happy-dom
// @ts-nocheck
// src/lib/push-subscribe.js — pulled out of src/app/shell.js's DeviceAlertsToggle (task #91
// follow-on, 2026-11-07) so src/components/AuthGate.js's new notification-consent screen can
// reuse the same capability-detection + subscribe/unsubscribe logic without importing all of
// shell.js. Had zero test coverage before this extraction (DeviceAlertsToggle itself still
// doesn't have a dedicated test file) — covering the pure decode helper fully, and each
// detectPushCapability/subscribeToPush/unsubscribeFromPush branch at least once.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { upsertMock, deleteMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  deleteMock: vi.fn(),
}));
vi.mock('../lib/supabase.js', () => ({
  upsertPushSubscription: (...args) => upsertMock(...args),
  deletePushSubscription: (...args) => deleteMock(...args),
}));

import {
  urlBase64ToUint8Array, isIOSDevice, isStandaloneDisplay,
  detectPushCapability, subscribeToPush, unsubscribeFromPush,
} from '../lib/push-subscribe.js';

describe('urlBase64ToUint8Array', () => {
  it('decodes an unpadded base64url string to the expected bytes', () => {
    expect(Array.from(urlBase64ToUint8Array('AAEC'))).toEqual([0, 1, 2]);
  });
  it('pads a 2-character remainder correctly', () => {
    expect(Array.from(urlBase64ToUint8Array('AA'))).toEqual([0]);
  });
  it('substitutes base64url -/_ characters before decoding', () => {
    // '+' / '/' encode as '-' / '_' in base64url; both must decode to the same bytes.
    expect(Array.from(urlBase64ToUint8Array('--_-'))).toEqual(Array.from(urlBase64ToUint8Array('++/+')));
  });
});

// ── Browser-capability stubs ────────────────────────────────────────────────────
function stubSupportedBrowser({ permission = 'default', subscription = null } = {}) {
  globalThis.Notification = { permission, requestPermission: vi.fn().mockResolvedValue('granted') };
  window.PushManager = function () {};
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(subscription),
          subscribe: vi.fn().mockResolvedValue({
            toJSON: () => ({ endpoint: 'https://push.example/ep1', keys: { p256dh: 'p', auth: 'a' } }),
          }),
        },
      }),
    },
    configurable: true,
  });
}

function stubUserAgent(ua) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}

describe('detectPushCapability', () => {
  afterEach(() => {
    delete globalThis.Notification;
    delete window.PushManager;
  });

  it('reports unsupported when the browser has no serviceWorker/PushManager/Notification', async () => {
    expect(await detectPushCapability()).toBe('unsupported');
  });

  it('reports ios-install on an iPhone not running as a standalone home-screen app', async () => {
    stubSupportedBrowser();
    stubUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    expect(await detectPushCapability()).toBe('ios-install');
  });

  it('reports denied when Notification.permission is already denied', async () => {
    stubSupportedBrowser({ permission: 'denied' });
    stubUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    expect(await detectPushCapability()).toBe('denied');
  });

  it('reports off when supported but not yet subscribed', async () => {
    stubSupportedBrowser({ subscription: null });
    stubUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    expect(await detectPushCapability()).toBe('off');
  });

  it('reports on when a live subscription already exists', async () => {
    stubSupportedBrowser({ subscription: { endpoint: 'https://push.example/ep1' } });
    stubUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    expect(await detectPushCapability()).toBe('on');
  });
});

describe('isIOSDevice / isStandaloneDisplay', () => {
  it('isIOSDevice is true for iPad/iPhone/iPod user agents, false otherwise', () => {
    stubUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)');
    expect(isIOSDevice()).toBe(true);
    stubUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    expect(isIOSDevice()).toBe(false);
  });

  it('isStandaloneDisplay reflects navigator.standalone or the display-mode media query', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    expect(isStandaloneDisplay()).toBe(false);
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    expect(isStandaloneDisplay()).toBe(true);
  });
});

describe('subscribeToPush', () => {
  beforeEach(() => { upsertMock.mockReset(); });
  afterEach(() => { delete globalThis.Notification; delete window.PushManager; delete import.meta.env.VITE_VAPID_PUBLIC_KEY; });

  it('returns ok:false reason:denied when the user rejects the OS permission prompt', async () => {
    globalThis.Notification = { requestPermission: vi.fn().mockResolvedValue('denied') };
    const res = await subscribeToPush();
    expect(res).toEqual({ ok: false, reason: 'denied' });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns ok:false reason:unconfigured when no VAPID public key is set', async () => {
    globalThis.Notification = { requestPermission: vi.fn().mockResolvedValue('granted') };
    delete import.meta.env.VITE_VAPID_PUBLIC_KEY;
    const res = await subscribeToPush();
    expect(res).toEqual({ ok: false, reason: 'unconfigured' });
  });

  it('subscribes and saves the device on success', async () => {
    import.meta.env.VITE_VAPID_PUBLIC_KEY = 'AAEC';
    stubSupportedBrowser();
    upsertMock.mockResolvedValue({ saved: true });
    const res = await subscribeToPush();
    expect(res).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://push.example/ep1', p256dh: 'p', authKey: 'a' }));
  });

  it('returns ok:false reason:error when the save to Supabase fails', async () => {
    import.meta.env.VITE_VAPID_PUBLIC_KEY = 'AAEC';
    stubSupportedBrowser();
    upsertMock.mockResolvedValue({ saved: false, error: 'boom' });
    const res = await subscribeToPush();
    expect(res).toEqual({ ok: false, reason: 'error', error: 'boom' });
  });
});

describe('unsubscribeFromPush', () => {
  beforeEach(() => { deleteMock.mockReset(); });
  afterEach(() => { delete window.PushManager; });

  it('deletes the subscription server-side and unsubscribes the device when one exists', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ pushManager: { getSubscription: vi.fn().mockResolvedValue({ endpoint: 'ep1', unsubscribe }) } }) },
      configurable: true,
    });
    deleteMock.mockResolvedValue({ deleted: true });
    const res = await unsubscribeFromPush();
    expect(res).toEqual({ ok: true });
    expect(deleteMock).toHaveBeenCalledWith('ep1');
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('is a no-op success when there is no live subscription to remove', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null) } }) },
      configurable: true,
    });
    const res = await unsubscribeFromPush();
    expect(res).toEqual({ ok: true });
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
