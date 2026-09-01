-- ═══════════════════════════════════════════════════════════════════════════════
-- EMAIL DIGEST SUBSCRIPTIONS (owner req, 2026-09-01)
--
-- Owner, verbatim: "can we build out a section... to configure email reports? If we are being
-- smart we will go ahead make this available based on users and allow anyone to sign up or opt
-- in to whichever reports they want emailed to them."
--
-- ⚠️ NOT the same table as public.report_subscriptions (schema-report-subscriptions.sql, Notes
-- 49) -- that table is "My Reports": a per-user list of SAVED, scope/period-configurable report
-- LAUNCHES (Above-Store One-Pager / Events Calendar / Visit Readiness), opened in-app on click.
-- Its own footnote already says "Auto-delivery (scheduled email...) is coming" -- that's a
-- separate, larger effort (server-side rendering of an arbitrarily-scoped, multi-panel report),
-- not started here. THIS table is narrower and immediately real: opt-in delivery for the
-- SCHEDULED DIGESTS the system already builds and sends server-side on a fixed cadence (EOM
-- Digest, Weekly Cycle Digest) -- replacing their hardcoded single-owner EMAIL_TO recipient
-- (dispatch #215's own comment on recipientFor(), scripts/lib/eom-digest-notify.mjs, called this
-- out explicitly as a placeholder awaiting "a real per-user contact registry").
--
-- One row per (user_id, digest_key) a user has opted into -- no row means NOT subscribed
-- (opt-in, not opt-out, per the owner's own framing). The fixed list of digest_key values lives
-- in src/engine/email-digest-catalog.js (EMAIL_DIGEST_CATALOG) -- adding a new scheduled digest
-- there automatically makes it selectable here, no schema change needed.
--
-- Same shape/RLS pattern as push_subscriptions (schema-push-subscriptions.sql): plain
-- user_id = auth.uid() gate, no role/tenant scoping -- every authenticated user can subscribe to
-- every digest, matching the owner's own "allow anyone... opt in" framing.
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.email_digest_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  digest_key  text not null,             -- EMAIL_DIGEST_CATALOG key, e.g. 'eom_digest', 'weekly_cycle_digest'
  created_at  timestamptz default now(),
  unique (user_id, digest_key)
);

alter table public.email_digest_subscriptions enable row level security;

drop policy if exists email_digest_subscriptions_own on public.email_digest_subscriptions;
create policy email_digest_subscriptions_own on public.email_digest_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists email_digest_subscriptions_digest_key_idx on public.email_digest_subscriptions (digest_key);

comment on table public.email_digest_subscriptions is
  'Self-serve per-user opt-in to the scheduled email digests the system already sends (EOM Digest, Weekly Cycle Digest -- owner req 2026-09-01). Read by the send-side scripts (service role, bypasses RLS) via scripts/lib/email-digest-subscriptions.mjs''s loadDigestSubscriberEmails(); written by the EmailDigestSubscriptionsPanel UI via src/lib/supabase.js''s setEmailDigestSubscription(). Distinct from public.report_subscriptions ("My Reports" -- saved, launchable, scope/period-configurable views), which this does not touch.';
