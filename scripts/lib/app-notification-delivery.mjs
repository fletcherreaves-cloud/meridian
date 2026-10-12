// scripts/lib/app-notification-delivery.mjs — push/email delivery for the general app_notifications
// framework (2026-10-12, owner: "where appropriate and valuable" push/email, not everything).
//
// Deliberately reuses the EXISTING send primitives rather than a second integration:
//   - sendWebPush() (webpush-notify.mjs) is already payload-shape-agnostic ({title,body,url}) --
//     EOM count notifications' own sendPushNotifications() in qsrsoft-onhand-pull.mjs calls the
//     identical function.
//   - postResend() (resend-notify.mjs) is already exported generic ({to,subject,html,text}) --
//     EOM's own sendEmailNotification()/sendSmsViaCarrierGateway() and the EOM Digest roll-up
//     (eom-digest-notify.mjs) all call this same function today, per that file's own comment.
// Only the PAYLOAD building here is new; no new secret, no new provider, no new HTTP client.
//
// Any future server-side producer (a pull script, an Edge Function) that inserts into
// app_notifications with notify_push/notify_email set calls deliverAppNotification(row) itself,
// right after a successful insert -- mirroring EOM's own buildNotificationRow() -> insert ->
// notifyRow() shape exactly. This file is intentionally NOT imported from src/lib/supabase.js:
// that file is bundled for the browser too, and this one reads server-only secrets
// (RESEND_API_KEY / VAPID_PRIVATE_KEY via the two libs above) that must never ship client-side.
//
// EMAIL_TO is reused from resend-notify.mjs (the same single recipient every other Meridian
// email notification already goes to) rather than a second address to maintain.
import { sendWebPush } from './webpush-notify.mjs';
import { postResend, EMAIL_TO } from './resend-notify.mjs';

const APP_URL = process.env.MERIDIAN_APP_URL || 'https://meridianbi.vercel.app';

// A `link` is an onOpenModal(...) target (e.g. 'data-manager', or the colon-arg
// 'eom-dashboard:<loc>' shape). Scoped deliberately: this handles a PLAIN panel id generically
// (?panel=<id>, the same convention App.js's own URL-param reader already honors) and the one
// known colon-arg case EOM's own push already special-cases (store-scoped). A future colon-arg
// type would need its own param name added here to round-trip through a URL -- not attempted
// speculatively for a shape that doesn't exist yet.
export function appNotificationUrl(link) {
  if (!link) return APP_URL;
  if (link.startsWith('eom-dashboard:')) {
    return `${APP_URL}/?panel=eom-dashboard&store=${encodeURIComponent(link.slice('eom-dashboard:'.length))}`;
  }
  return `${APP_URL}/?panel=${encodeURIComponent(link)}`;
}

/** Pure -- the exact {title,body,url} shape sendWebPush()'s payload argument expects. */
export function buildPushPayload(row) {
  return { title: row.title, body: row.detail || '', url: appNotificationUrl(row.link) };
}

const SEVERITY_BADGE = { crit: '🔴 Critical', warn: '🟡 Warning', info: 'ℹ️ Info' };

/** Pure -- {subject, html} for postResend(). Deliberately plain (title/detail/one link), not
 *  EOM's own richly-templated email -- a generic notification has no class-status/FOB payload to
 *  render; a future type-aware enhancement can special-case a recognized `row.type` here without
 *  changing this function's contract for every other type. */
export function buildEmailContent(row) {
  const subject = `Meridian: ${row.title}`;
  const badge = SEVERITY_BADGE[row.severity] || SEVERITY_BADGE.info;
  const url = appNotificationUrl(row.link);
  const html = `<p style="margin:0 0 8px;font-size:13px;color:#666">${badge}</p>
<h2 style="margin:0 0 8px;font-size:16px">${row.title}</h2>
${row.detail ? `<p style="margin:0 0 12px;font-size:13px">${row.detail}</p>` : ''}
<p style="margin:12px 0 0"><a href="${url}">Open in Meridian</a></p>`;
  return { subject, html };
}

/**
 * Deliver one just-inserted app_notifications row over whichever channels it opted into.
 * Never throws -- matches resend-notify.mjs/webpush-notify.mjs's own "warn and continue" shape,
 * since a failed delivery is a non-critical side effect, not a reason to fail the caller's run.
 */
export async function deliverAppNotification(row, { supabase } = {}) {
  if (!row) return;
  if (row.notify_push) {
    if (!supabase) {
      console.warn('[app-notification-delivery] notify_push set but no supabase client passed — skipping push');
    } else {
      const { data, error } = await supabase.from('push_subscriptions').select('id,endpoint,p256dh,auth_key');
      if (error) console.warn('[app-notification-delivery] push_subscriptions read error:', error.message);
      else {
        const payload = buildPushPayload(row);
        for (const sub of (data || [])) {
          await sendWebPush({ id: sub.id, endpoint: sub.endpoint, p256dh: sub.p256dh, authKey: sub.auth_key }, payload);
        }
      }
    }
  }
  if (row.notify_email) {
    const { subject, html } = buildEmailContent(row);
    await postResend({ to: EMAIL_TO, subject, html });
  }
}
