-- ═══════════════════════════════════════════════════════════════════════════════
-- CUSTOM METRIC TARGETS (task #89 phase 2 — owner-requested 2026-11-05)
--
-- The "add a brand-new metric with a target" half of Customize Fields. TargetFieldConfigEditor
-- (src/components/TargetFieldConfigEditor.js) already lets the owner hide/rename/regroup any
-- EXISTING target field (Tier 1, memory/plan-target-field-customization-2026-11-04.md) -- this
-- table is the missing Tier 2: a real place to store a target VALUE for a metric that has no
-- existing monthly_targets/yearly_targets column at all.
--
-- Deliberately a NEW, dedicated table rather than widening monthly_targets/yearly_targets with a
-- JSONB blob, or folding into daypart_tpph_targets (schema-daypart-tpph-targets.sql) -- that
-- table's own header already made this exact call for the same reason: a metric here is not
-- always a daypart-TPPH-shaped thing, and conflating "the one TPPH-by-daypart feature" with "any
-- metric, with or without a daypart" would complicate the working, already-shipped TPPH feature
-- for no benefit. One small, generic table -- consistent with every other per-store target table
-- in this repo (schema-weekly-count-day.sql, schema-daypart-tpph-targets.sql).
--
-- `metric_key` is any key the owner picked from the SAME metric list Top/Bottom Performers
-- already offers (engine/top-bottom-performers.js's PERFORMER_METRICS) -- never a free-typed
-- string, so a target can never point at a metric that isn't actually wired anywhere.
--
-- `daypart` defaults to 'ALL' (not NULL) deliberately: Postgres treats NULL as always-distinct in
-- a unique constraint, which would silently let a caller insert the same (loc, metric_key,
-- period_type) row twice with "no daypart" each time. A non-null sentinel keeps the unique
-- constraint meaningful. Values match labor-standard.js's DAYPARTS export exactly (same
-- taxonomy schema-daypart-tpph-targets.sql already uses) -- keep in sync if that ever changes.
--
-- `period_type` distinguishes a Monthly Targets value from a Yearly Targets value for the SAME
-- metric/store/daypart -- the two editors are separate surfaces today and a metric's sensible
-- monthly figure is not always its sensible yearly one (e.g. a monthly $ total vs. an annual
-- run-rate).
--
-- tenant_id uses public.current_tenant_id() (trigger-set), matching the corrected pattern
-- memory/project-multitenant-onboarding.md's 2026-11-02 audit required — never a hardcoded
-- literal UUID.
--
-- ⚠️ Run this once in the Supabase SQL editor (idempotent) — this session has no DDL execution
-- path (no DATABASE_URL/direct Postgres connection, no exec_sql-style RPC), same situation every
-- other supabase/schema-*.sql file in this repo is already in. DDL is the owner's own action.
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.custom_metric_targets (
  id           uuid primary key default gen_random_uuid(),
  loc          text not null,                 -- unpadded store NSN, e.g. '3708'
  metric_key   text not null,                 -- a real engine/metric-source.js key (owner picks from a dropdown, never free-typed)
  period_type  text not null check (period_type in ('monthly','yearly')),
  daypart      text not null default 'ALL' check (daypart in ('ALL','Breakfast','Lunch','Afternoon','Dinner','Late Night')),
  target_value numeric not null,
  tenant_id    uuid,
  updated_at   timestamptz default now(),
  updated_by   uuid references public.profiles(id),
  unique (tenant_id, loc, metric_key, period_type, daypart)
);

alter table public.custom_metric_targets enable row level security;

drop trigger if exists set_tenant_id_trg on public.custom_metric_targets;
create trigger set_tenant_id_trg before insert on public.custom_metric_targets
  for each row execute function public.set_tenant_id();

drop policy if exists "custom_metric_targets: tenant select" on public.custom_metric_targets;
drop policy if exists "custom_metric_targets: tenant insert" on public.custom_metric_targets;
drop policy if exists "custom_metric_targets: tenant update" on public.custom_metric_targets;
drop policy if exists "custom_metric_targets: tenant delete" on public.custom_metric_targets;
create policy "custom_metric_targets: tenant select" on public.custom_metric_targets
  for select using (tenant_id = public.current_tenant_id());
create policy "custom_metric_targets: tenant insert" on public.custom_metric_targets
  for insert with check (tenant_id = public.current_tenant_id());
create policy "custom_metric_targets: tenant update" on public.custom_metric_targets
  for update using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy "custom_metric_targets: tenant delete" on public.custom_metric_targets
  for delete using (tenant_id = public.current_tenant_id());

create index if not exists custom_metric_targets_loc_idx on public.custom_metric_targets (loc);
create index if not exists custom_metric_targets_metric_idx on public.custom_metric_targets (metric_key);

comment on table public.custom_metric_targets is
  'Per-store target value for a metric added via Customize Fields'' "add a new metric" flow (Monthly/Yearly Targets), optionally split by daypart. metric_key must be a real engine/metric-source.js key; daypart values match labor-standard.js''s DAYPARTS export plus the ''ALL'' sentinel for no split.';
