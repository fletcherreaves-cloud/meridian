-- ═══════════════════════════════════════════════════════════════════════════════
-- DAYPART TPPH TARGETS (Targets system, item #2 — owner-decided 2026-11-02)
--
-- Per-store TPPH target, broken out by daypart, to compare against the ALREADY-COMPUTED
-- actual daypart TPPH in src/engine/labor-standard.js's allocationByStoreDaypart()/
-- allocationDistrict() (wired into src/views/labor-allocation.js). The "actual" half of this
-- feature needed nothing new — it already existed. This table is the missing target half.
--
-- Daypart taxonomy: owner-confirmed 2026-11-02 to reuse the EXISTING canonical 5-way split
-- (DAYPARTS, labor-standard.js: Breakfast/Lunch/Afternoon/Dinner/Late Night) — the same one
-- the VLH guide, labor allocation analysis, and security rules already use. Do not invent a
-- second daypart taxonomy; keep this in sync with that file's `DAYPARTS` export if it ever
-- changes.
--
-- Deliberately NOT folded into target_overrides (schema-target-overrides.sql) despite that
-- registry's own "generic enough to extend by adding one row" framing — every existing
-- TARGET_OVERRIDE_FIELDS entry carries a `reviewKey` tied to a real Performance Review metric
-- (src/__tests__/target-overrides.test.js enforces this), and daypart TPPH is not a
-- review-scored metric; it feeds the Labor Allocation panel, a different consumer. Forcing it
-- into that registry would mean either a fake reviewKey (breaks the cross-check test) or
-- weakening reviewKey to optional (untested assumption for every other consumer of that
-- registry). A small dedicated table, same shape as weekly_count_day_overrides
-- (schema-weekly-count-day.sql) — "real table, per-store data belongs in per-store rows, not
-- buried inside one config row" — is the correct-sized fit. Company/State/Patch cascade
-- (target_overrides' own hierarchy) is NOT built here for v1 — flat per-store targets only;
-- add cascade later if the owner wants it, rather than guess at it now.
--
-- tenant_id uses public.current_tenant_id() (set via trigger), NOT a hardcoded literal UUID —
-- deliberately avoiding the exact anti-pattern memory/project-multitenant-onboarding.md's
-- 2026-11-02 correction flagged on 51 OTHER schema files (including, ironically,
-- schema-weekly-count-day.sql, this table's own closest analog). Do not copy that file's
-- tenant_id column default/policy shape — copy this file's instead.
--
-- ⚠️ Run this once in the Supabase SQL editor (idempotent) — this session has no DDL execution
-- path (no DATABASE_URL/direct Postgres connection, no exec_sql-style RPC), same situation
-- every other supabase/schema-*.sql file in this repo is already in.
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.daypart_tpph_targets (
  id          uuid primary key default gen_random_uuid(),
  loc         text not null,                 -- unpadded store NSN, e.g. '3708'
  daypart     text not null check (daypart in ('Breakfast','Lunch','Afternoon','Dinner','Late Night')),
  target_tpph numeric not null check (target_tpph > 0),
  tenant_id   uuid,
  updated_at  timestamptz default now(),
  updated_by  uuid references public.profiles(id),
  unique (tenant_id, loc, daypart)
);

alter table public.daypart_tpph_targets enable row level security;

drop trigger if exists set_tenant_id_trg on public.daypart_tpph_targets;
create trigger set_tenant_id_trg before insert on public.daypart_tpph_targets
  for each row execute function public.set_tenant_id();

drop policy if exists "daypart_tpph_targets: tenant select" on public.daypart_tpph_targets;
drop policy if exists "daypart_tpph_targets: tenant insert" on public.daypart_tpph_targets;
drop policy if exists "daypart_tpph_targets: tenant update" on public.daypart_tpph_targets;
drop policy if exists "daypart_tpph_targets: tenant delete" on public.daypart_tpph_targets;
create policy "daypart_tpph_targets: tenant select" on public.daypart_tpph_targets
  for select using (tenant_id = public.current_tenant_id());
create policy "daypart_tpph_targets: tenant insert" on public.daypart_tpph_targets
  for insert with check (tenant_id = public.current_tenant_id());
create policy "daypart_tpph_targets: tenant update" on public.daypart_tpph_targets
  for update using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy "daypart_tpph_targets: tenant delete" on public.daypart_tpph_targets
  for delete using (tenant_id = public.current_tenant_id());

create index if not exists daypart_tpph_targets_loc_idx on public.daypart_tpph_targets (loc);

comment on table public.daypart_tpph_targets is
  'Per-store, per-daypart TPPH target (owner-editable, Labor Allocation panel). Daypart values match labor-standard.js''s DAYPARTS export exactly — keep in sync if that ever changes. Flat per-store only, no Company/State/Patch cascade in this version.';
