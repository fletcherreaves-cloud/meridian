// scripts/lib/webpush-notify.mjs — Web Push delivery (dispatch #216)
//
// Wires real OS-level device alerts alongside the existing email/SMS channels
// (scripts/lib/resend-notify.mjs, dispatch #211). Thin wrapper around the `web-push` npm
// package's sendNotification(), matching resend-notify.mjs's own non-throwing error-handling
// convention (console.warn + continue, never crash the whole pull run over one subscriber's
// failed push — same "log and move on" shape as postResend()).
//
// VAPID keys sign every push so the browser's push service can verify it came from this app
// (no per-push credential, just a keypair — see memory/dispatch-216.md Task 1). Configured once
// per process (module-scope, mirroring resend-notify.mjs's own module-scope RESEND_URL/FROM
// consts) rather than re-set on every send. Requires the caller's environment to carry
// VITE_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (GitHub Actions secrets, added post-merge — see the
// dispatch #216 PR body for the actual generated values) and, for the dead-subscription cleanup
// below, VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (already present in every workflow that
// calls this).
//
// Standard Web Push hygiene: a 404/410 response means the subscription is dead (the user
// revoked notification permission, uninstalled the PWA, or the browser expired it) — that
// specific case deletes the push_subscriptions row right here (not left to the caller), so an
// unreachable device never silently accumulates failed sends forever. Any OTHER failure (network
// blip, a malformed subscription, web-push library error) is logged and swallowed — sendWebPush
// never throws, so one bad subscription can't stop the loop calling it for the rest.

import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

export const VAPID_SUBJECT = 'mailto:fletcher.reaves@mcreaves.com';

// Guarded the same way qsrsoft-onhand-pull.mjs's own module-scope `supabase` const is (see that
// file's comment) — an unconditional createClient() call would throw at import time in any
// environment missing these two env vars, and this module is imported directly by unit tests.
const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

let configured = false;
export function configureWebPush() {
  const publicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
  configured = true;
  return true;
}

// subscription: { id, endpoint, p256dh, authKey } — a push_subscriptions row (camelCased at the
// call site, matching this repo's own DB-column -> JS-field convention elsewhere in this file's
// sibling loaders). `id` is needed only for the expired-subscription delete below; sendWebPush
// still sends fine without it, it just can't clean up a dead row afterward.
// payload: { title, body, url } — JSON.stringify'd; public/sw.js's push handler parses it back.
// Returns true on a successful send, false on any failure (including "skipped, not configured")
// — never throws, matching sendEmailNotification/sendSmsViaCarrierGateway's own boolean contract.
export async function sendWebPush(subscription, payload) {
  if (!configured && !configureWebPush()) {
    console.warn('[webpush-notify] VITE_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set — skipping push send');
    return false;
  }
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.authKey } },
      JSON.stringify(payload)
    );
    return true;
  } catch (e) {
    const status = e && e.statusCode;
    if (status === 404 || status === 410) {
      console.warn(`[webpush-notify] subscription expired (${status}) — deleting push_subscriptions row${subscription.id ? ' ' + subscription.id : ''}`);
      if (supabase && subscription.id) {
        const { error } = await supabase.from('push_subscriptions').delete().eq('id', subscription.id);
        if (error) console.warn('[webpush-notify] failed to delete expired subscription row:', error.message);
      }
      return false;
    }
    console.warn(`[webpush-notify] push send failed: ${(e && e.message) || e}`);
    return false;
  }
}
