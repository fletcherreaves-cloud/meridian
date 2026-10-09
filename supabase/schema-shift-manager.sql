-- ============================================================================
-- QSRSoft Shift Manager Summary → per-manager monthly attributed performance
-- (Notes 33 A#3). Isolates a DM/shift-manager's OWN shifts (manager-on-duty
-- attribution) so their review scores on their actual data, not the store total.
-- geid joins Employee Roster. PK = (loc, period_month, geid). Speed metrics in sec.
-- Parser: src/engine/people-reports.js parseShiftManagerSummary. RLS = require-auth.
-- Safe to run top-to-bottom; idempotent. Expected: "Success. No rows returned."
-- ============================================================================
create table if not exists public.shift_manager_monthly (
  loc                  text not null,
  period_month         text not null,          -- 'YYYY-MM'
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
  oepe_no_park         numeric,                 -- sec, transaction-weighted
  r2p                  numeric,                 -- sec
  ctp                  numeric,                 -- sec
  dt_ttl               numeric,                 -- sec
  kvs                  numeric,                 -- sec
  healthy_use_pct      numeric,                 -- transaction-weighted
  labor_pct            numeric,                 -- punched labor % (hour-weighted)
  updated_at           timestamptz default now(),
  primary key (loc, period_month, geid)
);

-- Added 2026-10-09: the two metrics the MCDOK Hourly Manager Review workbook also
-- needs (OEPE W/O Parked, KVS Healthy Usage) -- both already in the raw API
-- response (OEPENoPark, healthyUsePct) but not previously captured. See
-- src/engine/people-reports.js's parseShiftManagerSummary and memory/reference-
-- shift-manager-summary.md.
alter table public.shift_manager_monthly add column if not exists oepe_no_park numeric;     -- sec, transaction-weighted
alter table public.shift_manager_monthly add column if not exists healthy_use_pct numeric;  -- transaction-weighted

alter table public.shift_manager_monthly enable row level security;
drop policy if exists "shift_manager_monthly: auth all" on public.shift_manager_monthly;
create policy "shift_manager_monthly: auth all" on public.shift_manager_monthly
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
