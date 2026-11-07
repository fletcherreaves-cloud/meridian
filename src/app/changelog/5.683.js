// @ts-nocheck
export default {version:'5.683', date:'2026-11-07', changes:[
  '**New: notification-consent screen on a brand-new user’s first sign-in (task #91 ' +
  'follow-on).** Owner request: when the first real GM/AS/DO account gets set up for Movers ' +
  'Alerts, that person’s first login should explicitly consent to device push alerts — ' +
  'or have a clean chance to opt out — instead of the browser’s own cold permission ' +
  'prompt with no explanation. Shown exactly once, right after a brand-new account sets its ' +
  'first password (the OTP-invite flow, which is how every account is onboarded today — ' +
  '`AuthGate.js`’s own header: "Access controlled by your administrator"); never re-shown ' +
  'once a choice is recorded, and never shown on an ordinary login. "Enable Alerts" runs the ' +
  'same subscribe flow the 🔔 bell’s "Enable device alerts" toggle already uses; "Not now" ' +
  'skips cleanly, and the bell toggle stays the way to turn it on/off later either way. The ' +
  'choice persists to a new `profiles.notification_consent`/`notification_consent_at` pair ' +
  'via a `set_notification_consent()` RPC (own-row only, not a blanket self-update grant on ' +
  '`profiles`) — **owner action required: run `supabase/schema-notification-consent.sql`** ' +
  'before a real choice can be saved (DDL, never an agent’s own action). Device-capability ' +
  'detection + subscribe/unsubscribe were pulled out of `shell.js`’s `DeviceAlertsToggle` ' +
  'into a shared `src/lib/push-subscribe.js` so both screens use one implementation.',
]};
