-- ── EOM count-completion notifications — dispatch #209 ─────────────────────────────────────────
-- Owner-requested (2026-08-29, live during an active 3-day EOM count cycle): "can we setup a
-- smart notification for when a store is perceived to complete with any class of count?"
--
-- Generalizes the existing `eom_count_status.notified_90` fire-once pattern (overall ~90%
-- "believes done", scripts/qsrsoft-onhand-pull.mjs) to PER-CLASS completion, per the owner's
-- exact wait/stale/not-started rules (memory/dispatch-209.md, transcribed there verbatim).
-- Detection logic: src/engine/eom-inventory.js's detectCountNotifications() (pure, unit-tested
-- in src/__tests__/eom-count-notifications.test.js). This file is schema only.
--
-- ⚠️ HANDOFF — this file needs to be run manually in the Supabase SQL editor before the new
-- notification code can write real rows (same pattern as every other new-table dispatch in this
-- repo, e.g. schema-qsr-menu-item-activity.sql / dispatch #193's own PR). Both statements below
-- are idempotent (`add column if not exists` / `create table if not exists`) — safe to run
-- anytime, including a second time.

-- ── 1. eom_count_status: per-class completion timestamps + the fire-once marker ────────────────
-- `*_done_at` — stamped the FIRST time each class's `done` flips true; never overwritten once
-- set (same fire-once spirit as `notified_90`/`notified_at` on this same table). Lets
-- detectCountNotifications() reason about "how long has the done one been sitting" for the
-- Food+Condiment stale-timeout rule without a separate history table.
alter table public.eom_count_status add column if not exists food_done_at       timestamptz;
alter table public.eom_count_status add column if not exists condiment_done_at  timestamptz;
alter table public.eom_count_status add column if not exists paper_done_at      timestamptz;
alter table public.eom_count_status add column if not exists nonproduct_done_at timestamptz;

-- `notified_classes` — the fire-once marker, as a jsonb array of trigger-kind strings already
-- fired for this store+period (e.g. `["paper"]`, or `["food_condiment","paper"]` once both have
-- fired). Chosen as a jsonb array rather than one boolean column per trigger-kind because:
--   (a) it's still queryable for the in-app read side — Postgres jsonb containment
--       (`notified_classes @> '["paper"]'`) or a simple `?` existence check both work fine for
--       the bell/badge UI's own reads, and for a human skimming the row in the SQL editor the
--       array is more legible than four near-identical boolean columns.
--   (b) trigger-kinds are open-ended in principle (dispatch #209 defines two today —
--       'food_condiment' and 'paper' — but the underlying pairing rule generalizes to a future
--       third class or a different pairing without a schema migration to add another boolean).
--   (c) it mirrors `class_statuses`/`uncounted_items`/`kb_links` below already being jsonb for
--       the same "structured, evolving payload" reason — one shape for the whole feature instead
--       of a mixed jsonb-for-detail/boolean-for-flags convention.
alter table public.eom_count_status add column if not exists notified_classes jsonb default '[]'::jsonb;

-- ── 2. eom_count_notifications — one row per fired notification event ──────────────────────────
-- Inserted by scripts/qsrsoft-onhand-pull.mjs immediately after detectCountNotifications()
-- returns a non-null result (before that run's eom_count_status upsert — see the pull script's
-- comment at the insert site). `read_at` null = unread, drives the bell badge's unread count.
create table if not exists public.eom_count_notifications (
  id               uuid        default gen_random_uuid() primary key,
  loc              text        not null,
  period           text        not null,
  trigger_kind     text        not null,   -- 'food_condiment' | 'paper' | 'food_condiment+paper' (both same run)
  class_statuses   jsonb,                  -- rule 2/3: EVERY relevant class's {status,pct,total,counted},
                                            -- always present even for classes that didn't trigger this event;
                                            -- also carries lateBulk/lateBulkDay (diagnoseIncompleteCount's
                                            -- already-computed bulk-count-landed-on-the-wrong-day signal —
                                            -- see the pull script's comment at the insert site for why it
                                            -- rides along here instead of a new column)
  uncounted_items  jsonb,                  -- { items: [...top 25 by valueAtRisk], totalCount, totalValue,
                                            --   truncated } — scoped to the trigger class(es); totalCount/
                                            -- totalValue so a truncation is never silent
  kb_links         jsonb,                  -- [{ title, url }] — QSRSoft KB grounding for the trigger class(es)
  created_at       timestamptz default now(),
  read_at          timestamptz,            -- null = unread
  tenant_id        uuid
);
create index if not exists eom_count_notifications_created_idx on public.eom_count_notifications (created_at desc);
create index if not exists eom_count_notifications_unread_idx  on public.eom_count_notifications (tenant_id, read_at);
create index if not exists eom_count_notifications_loc_period_idx on public.eom_count_notifications (loc, period);

alter table public.eom_count_notifications enable row level security;

-- Tenant-scoped RLS — replicates supabase/schema-qsr-menu-item-activity.sql's pattern exactly
-- (current_tenant_id()/set_tenant_id(), from schema-multitenant-phase1.sql /
-- schema-multitenant-phase2-rls.sql), per this repo's "new persistent data type → tenant_id +
-- RLS from day one" standing rule. `update` is included (unlike a pure write-once stream table)
-- because marking a notification read is a client-side update from an authenticated user, not
-- just the service-role pull script.
drop trigger if exists set_tenant_id_trg on public.eom_count_notifications;
create trigger set_tenant_id_trg before insert on public.eom_count_notifications
  for each row execute function public.set_tenant_id();

drop policy if exists "eom_count_notifications: tenant select" on public.eom_count_notifications;
drop policy if exists "eom_count_notifications: tenant insert" on public.eom_count_notifications;
drop policy if exists "eom_count_notifications: tenant update" on public.eom_count_notifications;
drop policy if exists "eom_count_notifications: tenant delete" on public.eom_count_notifications;
create policy "eom_count_notifications: tenant select" on public.eom_count_notifications
  for select using (tenant_id = public.current_tenant_id());
create policy "eom_count_notifications: tenant insert" on public.eom_count_notifications
  for insert with check (tenant_id = public.current_tenant_id());
create policy "eom_count_notifications: tenant update" on public.eom_count_notifications
  for update using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy "eom_count_notifications: tenant delete" on public.eom_count_notifications
  for delete using (tenant_id = public.current_tenant_id());

-- service_role (the pull script) bypasses RLS entirely for reads/writes, same as every other
-- automated stream — but triggers still fire for service-role inserts, so set_tenant_id_trg
-- still stamps tenant_id on every row the pull script writes.
