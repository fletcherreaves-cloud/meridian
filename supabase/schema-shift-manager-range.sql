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
-- PK = (loc, geid, period_start, period_end). RLS = require-auth, matching
-- shift_manager_monthly's own policy (no tenant_id — this app is single-tenant
-- today; shift_manager_monthly itself carries none either, so this companion
-- table follows its sibling's existing convention rather than inventing a
-- stricter one unilaterally).
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
  updated_at           timestamptz default now(),
  primary key (loc, geid, period_start, period_end)
);

alter table public.shift_manager_range enable row level security;
drop policy if exists "shift_manager_range: auth all" on public.shift_manager_range;
create policy "shift_manager_range: auth all" on public.shift_manager_range
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
