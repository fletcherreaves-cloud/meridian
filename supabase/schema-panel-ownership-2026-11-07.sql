-- ── Projection/Targets ownership + cross-user awareness (owner request, 2026-11-07) ──────────────
-- Owner's own framing: "we need to figure out a way in settings to designate someone while
-- allowing other people to be added as well to be in charge of projections for an organization
-- as that should not be spread across all roles... let's come up with a way to have an event log
-- so that if one user logged in and makes changes to projections and another user follows up and
-- logged in, they're notified that the first user has already done certain things." Confirmed
-- scope: DO/VP and above are the default baseline (src/engine/permissions.js's new
-- 'projections.own' key), with the ability for those role levels to grant a NAMED individual the
-- same standing regardless of role (the multi-org/different-operator scenario the owner named).
-- "Targets [Smart Targets Apply-as-Official + Monthly/Yearly Targets] are in the same zone" —
-- owner-confirmed — so one capability gates all four write actions, not four separate ones.
--
-- ⚠️ HANDOFF — run this manually in the Supabase SQL editor before the new ownership-grant code
-- can write/read real rows (same pattern as every other new-table dispatch in this repo). Both
-- blocks are idempotent -- safe to run anytime, including a second time.

-- ── 1. panel_owner_grants — named delegation on top of the projections.own role baseline ────────
-- panel_id is a string zone id, not a literal panel-registry id — 'projections' covers the whole
-- zone (Projections lock, Smart Targets "Apply as Official", Monthly Targets, Yearly Targets),
-- matching the owner's "same zone" framing. A future zone (a different panel this same pattern
-- should apply to) gets its own panel_id value here, not a schema change.
create table if not exists public.panel_owner_grants (
  id           uuid        default gen_random_uuid() primary key,
  panel_id     text        not null default 'projections',
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  user_label   text,                                   -- denormalized name/email for fast render, no join needed
  granted_by   uuid        references public.profiles(id),
  granted_at   timestamptz not null default now(),
  revoked_at   timestamptz,                             -- soft-revoke, same convention as app_notifications' dismissed_at/cleared_at
  tenant_id    uuid
);
create index if not exists panel_owner_grants_active_idx
  on public.panel_owner_grants (tenant_id, panel_id) where revoked_at is null;

alter table public.panel_owner_grants enable row level security;

drop trigger if exists set_tenant_id_trg on public.panel_owner_grants;
create trigger set_tenant_id_trg before insert on public.panel_owner_grants
  for each row execute function public.set_tenant_id();

-- Every signed-in user needs to READ the active grant list (it gates UI buttons client-side,
-- same "UI-layer gate, RLS is the real boundary" relationship every other permission key in
-- permissions.js has) — but only an existing owner (role-baseline OR an active grant) may WRITE
-- (grant/revoke) one, so a non-owner can never self-grant.
drop policy if exists "panel_owner_grants: tenant select" on public.panel_owner_grants;
drop policy if exists "panel_owner_grants: owners write" on public.panel_owner_grants;
drop policy if exists "panel_owner_grants: owners update" on public.panel_owner_grants;
create policy "panel_owner_grants: tenant select" on public.panel_owner_grants
  for select using (tenant_id = public.current_tenant_id());
create policy "panel_owner_grants: owners write" on public.panel_owner_grants
  for insert with check (
    tenant_id = public.current_tenant_id()
    and (
      public.get_my_role() in ('admin','owner','vp','do')
      or exists (
        select 1 from public.panel_owner_grants g
        where g.tenant_id = public.current_tenant_id() and g.panel_id = panel_owner_grants.panel_id
          and g.user_id = auth.uid() and g.revoked_at is null
      )
    )
  );
create policy "panel_owner_grants: owners update" on public.panel_owner_grants
  for update using (tenant_id = public.current_tenant_id())
  with check (
    tenant_id = public.current_tenant_id()
    and (
      public.get_my_role() in ('admin','owner','vp','do')
      or exists (
        select 1 from public.panel_owner_grants g
        where g.tenant_id = public.current_tenant_id() and g.panel_id = panel_owner_grants.panel_id
          and g.user_id = auth.uid() and g.revoked_at is null
      )
    )
  );

-- ── 2. app_notifications gets target_user_ids, for named grantees outside the role baseline ─────
-- Mirrors target_roles' own additive pattern exactly (schema-app-notifications.sql's item 3) --
-- NULL preserves every existing producer's behavior unchanged. A named grant-holder may not hold
-- one of 'admin'/'owner'/'vp'/'do' (that's the whole point of the grant), so target_roles alone
-- can't reach them -- this column lets a producer target them explicitly, OR'd with target_roles
-- at delivery time.
alter table public.app_notifications add column if not exists target_user_ids uuid[];
comment on column public.app_notifications.target_user_ids is
  'NULL = no explicit per-user targets (the pre-existing default). Non-null = also deliver to these specific profile ids, independent of (OR''d with) target_roles -- for a named panel_owner_grants holder who may not hold one of target_roles'' role ids.';
