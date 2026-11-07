# Notification consent on new-user sign-in (task #91 follow-on)

**Owner request (2026-11-07, same day as the Movers Alerts pause):** "We should probably
include one new user sign in as they consent to receiving Notifications or have a chance to
opt out you can look into how we need to word that and set all that up as far as we're on
boarding process too."

## Context this builds on

Movers Alerts (v5.681, task #91) is live-verified but paused (`memory/plan-movers-alerts-
2026-11-07.md`) until a real GM/AS/DO account exists with its own device push subscription.
This follow-on is the onboarding piece that makes that real account's first sign-in do the
right thing: explain what device alerts are before asking the browser's own permission
question, and record an explicit yes/no rather than silently defaulting either way.

## How new accounts are onboarded today (measured, not assumed)

There is no self-service signup. `src/components/AuthGate.js`'s own login-card footer says so
directly: *"Access controlled by your administrator. Contact your supervisor if you need
access."* An admin creates the `auth.users` row (via Supabase); `handle_new_user()`
(`supabase/schema.sql`) auto-creates the matching `profiles` row. The new person's actual
first entry into the app is the **forgot-password / OTP flow**, reused as an invite flow:
`ForgotEmailScreen` -> `ForgotOTPScreen` (6-digit code, not a magic link) -> `SetPasswordScreen`
(sets a real password for the first time) -> app. That `SetPasswordScreen` completion is the
one moment in the whole app that is unambiguously "this is a brand-new user's first sign-in" —
every other path (plain `LoginScreen` submit) is an existing account signing in again.

## Design

- **New interstitial state in `AuthGate`**: `pendingConsent`, set true in `SetPasswordScreen`'s
  `onDone` (alongside clearing `pendingPwSet`), shown as `NotificationConsentScreen` before
  `children` (the app) renders. Reset on sign-out alongside `pendingPwSet`. Never triggered by
  an ordinary login — deliberately narrow scope, matching exactly what was asked ("one new user
  sign in"), not a profile-wide re-ask on every device/login.
- **Copy** (plain language, no legal boilerplate — matches CLAUDE.md's "say the number and the
  decision" voice standard): explains Meridian can send device push alerts for things like a
  sales swing, a schedule change, or an inventory count reminder, scoped to the user's role;
  says it's optional; says it can be changed anytime from the 🔔 bell. Two explicit choices:
  "Enable Alerts" / "Not now" — no dark-pattern default, no pre-checked anything.
- **Device-capability-aware**: if the browser can't do push at all (desktop-class browser
  missing the APIs), or is an iPhone/iPad not yet added to the Home Screen, or notifications are
  already blocked at the OS/browser level, the screen shows the same explanatory sub-messages
  `DeviceAlertsToggle` already uses and offers only "Continue" (no real choice exists yet on
  that device/browser — recorded as `declined` since that's what actually happened; the person
  can still try again later from a capable browser via the bell toggle).
- **Persisted choice, not just a browser permission.** Browser `Notification.permission` is
  per-device and says nothing about intent; a user who explicitly said yes on a browser that
  turned out unsupported still "consented." New `profiles.notification_consent` ('granted' |
  'declined') + `notification_consent_at`, written via a new `set_notification_consent(choice)`
  RPC — **not** a direct `.update()` on `profiles`, because that table's RLS only grants a user
  SELECT on their own row (`profiles: own read`); widening that to a general own-row UPDATE
  policy would also let a non-admin rewrite their own `role`/`accessible_locs`. The RPC is
  `security definer`, validates the value, and touches only those two columns for `auth.uid()`'s
  own row. See `supabase/schema-notification-consent.sql`.
- **Shared subscribe/capability logic.** `src/app/shell.js`'s existing `DeviceAlertsToggle` (the
  🔔 bell's "Enable device alerts" toggle, shipped dispatch #216) already had this exact logic
  (`urlBase64ToUint8Array`, `isIOSDevice`, `isStandaloneDisplay`, the permission-request +
  `pushManager.subscribe` + `upsertPushSubscription` sequence). Pulled it into a new
  `src/lib/push-subscribe.js` (`detectPushCapability`, `subscribeToPush`, `unsubscribeFromPush`)
  so the consent screen doesn't duplicate it and `DeviceAlertsToggle` was refactored to call the
  same shared functions — one implementation, two UIs.

## Handoff — DDL required before this can record a real choice

`supabase/schema-notification-consent.sql` adds `profiles.notification_consent` /
`notification_consent_at` and the `set_notification_consent()` RPC. **Not run by this session**
(DDL is strictly the owner's own action per CLAUDE.md). Until it runs, `setNotificationConsent()`
calls fail silently (best-effort, wrapped in try/catch in `NotificationConsentScreen` — never
blocks entry to the app) and the screen will simply show again on the next brand-new account's
first sign-in. No existing behavior changes until the SQL is run.

## What this does NOT do

- Does not retroactively ask existing users (including the owner's own account) — the column
  stays `NULL` for every profile that never goes through the first-sign-in password-set path.
  That is deliberate, not a gap: the request was specifically about a *new* user's sign-in.
- Does not change what Movers Alerts (or any other `app_notifications` producer) sends — this is
  purely about how a NEW recipient's device gets subscribed and how that's recorded, not about
  targeting/content. Movers Alerts stays paused per the separate note in
  `memory/plan-movers-alerts-2026-11-07.md` until a real target-role account exists; this is the
  onboarding step that account's first login will now go through.
