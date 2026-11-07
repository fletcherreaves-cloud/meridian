-- ── Notification consent (task #91 follow-on, 2026-11-07) ───────────────────────────────────────
-- Owner request: when a real GM/AS/DO account gets set up for Movers Alerts (see
-- memory/plan-movers-alerts-2026-11-07.md's pause note), the new user's FIRST sign-in should
-- explicitly consent to device push alerts, or have a clean chance to opt out — not just get
-- cold-prompted by the browser's own permission dialog with no explanation. src/components/
-- AuthGate.js's new NotificationConsentScreen shows that explanation + choice right after a
-- brand-new user sets their password (the post-OTP-invite flow, which is how every new account
-- gets onboarded today — see AuthGate.js's own header comment, "Access controlled by your
-- administrator"). This records that one choice durably so it is never asked again.
--
-- ⚠️ HANDOFF — run this manually in the Supabase SQL editor before the consent screen's choice
-- can be persisted (same pattern as every other new-column/new-function dispatch in this repo).
-- Idempotent — safe to run anytime, including a second time.

alter table public.profiles add column if not exists notification_consent text
  check (notification_consent in ('granted', 'declined'));
alter table public.profiles add column if not exists notification_consent_at timestamptz;

comment on column public.profiles.notification_consent is
  'NULL = never asked (every profile before 2026-11-07, plus anyone who never reached the first-sign-in consent screen -- e.g. an admin-set password instead of the OTP-invite path). ''granted''/''declined'' = the user''s own explicit choice on NotificationConsentScreen, independent of whether the browser itself ended up allowing push (a ''granted'' choice on an unsupported browser is still a real answer to "do you want this").';

-- A dedicated RPC rather than widening profiles' RLS with a general "own row update" policy --
-- profiles currently allows only SELECT on your own row ("profiles: own read") plus full access
-- for admin ("profiles: admin all"); a self-UPDATE policy would also let a non-admin rewrite
-- their own role/accessible_locs. This function is scoped server-side to exactly the two
-- consent columns, for exactly the caller's own row.
create or replace function public.set_notification_consent(choice text)
returns void as $$
begin
  if choice not in ('granted', 'declined') then
    raise exception 'invalid notification_consent value: %', choice;
  end if;
  update public.profiles
    set notification_consent = choice, notification_consent_at = now()
    where id = auth.uid();
end;
$$ language plpgsql security definer;

grant execute on function public.set_notification_consent(text) to authenticated;
