-- ═══════════════════════════════════════════════════════════════════════════════
-- NEW STORE LAUNCH PLAN (New Store Launch Planner, memory/project-new-store-launch-planner.md,
-- owner-approved 2026-11-06 — "Build it now")
--
-- One row per (loc, plan_date): a day-by-day sales plan for a newly opening/relocating store,
-- seeded from src/engine/new-store-ramp.js's real comparable-store ramp blending
-- (projectLaunchPlan) and editable in-app (src/views/launch-planner.js). First used for Lindsay
-- (44689, opening 2026-11-14), but every input (loc, comparables, mature run-rate, open date) is
-- caller-supplied — this table and the tool around it are reusable verbatim for the next
-- relocation/opening, per the owner's own stated goal ("model future new locations... kickstart
-- forecasting").
--
-- `projected_sales` is the ramp model's own output for that day; `override_sales` is the owner's
-- manual edit (null = use projected). `source` tracks which: 'ramp' rows get silently replaced by
-- the panel's "Regenerate from ramp model" action if the model/inputs change; 'manual' rows never
-- do — the UI sets source:'manual' the moment the owner types an override, and that's permanent
-- until they explicitly reset the row.
--
-- Same tenant_id + RLS shape every other small operational table in this repo uses (closest
-- analog: runtime_error_reports, schema-runtime-error-reports.sql) — tenant isolation only, not a
-- sensitive-data table.
--
-- ⚠️ Run this once in the Supabase SQL editor (idempotent) — same situation every other
-- supabase/schema-*.sql file in this repo is already in: this session has no DDL execution path,
-- and per CLAUDE.md's standing rule, Claude never runs schema DDL regardless. The Launch Planner
-- UI, engine, and Supabase helpers (saveLaunchPlanRow/loadLaunchPlan, src/lib/supabase.js) are
-- already live once this PR merges — they self-heal (silent no-op, not an error) against the
-- missing table until this migration runs, so nothing breaks either way, but no plan row is
-- actually persisted until the owner runs this.
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.new_store_launch_plan (
  id              uuid primary key default gen_random_uuid(),
  loc             text not null,              -- unpadded store number, matching DEFAULT_TARGETS/STORE_NAMES convention
  plan_date       date not null,
  day_n           int,                        -- days since open (0-indexed), matching new-store-ramp.js's own indexing
  projected_sales numeric,                    -- the ramp model's own output for this day
  override_sales  numeric,                    -- owner's manual edit; null means "use projected"
  note            text,                       -- e.g. 'Grand Opening'
  source          text not null default 'ramp' check (source in ('ramp','manual')),
  tenant_id       uuid not null default '00000000-0000-0000-0000-000000000001',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (tenant_id, loc, plan_date)
);

alter table public.new_store_launch_plan enable row level security;

drop policy if exists new_store_launch_plan_tenant on public.new_store_launch_plan;
create policy new_store_launch_plan_tenant on public.new_store_launch_plan
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

create index if not exists new_store_launch_plan_loc_idx on public.new_store_launch_plan (loc, plan_date);

comment on table public.new_store_launch_plan is
  'Day-by-day sales plan for a newly opening/relocating store, seeded from new-store-ramp.js''s comparable-store ramp blending and editable in-app (Launch Planner). Reusable per opening -- not Lindsay-specific.';
comment on column public.new_store_launch_plan.source is
  'ramp (default, from the model) | manual (owner-overridden -- never silently replaced by "Regenerate from ramp model").';
