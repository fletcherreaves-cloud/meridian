-- ============================================================================
-- QSRSoft Shift Manager Summary → arbitrary-range per-manager performance
-- (companion to shift_manager_monthly, added for #266's investigative pulls).
--
-- shift_manager_monthly is keyed (loc, period_month, geid) — a single-day or
-- multi-day-but-not-a-full-month pull would upsert against that month's key and
-- OVERWRITE the cron job's monthly aggregate with just the requested window.
-- This table exists so an explicit SHIFTMGR_START/SHIFTMGR_END pull (see
-- scripts/qsrsoft-shift-manager-pull.mjs) never touches the monthly table at
-- all — it writes here instead, keyed by its own exact window, and multiple
-- ad-hoc windows for the same store/manager coexist without clobbering each
-- other or the month.
--
-- Same aggregation, same source report, same columns as shift_manager_monthly
-- (see that file's header) — only the identity/window columns differ.
-- PK = (loc, geid, period_start, period_end).
--
-- tenant_id + tenant-scoped RLS (PR #267 review, 2026-08-14): shift_manager_monthly predates
-- CLAUDE.md's standing rule that new pulls get a tenant_id column + RLS from day one, and
-- matching that sibling's gap here would just replicate it rather than stop it. This table has
-- zero rows at creation time — the cheapest a tenant_id column ever gets, versus a migration
-- against live data later. Pattern matches schema-coaching-cycles.sql.
-- Safe to run top-to-bottom; idempotent. Expected: "Success. No rows returned."
-- ============================================================================
create table if not exists public.shift_manager_range (
  loc                  text not null,
  period_start         date not null,
  period_end           date not null,
  geid                 bigint not null,         -- manager id (joins employee roster)
  manager_name         text,
  num_shifts           numeric,
  actual_hours         numeric,
  actual_vs_scheduled  numeric,
  actual_vs_needed     numeric,
  net_sales            numeric,
  transactions         numeric,
  avg_check            numeric,
  tpph                 numeric,                 -- transactions per punched hour
  oepe                 numeric,                 -- sec (transaction-weighted)
  r2p                  numeric,                 -- sec
  ctp                  numeric,                 -- sec
  dt_ttl               numeric,                 -- sec
  kvs                  numeric,                 -- sec
  labor_pct            numeric,                 -- punched labor % (hour-weighted)
  tenant_id            uuid not null default '00000000-0000-0000-0000-000000000001',
  updated_at           timestamptz default now(),
  primary key (loc, geid, period_start, period_end)
);

alter table public.shift_manager_range enable row level security;
drop policy if exists "shift_manager_range: auth all" on public.shift_manager_range;
drop policy if exists shift_manager_range_tenant on public.shift_manager_range;
create policy shift_manager_range_tenant on public.shift_manager_range
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);
