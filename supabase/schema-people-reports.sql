-- ============================================================================
-- QSRSoft People reports → Performance-Review People metrics (Notes 32)
-- Monthly per-loc tables for Headcount (Roster Statistics), Shift-Certified
-- Managers + role composition (Employee Roster aggregate), and 0-90 Turnover.
-- Parsers: src/engine/people-reports.js. PK = (loc, period_month 'YYYY-MM').
-- RLS = require-auth (matches Phase 1). Safe to run top-to-bottom; idempotent.
-- Expected result: "Success. No rows returned."
-- ============================================================================

-- Roster Statistics — authoritative active headcount composition per store/month.
create table if not exists public.roster_statistics (
  loc           text not null,
  period_month  text not null,                 -- 'YYYY-MM'
  crew_staff    numeric,
  shift_staff   numeric,
  gmdm_staff    numeric,
  crew_active   numeric,
  shift_active  numeric,
  roster_size   numeric,
  roster_active numeric,                        -- all active hourly (= crew+shift+gm&dm active)
  under18       numeric,
  updated_at    timestamptz default now(),
  primary key (loc, period_month)
);

-- Employee Roster aggregate — active head-count by role bucket per store/month.
-- Shift-Certified Managers = shift_mgr (Cert Swing + Dept Mgrs, owner-confirmed).
create table if not exists public.roster_role_counts (
  loc           text not null,
  period_month  text not null,
  crew          numeric,
  shift_mgr     numeric,                        -- # Shift Certified Managers
  gm            numeric,
  maintenance   numeric,
  admin         numeric,
  other         numeric,
  total         numeric,
  updated_at    timestamptz default now(),
  primary key (loc, period_month)
);

-- Turnover — per store/month, all columns + the 0-90 proxy (1 − Retained>90%).
create table if not exists public.turnover_monthly (
  loc                     text not null,
  period_month            text not null,
  hires                   numeric,
  roster_size             numeric,
  terms                   numeric,
  terms_under_90          numeric,
  retained_over_90        numeric,
  retained_over_90_pct    numeric,
  monthly_annual_turnover numeric,
  ttm_turnover            numeric,
  three_month_turnover    numeric,
  turnover_090_pct        numeric,              -- 1 − retained_over_90_pct (0-90 turnover)
  updated_at              timestamptz default now(),
  primary key (loc, period_month)
);

alter table public.roster_statistics  enable row level security;
alter table public.roster_role_counts enable row level security;
alter table public.turnover_monthly   enable row level security;

drop policy if exists "roster_statistics: auth all" on public.roster_statistics;
create policy "roster_statistics: auth all" on public.roster_statistics
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "roster_role_counts: auth all" on public.roster_role_counts;
create policy "roster_role_counts: auth all" on public.roster_role_counts
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "turnover_monthly: auth all" on public.turnover_monthly;
create policy "turnover_monthly: auth all" on public.turnover_monthly
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
