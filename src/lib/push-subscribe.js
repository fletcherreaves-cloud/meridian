// @ts-nocheck
// Web Push subscribe/unsubscribe — shared by src/app/shell.js's "🔔 Enable device alerts" bell
// toggle AND src/components/AuthGate.js's new-user notification-consent screen (task #91
// follow-on, 2026-11-07). Previously this lived only inside shell.js's DeviceAlertsToggle;
// pulled out so the onboarding screen doesn't need to import all of shell.js (a large,
// always-eager module) just to reuse three small browser-capability helpers.
import { upsertPushSubscription, deletePushSubscription } from './supabase.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIOSDevice() {
  return typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isStandaloneDisplay() {
  return (typeof navigator !== 'undefined' && navigator.standalone === true)
    || (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}

// 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on'
async function detectPushCapability() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  if (isIOSDevice() && !isStandaloneDisplay()) return 'ios-install';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

// Requests OS permission, subscribes this device, and saves the subscription to Supabase.
// Returns { ok: true } on success, { ok: false, reason, error? } otherwise. `reason` is one of
// 'denied' | 'unconfigured' | 'error' so callers can show the right message without re-deriving it.
async function subscribeToPush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'denied' };
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) return { ok: false, reason: 'unconfigured' };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    const json = sub.toJSON();
    const { saved, error } = await upsertPushSubscription({
      endpoint: json.endpoint, p256dh: json.keys.p256dh, authKey: json.keys.auth, userAgent: navigator.userAgent,
    });
    if (!saved) return { ok: false, reason: 'error', error: error || 'Could not save this device.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'error', error: e?.message || 'Could not enable device alerts.' };
  }
}

async function unsubscribeFromPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await deletePushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || 'Could not disable device alerts.' };
  }
}

export { urlBase64ToUint8Array, isIOSDevice, isStandaloneDisplay, detectPushCapability, subscribeToPush, unsubscribeFromPush };
