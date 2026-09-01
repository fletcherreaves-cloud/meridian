-- ═══════════════════════════════════════════════════════════════════════════════
-- WEEKLY COUNT DAY OVERRIDES (owner-directed, 2026-09-01)
--
-- Real, owner-entered fallback for the weekly-count-day automation (scripts/qsrsoft-onhand-
-- pull.mjs's 'weekly-count-day' pull mode, scripts/weekly-cycle-digest-send.mjs). The primary
-- signal is derived from qsr_onhand session history (detectWeeklyCountDay(), src/engine/
-- count-cycle.js) -- precise but sparse. This table holds the per-store "Weekly Inventory Count
-- Day" straight from Organization_Structure.xlsx's Locations sheet (parseOrgStructureCountDays(),
-- src/parsers/index.js), imported on every org-structure upload (App.js) and consumed as the
-- fallback layer by mergeWeeklyCountDay() (src/engine/count-cycle.js) -- see that function's own
-- doc comment for the derived-vs-fallback precedence.
--
-- One row per store (not the earlier org_config JSON-blob draft this replaces -- the owner asked
-- for a real table so this per-store data is queryable/joinable like any other per-store
-- override, not buried inside a single config row). Same shape/RLS pattern as
-- target_overrides (schema-target-overrides.sql) -- the closest existing analog (a small,
-- owner-editable per-store/per-scope override table).
--
-- ⚠️ Run this once in the Supabase SQL editor (idempotent) -- this session has no DDL execution
-- path (checked: no DATABASE_URL/direct Postgres connection in env, no exec_sql-style RPC on the
-- project, same situation every other supabase/schema-*.sql file in this repo is already in).
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.weekly_count_day_overrides (
  id           uuid primary key default gen_random_uuid(),
  loc          text not null,             -- unpadded store NSN, e.g. '3708'
  weekday      smallint not null check (weekday between 0 and 6),  -- 0=Sun .. 6=Sat
  weekday_name text not null,             -- 'Sunday'..'Saturday' -- human-readable, matches the source file's own text
  tenant_id    uuid not null default '00000000-0000-0000-0000-000000000001',
  updated_at   timestamptz default now(),
  updated_by   uuid references public.profiles(id),
  unique (tenant_id, loc)
);

alter table public.weekly_count_day_overrides enable row level security;

-- Tenant isolation only, matching target_overrides' own reasoning: this is small, non-sensitive
-- operational config (which weekday a store counts inventory on), read by both the app and the
-- automation scripts (service role, bypasses RLS regardless). Write access is gated by the
-- org-structure upload flow itself (App.js), not by RLS -- same pattern target_overrides uses.
drop policy if exists weekly_count_day_overrides_tenant on public.weekly_count_day_overrides;
create policy weekly_count_day_overrides_tenant on public.weekly_count_day_overrides
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

create index if not exists weekly_count_day_overrides_loc_idx on public.weekly_count_day_overrides (loc);

comment on table public.weekly_count_day_overrides is
  'Real, owner-entered per-store weekly count day (Organization_Structure.xlsx Locations sheet, "Weekly Inventory Count Day"), imported on every org-structure upload. Fallback layer for detectWeeklyCountDay()''s derived signal -- see mergeWeeklyCountDay() (src/engine/count-cycle.js).';
