-- ── General in-app notification framework ───────────────────────────────────────────────────────
-- Owner request (2026-09-05, scoped 2026-10-12): "I would like to see some customization options
-- and the ability to delete notifications or have them fall off if no longer relevant." Scoping
-- answers (2026-10-12): a GENERAL framework other features can plug into, not another EOM-count-
-- specific table; "falls off when resolved" (auto-clear) wanted, via a `resolve_key` a producer
-- re-checks on its own schedule; push/email delivery wanted too, "where appropriate and valuable"
-- -- per-row opt-in flags below, reusing the EXISTING send primitives (scripts/lib/webpush-
-- notify.mjs's sendWebPush, scripts/lib/resend-notify.mjs's postResend) rather than a second
-- integration -- see scripts/lib/app-notification-delivery.mjs. EOM count notifications keep
-- their own table/rendering/delivery exactly as they are (scripts/qsrsoft-onhand-pull.mjs) --
-- this is additive, not a migration of that already-working system.
--
-- ⚠️ HANDOFF — run this manually in the Supabase SQL editor before the new notification code can
-- write/read real rows (same pattern as every other new-table dispatch in this repo). Both blocks
-- are idempotent -- safe to run anytime, including a second time.

-- ── 1. app_notifications — the general table ────────────────────────────────────────────────────
-- Deliberately generic: `type` is any producer's own short string (e.g. 'eom_count' if a future
-- pass migrates that producer here, or a brand-new type like 'sync_failure'/'signal_anomaly').
-- `loc`/`period` are nullable context fields, not every notification type is store-scoped (e.g. a
-- district-wide sync-failure alert has no single loc). `resolve_key` is null for a one-shot event
-- notification (nothing to "resolve") and non-null for an ongoing-condition notification a
-- producer can re-check later and auto-clear via autoClearAppNotifications() once the condition
-- is no longer true -- see src/engine/app-notifications.js for the pure shape/validation this
-- table's rows are built from.
create table if not exists public.app_notifications (
  id           uuid        default gen_random_uuid() primary key,
  type         text        not null,
  loc          text,
  period       text,
  severity     text        not null default 'info',  -- 'crit' | 'warn' | 'info'
  title        text        not null,
  detail       text,
  link         text,                                  -- onOpenModal(...) deep-link target, same convention eom_count_notifications' own bell click already uses
  resolve_key  text,                                   -- non-null = an ongoing condition a producer can auto-clear later; null = one-shot event, manual dismiss only
  payload      jsonb,                                  -- type-specific structured extras a future UI enhancement could render from, without a schema change
  -- Delivery flags (2026-10-12) — "where appropriate and valuable," not every notification gets
  -- pushed to a phone or emailed; buildAppNotification() defaults these from `severity` (crit:
  -- both, warn: push only, info: neither) but a producer can always override explicitly. Reused
  -- against the SAME push_subscriptions table / Resend integration EOM count notifications'
  -- own delivery already uses — no second provider, no duplicated secret handling.
  notify_push  boolean     not null default false,
  notify_email boolean     not null default false,
  created_at   timestamptz default now(),
  read_at      timestamptz,                            -- null = unread
  dismissed_at timestamptz,                             -- manual "delete" -- excluded from every load/count once set
  cleared_at   timestamptz,                             -- auto "fell off because it's no longer relevant" -- excluded from every load/count once set, distinct provenance from dismissed_at for later debugging/metrics
  tenant_id    uuid
);
create index if not exists app_notifications_created_idx on public.app_notifications (created_at desc);
create index if not exists app_notifications_unread_idx  on public.app_notifications (tenant_id, read_at, dismissed_at, cleared_at);
create index if not exists app_notifications_resolve_idx on public.app_notifications (type, resolve_key) where resolve_key is not null;

alter table public.app_notifications enable row level security;

-- Tenant-scoped RLS -- same pattern as supabase/schema-eom-count-notifications.sql.
drop trigger if exists set_tenant_id_trg on public.app_notifications;
create trigger set_tenant_id_trg before insert on public.app_notifications
  for each row execute function public.set_tenant_id();

drop policy if exists "app_notifications: tenant select" on public.app_notifications;
drop policy if exists "app_notifications: tenant insert" on public.app_notifications;
drop policy if exists "app_notifications: tenant update" on public.app_notifications;
drop policy if exists "app_notifications: tenant delete" on public.app_notifications;
create policy "app_notifications: tenant select" on public.app_notifications
  for select using (tenant_id = public.current_tenant_id());
create policy "app_notifications: tenant insert" on public.app_notifications
  for insert with check (tenant_id = public.current_tenant_id());
create policy "app_notifications: tenant update" on public.app_notifications
  for update using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy "app_notifications: tenant delete" on public.app_notifications
  for delete using (tenant_id = public.current_tenant_id());

-- service_role (a future automated producer, e.g. a pull script or GitHub Action) bypasses RLS
-- entirely for reads/writes, same as every other automated stream -- but the trigger still fires
-- for service-role inserts, so set_tenant_id_trg still stamps tenant_id on every row it writes.

-- ── 2. eom_count_notifications gets the same soft-delete column ────────────────────────────────
-- The owner's "ability to delete notifications" ask covers notifications that already exist, not
-- just new ones -- this lets the bell's delete button work uniformly on BOTH the existing EOM rows
-- (which keep their own rich table/rendering, untouched otherwise) and the new generic rows.
alter table public.eom_count_notifications add column if not exists dismissed_at timestamptz;
