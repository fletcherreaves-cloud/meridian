#!/usr/bin/env node
// scripts/test-webpush-send.mjs — dispatch #216 live smoke test.
//
// A mocked-web-push unit test (src/__tests__/webpush-notify.test.js) proves sendWebPush() builds
// a correct request and handles 404/410 cleanup correctly. It CANNOT prove VITE_VAPID_PUBLIC_KEY/
// VAPID_PRIVATE_KEY are a valid live keypair, or that a real subscribed device actually receives
// and displays the notification — those are real unknowns only a live send answers. Mirrors
// scripts/test-eom-notification-send.mjs's (#211) own pattern exactly.
//
// This script CANNOT be run by the agent that wrote it — creating a real push subscription
// requires an actual browser (Chrome/Firefox/Edge/Android Chrome, or iOS Safari with the app
// added to the Home Screen) hitting the live subscribe flow (src/app/shell.js's "🔔 Enable
// device alerts" toggle), which in turn needs VITE_VAPID_PUBLIC_KEY set in the deployed app's
// build AND VAPID_PRIVATE_KEY set as a GitHub Actions secret — neither exists until the owner
// adds them post-merge (see this dispatch's PR body for the exact values to add). No sandboxed
// dev environment can create a real browser push subscription.
//
// Run manually, once a real subscription row exists in push_subscriptions AND both VAPID secrets
// are set in the environment:
//   VITE_VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VITE_SUPABASE_URL=... \
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/test-webpush-send.mjs [subscription-id]
// With no [subscription-id], sends to every row currently in push_subscriptions (so subscribe at
// least one real device first via the app's toggle before running this untargeted).
//
// Sends ONE real test push per matched subscription, with obviously-fake content so nothing
// reads as a real EOM count event.

import { createClient } from '@supabase/supabase-js';
import { sendWebPush } from './lib/webpush-notify.mjs';

export const TEST_PAYLOAD = {
  title: 'Meridian — test push (dispatch #216 verification, ignore)',
  body: 'This is a test device alert. If you see this on your lock screen/banner, Web Push is working end-to-end.',
  url: 'https://meridianbi.vercel.app/?panel=eom-dashboard',
};

export async function main() {
  if (!process.env.VITE_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error('[test-webpush-send] VITE_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set in this environment — cannot send a live test.');
    process.exit(1);
    return; // belt-and-suspenders for a mocked process.exit in a future test — real Node stops above.
  }
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[test-webpush-send] VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — cannot read push_subscriptions.');
    process.exit(1);
    return;
  }
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const wantId = process.argv[2];
  let query = supabase.from('push_subscriptions').select('id,endpoint,p256dh,auth_key');
  if (wantId) query = query.eq('id', wantId);
  const { data, error } = await query;
  if (error) { console.error('[test-webpush-send] push_subscriptions read error:', error.message); process.exit(1); return; }
  if (!data || !data.length) {
    console.error('[test-webpush-send] No push_subscriptions rows found' + (wantId ? ` for id ${wantId}` : '') + '. Subscribe at least one device first (the bell\'s "🔔 Enable device alerts" toggle in the app), then re-run.');
    process.exit(1);
    return;
  }
  console.log(`[test-webpush-send] Sending ${data.length} test push(es) via web-push (dispatch #216 verification)...`);
  let allOk = true;
  for (const sub of data) {
    const ok = await sendWebPush({ id: sub.id, endpoint: sub.endpoint, p256dh: sub.p256dh, authKey: sub.auth_key }, TEST_PAYLOAD);
    console.log(`[test-webpush-send] ${sub.id}: ${ok ? 'OK (push service accepted it)' : 'FAILED — see warning above'}`);
    allOk = allOk && ok;
  }
  console.log('[test-webpush-send] "OK" only means the push service accepted the request — check the actual device to confirm it displayed.');
  if (!allOk) process.exit(1);
}

// CLI-run guard (matches scripts/test-eom-notification-send.mjs and others' precedent) — lets a
// future test import main()/TEST_PAYLOAD with mocked dependencies without this module
// auto-firing a real send on import.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
