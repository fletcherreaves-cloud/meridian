-- ── Web Push subscriptions — dispatch #216 ──────────────────────────────────────────────────────
-- Owner-requested (2026-08-29): "can the in app notifications fire an alert on devices?" This
-- table is the subscribe-side half — one row per device/browser a user has enabled real OS-level
-- push alerts from (a user can have several: phone + desktop, so this is NOT one row per user).
-- Written by the authenticated client (src/app/shell.js's NotificationBell "🔔 Enable device
-- alerts" toggle, via src/lib/supabase.js) on subscribe, deleted on unsubscribe. Read by
-- scripts/lib/webpush-notify.mjs (service role) at send time, and deleted there too when a push
-- comes back 404/410 (dead subscription — standard Web Push hygiene).
--
-- ⚠️ HANDOFF — this file needs to be run manually in the Supabase SQL editor before real
-- subscriptions can be written, same pattern as every other new-table dispatch in this repo (e.g.
-- schema-eom-count-notifications.sql, dispatch #209). Idempotent (`create table if not exists` /
-- `drop policy if exists` + recreate) — safe to run anytime, including a second time.

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) not null,
  endpoint    text not null,
  p256dh      text not null,
  auth_key    text not null,
  user_agent  text,
  created_at  timestamptz default now(),
  tenant_id   uuid
);
-- Re-subscribing the same device (same endpoint) upserts in place rather than duplicating —
-- browsers hand back the SAME endpoint for a still-live subscription on the same device/browser
-- profile, so (user_id, endpoint) is the natural dedupe key.
create unique index if not exists push_subscriptions_user_endpoint_idx
  on public.push_subscriptions (user_id, endpoint);

alter table public.push_subscriptions enable row level security;

-- Scoped by user_id, NOT tenant_id alone — unlike every other stream table in this repo, a push
-- subscription is inherently per-PERSON (a specific device someone personally enabled alerts on),
-- not shared reference data the rest of a tenant should ever see or manage. A user reads/writes
-- only their own subscriptions. service_role (scripts/lib/webpush-notify.mjs, the send-side, which
-- needs to read every tenant's subscriptions to actually deliver pushes) bypasses RLS entirely at
-- the Postgres role level regardless of policy content, same as every other automated-stream table
-- in this repo (schema-eom-count-notifications.sql's own comment states this identically) — so the
-- policies below stay plain user_id = auth.uid() checks, no explicit service_role carve-out needed.
drop trigger if exists set_tenant_id_trg on public.push_subscriptions;
create trigger set_tenant_id_trg before insert on public.push_subscriptions
  for each row execute function public.set_tenant_id();

drop policy if exists "push_subscriptions: own select" on public.push_subscriptions;
drop policy if exists "push_subscriptions: own insert" on public.push_subscriptions;
drop policy if exists "push_subscriptions: own update" on public.push_subscriptions;
drop policy if exists "push_subscriptions: own delete" on public.push_subscriptions;
create policy "push_subscriptions: own select" on public.push_subscriptions
  for select using (user_id = auth.uid());
create policy "push_subscriptions: own insert" on public.push_subscriptions
  for insert with check (user_id = auth.uid());
create policy "push_subscriptions: own update" on public.push_subscriptions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push_subscriptions: own delete" on public.push_subscriptions
  for delete using (user_id = auth.uid());
