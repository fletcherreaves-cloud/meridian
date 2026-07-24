-- ═══════════════════════════════════════════════════════════════════════════════
-- Meridian — Supabase schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Profiles ──────────────────────────────────────────────────────────────────
-- One row per authenticated user. Automatically created by a trigger on signup.
create table if not exists public.profiles (
  id               uuid references auth.users on delete cascade primary key,
  name             text,
  email            text,
  role             text not null default 'manager'
                     check (role in ('admin', 'supervisor', 'manager')),
  -- accessible_locs: null = all stores; array = restrict to these store location codes
  accessible_locs  text[],
  org              text check (org in ('mcdok', 'emerald')),
  created_at       timestamptz default now()
);

-- Auto-create a profile row whenever a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Org config ────────────────────────────────────────────────────────────────
-- Stores the Customize panel settings (review config, thresholds, weights, etc.)
-- Key format: 'review_config' (shared) or 'review_config_mcdok' / 'review_config_emerald'
create table if not exists public.org_config (
  key        text primary key,
  data       jsonb not null default '{}',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now()
);

-- ── Reviews ───────────────────────────────────────────────────────────────────
-- One row per performance review. The full review object is stored in `data` (JSONB).
-- The scalar columns are for filtering/RLS without having to unpack the JSONB.
create table if not exists public.reviews (
  id             text primary key,           -- e.g. "ronald_mcdonald_2026_H1"
  data           jsonb not null,             -- complete review object
  reviewee_name  text,
  reviewee_loc   text,                       -- store location code, e.g. "3708"
  review_year    integer,
  review_half    text check (review_half in ('H1', 'H2')),
  status         text default 'draft',
  org            text,
  owner_id       uuid references public.profiles(id),
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- ── Staff assignments (optional, for location tracking from 7th notes) ────────
-- Track which manager/supervisor was responsible for which store during each period.
-- Enables accurate review attribution when someone transfers between locations.
create table if not exists public.staff_assignments (
  id          uuid default gen_random_uuid() primary key,
  profile_id  uuid references public.profiles(id) on delete cascade,
  store_loc   text not null,
  start_date  date not null,
  end_date    date,                         -- null = currently assigned
  notes       text,
  created_at  timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════
-- All policies use get_my_role() — a SECURITY DEFINER function that reads
-- profiles WITHOUT triggering RLS, preventing infinite recursion.

-- ── SECURITY DEFINER helper (run before any policies) ─────────────────────────
create or replace function public.get_my_role()
returns text language sql security definer stable as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ── profiles RLS ──────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "profiles: own read"  on public.profiles;
drop policy if exists "profiles: admin all" on public.profiles;

create policy "profiles: own read" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles: admin all" on public.profiles
  for all using (get_my_role() = 'admin');

-- ── org_config RLS ────────────────────────────────────────────────────────────
alter table public.org_config enable row level security;

drop policy if exists "config: authenticated read"     on public.org_config;
drop policy if exists "config: admin/supervisor write" on public.org_config;

create policy "config: authenticated read" on public.org_config
  for select using (auth.uid() is not null);

create policy "config: admin/supervisor write" on public.org_config
  for all using (get_my_role() in ('admin', 'supervisor'));

-- ── reviews RLS ───────────────────────────────────────────────────────────────
alter table public.reviews enable row level security;

drop policy if exists "reviews: admin all"            on public.reviews;
drop policy if exists "reviews: supervisor read"      on public.reviews;
drop policy if exists "reviews: manager read own locs" on public.reviews;
drop policy if exists "reviews: authenticated write"  on public.reviews;
drop policy if exists "reviews: authenticated update" on public.reviews;
drop policy if exists "reviews: admin delete"         on public.reviews;

create policy "reviews: admin all" on public.reviews
  for all using (get_my_role() = 'admin');

create policy "reviews: supervisor read" on public.reviews
  for select using (
    get_my_role() = 'supervisor' and (
      (select accessible_locs from public.profiles where id = auth.uid()) is null
      or reviewee_loc = any((select accessible_locs from public.profiles where id = auth.uid()))
    )
  );

create policy "reviews: manager read own locs" on public.reviews
  for select using (
    get_my_role() = 'manager' and
    reviewee_loc = any((select accessible_locs from public.profiles where id = auth.uid()))
  );

create policy "reviews: authenticated write" on public.reviews
  for insert with check (auth.uid() is not null);

create policy "reviews: authenticated update" on public.reviews
  for update using (auth.uid() is not null);

create policy "reviews: admin delete" on public.reviews
  for delete using (get_my_role() = 'admin');

-- ── staff_assignments RLS ─────────────────────────────────────────────────────
alter table public.staff_assignments enable row level security;

-- Users can see their own assignments; supervisors/admins see all
create policy "assignments: own or above" on public.staff_assignments
  for select using (
    profile_id = auth.uid() or
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('supervisor', 'admin')
    )
  );

create policy "assignments: admin/supervisor write" on public.staff_assignments
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('supervisor', 'admin')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES (performance on common query patterns)
-- ═══════════════════════════════════════════════════════════════════════════════
create index if not exists reviews_loc_idx  on public.reviews (reviewee_loc);
create index if not exists reviews_year_idx on public.reviews (review_year, review_half);
create index if not exists reviews_org_idx  on public.reviews (org);
create index if not exists assign_profile_idx on public.staff_assignments (profile_id, start_date);

-- ═══════════════════════════════════════════════════════════════════════════════
-- QSRSoft EMAIL INGEST PIPELINE (v4.240+)
-- Run this block after the main schema above.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Storage bucket for raw Excel report files ─────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'qsr-reports',
  'qsr-reports',
  false,   -- private: requires auth
  52428800, -- 50 MB max per file
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream',
    'application/pdf'
  ]
) on conflict (id) do nothing;

-- Public read — file contents are CSV business reports (no PII).
-- Matches the localhost bypass pattern used for pending_reports.
-- Anyone with the anon key and the exact storage path can download.
create policy "qsr-reports: public read"
  on storage.objects for select
  using (bucket_id = 'qsr-reports');

-- ── Storage bucket for manually uploaded files (cross-device sync) ───────────
-- Receives files uploaded via the Load button on any device.
-- Other devices discover them via pending_reports and auto-ingest on startup.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reports',
  'reports',
  false,
  52428800,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroenabled.12',
    'text/csv',
    'application/pdf',
    'application/octet-stream'
  ]
) on conflict (id) do nothing;

create policy "reports: public read"
  on storage.objects for select
  using (bucket_id = 'reports');

create policy "reports: public insert"
  on storage.objects for insert
  with check (bucket_id = 'reports');

-- ── pending_reports — tracks files waiting to be parsed by Meridian ───────────
create table if not exists public.pending_reports (
  id           uuid default gen_random_uuid() primary key,
  filename     text not null,
  storage_path text not null unique,  -- YYYY-MM-DD/filename.xlsx
  report_type  text,                  -- 'sales-ledger' | 'labor' | 'cash-sheet' | etc.
  source       text default 'email',  -- 'email' | 'manual'
  uploaded_at  timestamptz default now(),
  processed    boolean default false,
  processed_at timestamptz,
  org          text,
  file_data    text                   -- base64-encoded file content for cross-device sync
);

alter table public.pending_reports enable row level security;

-- Public read — file metadata only, no sensitive data.
-- Auto-ingest runs before Supabase auth is established on localhost.
create policy "pending_reports: public read" on public.pending_reports
  for select using (true);

-- Public update — auto-ingest marks reports processed before Supabase auth is established on localhost.
create policy "pending_reports: public update" on public.pending_reports
  for update using (true);

-- Service role only for insert (Edge Function uses service key, bypasses RLS)

create index if not exists pending_reports_processed_idx
  on public.pending_reports (processed, uploaded_at desc);

-- ═══════════════════════════════════════════════════════════════════════════════
-- MONTHLY TARGETS (v4.243+)
-- Per-store targets sent to stores/supervisors each month.
-- Parsed from the Restaurant Projections XLSM workbook and persisted here
-- so they survive across sessions without re-uploading the file.
-- Primary key: (loc, year, month) — one row per store per period.
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.monthly_targets (
  loc               text not null,           -- store number, e.g. '3708'
  year              integer not null,
  month             integer not null check (month between 1 and 12),
  -- Sales
  sales_proj        float,                   -- Sales Projection ($)
  comp_sales_pct    float,                   -- Comp Sales %
  -- Labor
  crew_labor_pct    float,                   -- Crew Labor %
  bonus_crew_pct    float,                   -- Bonus Crew Labor %
  tpph_target       float,                   -- TPPH Target
  -- Food Over Base components
  base_food_pct     float,                   -- Base Food %
  disc_coup_pct     float,                   -- Disc Coup %
  comp_waste_pct    float,                   -- Comp Waste %
  raw_waste_pct     float,                   -- Raw Waste %
  condiment_pct     float,                   -- Condiment %
  emp_food_pct      float,                   -- Emp Food %
  stat_loss_pct     float,                   -- Stat Loss %
  unex_diff_pct     float,                   -- Unex Diff %
  fob_target_pct    float,                   -- FOB Target w/o Disc Coup
  total_food_cost_pct float,                 -- Total Food Cost %
  paper_cost_pct    float,                   -- P&L Paper Cost %
  op_supply_target  float,                   -- Op Supply Target ($)
  -- Audit
  updated_at        timestamptz default now(),
  updated_by        uuid references public.profiles(id),
  primary key (loc, year, month)
);

alter table public.monthly_targets enable row level security;

-- Public read — targets are operational data, no PII
create policy "monthly_targets: public read" on public.monthly_targets
  for select using (true);

-- Public write — localhost bypass has no auth session; tighten after Vercel auth is live
create policy "monthly_targets: public write" on public.monthly_targets
  for all using (true);

create index if not exists monthly_targets_year_month_idx
  on public.monthly_targets (year, month);

-- ── SMG FullScale Results ──────────────────────────────────────────────────────
-- Aggregate SMG Voice scores per store per month (from FullScale_Report.xlsx)
create table if not exists public.smg_fullscale (
  loc              text not null,
  year             integer not null,
  month            integer not null check (month between 1 and 12),
  report_start     text,                -- e.g. "6/1/2026"
  report_end       text,                -- e.g. "6/30/2026"
  -- Overall Satisfaction (1-5 scale, % based)
  osat_top2        float,               -- % giving 4 or 5 (top-2-box, higher=better)
  osat_5           float,               -- % giving 5 only (top-1-box)
  osat_avg         float,               -- weighted average score 1-5
  -- Best-to-Best benchmarks (higher=better)
  osat_b2b         float,               -- % meeting Overall Satisfaction B2B standard
  accuracy_b2b     float,               -- % meeting Accuracy B2B standard
  -- Problem rates (lower=better)
  dt_problem       float,               -- % Drive-Thru customers experiencing a problem
  overall_problem  float,               -- % any customer experiencing a problem
  updated_at       timestamptz default now(),
  updated_by       uuid references public.profiles(id),
  primary key (loc, year, month)
);

alter table public.smg_fullscale enable row level security;

-- Public read — SMG scores are operational data, no PII
create policy "smg_fullscale: public read" on public.smg_fullscale
  for select using (true);

-- Public write — localhost bypass has no auth session; tighten after Vercel auth is live
create policy "smg_fullscale: public write" on public.smg_fullscale
  for all using (true);

create index if not exists smg_fullscale_year_month_idx
  on public.smg_fullscale (year, month);

-- ── QSRSoft FOB (Food Over Base) ─────────────────────────────────────────────
-- Monthly per-store FOB data synced daily via scripts/qsrsoft-pull.mjs.
-- One row per store (loc = padded NSN) per date (daily granularity).
-- Includes current-period and last-year (ly_*) fields.
-- Weekly/monthly aggregates are derived in-app from these daily rows.
-- Requires QSRSOFT_TOKEN or QSRSOFT_USERNAME+PASSWORD GitHub Secrets.

create table if not exists public.qsr_fob (
  loc                          text        not null,
  date                         date        not null,
  prod_sales_amt               numeric,
  comp_waste_amt               numeric,
  raw_waste_amt                numeric,
  condiments_amt               numeric,
  emp_mgr_meals_amt            numeric,
  discount_coupons_amt         numeric,
  stat_variance_amt            numeric,
  unexplained_amt              numeric,
  total_base_food              numeric,
  pnl_food_cost_begin          numeric,
  pnl_food_cost_purchases      numeric,
  pnl_food_cost_adjustments    numeric,
  pnl_food_cost_transfers      numeric,
  pnl_food_cost_promotions     numeric,
  pnl_food_cost_end            numeric,
  pnl_paper_cost_begin         numeric,
  pnl_paper_cost_purchases     numeric,
  pnl_paper_cost_adjustments   numeric,
  pnl_paper_cost_transfers     numeric,
  pnl_paper_cost_promotions    numeric,
  pnl_paper_cost_end           numeric,
  ly_prod_sales_amt            numeric,
  ly_comp_waste_amt            numeric,
  ly_raw_waste_amt             numeric,
  ly_condiments_amt            numeric,
  ly_emp_mgr_meals_amt         numeric,
  ly_discount_coupons_amt      numeric,
  ly_stat_variance_amt         numeric,
  ly_unexplained_amt           numeric,
  ly_total_base_food           numeric,
  ly_pnl_food_cost_begin       numeric,
  ly_pnl_food_cost_purchases   numeric,
  ly_pnl_food_cost_adjustments numeric,
  ly_pnl_food_cost_transfers   numeric,
  ly_pnl_food_cost_promotions  numeric,
  ly_pnl_food_cost_end         numeric,
  ly_pnl_paper_cost_begin      numeric,
  ly_pnl_paper_cost_purchases  numeric,
  ly_pnl_paper_cost_adjustments numeric,
  ly_pnl_paper_cost_transfers  numeric,
  ly_pnl_paper_cost_promotions numeric,
  ly_pnl_paper_cost_end        numeric,
  updated_at                   timestamptz default now(),
  primary key (loc, date)
);

alter table public.qsr_fob enable row level security;

create policy "qsr_fob: public read" on public.qsr_fob
  for select using (true);

create policy "qsr_fob: public write" on public.qsr_fob
  for all using (true);

create index if not exists qsr_fob_date_idx
  on public.qsr_fob (date desc);

-- ── LifeLenz Schedule (Labor Analysis Summary) ───────────────────────────────
-- Daily per-store scheduling rows from LifeLenz Labor Analysis Summary Report.
-- One row per store per date. Upserted on upload so re-syncing is safe.
create table if not exists public.lifelenz_schedule (
  loc             text not null,           -- store number, e.g. '0003708'
  date            date not null,
  fcst_sales      float,
  adj_fcst_sales  float,
  sales           float,
  sales_diff      float,
  fcst_tcs        float,
  tcs             float,
  tcs_diff        float,
  labor_pct       float,
  proj_vlh        float,
  sch_vlh         float,
  need_vlh        float,
  vlh_diff        float,
  fix_guide_hrs   float,
  sch_fix_hrs     float,
  proj_floor      float,
  sch_floor       float,
  need_floor      float,
  ideal_tot_hrs   float,
  sal_mgr_hrs     float,
  crew_hrs        float,
  tot_hrs_diff    float,
  tpmh            float,
  updated_at      timestamptz default now(),
  primary key (loc, date)
);

alter table public.lifelenz_schedule enable row level security;

-- Public read/write — schedule data is operational, no PII; matches localhost bypass pattern
create policy "lifelenz_schedule: public read" on public.lifelenz_schedule
  for select using (true);

create policy "lifelenz_schedule: public write" on public.lifelenz_schedule
  for all using (true);

create index if not exists lifelenz_schedule_date_idx
  on public.lifelenz_schedule (date desc);

-- ── LifeLenz per-job (business-role / station) hours + cost, per store-week ───
-- The right-panel "per-job" breakdown on the LifeLenz weekly-schedule screen
-- (Drive Thru / Grill / Lobby / Maintenance / …) — one row per store × week ×
-- business role. Source: ShiftsForSchedulePeriod GraphQL, pre-aggregated by
-- scripts/lifelenz-pull.mjs using src/engine/lifelenz-shift-jobs.js (zero-drift
-- with the client engine). week_start is the WEDNESDAY that anchors the LifeLenz
-- business week (WEEK_START_DOW=3), matching the Weekly Schedule Summary panel.
create table if not exists public.lifelenz_job_hours (
  loc              text not null,          -- store number, e.g. '0006838'
  week_start       date not null,          -- Wednesday anchor of the business week
  business_role_id text not null,          -- LifeLenz businessRoleId (station)
  role_name        text,                   -- resolved station name (Drive Thru, …)
  category         text,                   -- Variable | Floor | Fixed
  code             text,                   -- LifeLenz short code (D, G, L, …)
  hours            float,                  -- Σ pivotMetrics.seconds / 3600
  cost             float,                  -- Σ pivotMetrics.earnings ($)
  reg_hours        float,                  -- regular-pay hours
  ot_hours         float,                  -- overtime-pay hours
  n_shifts         integer,                -- committed shifts touching this role
  updated_at       timestamptz default now(),
  primary key (loc, week_start, business_role_id)
);

alter table public.lifelenz_job_hours enable row level security;

-- Public read/write — operational, no PII; matches the lifelenz_schedule pattern.
-- drop-if-exists first so this block is safe to re-run (create policy has no IF NOT EXISTS).
drop policy if exists "lifelenz_job_hours: public read" on public.lifelenz_job_hours;
create policy "lifelenz_job_hours: public read" on public.lifelenz_job_hours
  for select using (true);

drop policy if exists "lifelenz_job_hours: public write" on public.lifelenz_job_hours;
create policy "lifelenz_job_hours: public write" on public.lifelenz_job_hours
  for all using (true);

create index if not exists lifelenz_job_hours_week_idx
  on public.lifelenz_job_hours (week_start desc);

-- ── SMG VOICE Operator Performance (monthly PDF reports) ─────────────────────
-- One row per store × period × report_type.
-- Source: McDonalds_VOICE_Operator_Performance_<operatorId>.PDF
-- Parser: src/parsers/voice-performance.js
create table if not exists public.smg_voice_performance (
  id              bigserial primary key,
  period          text not null,          -- '2026-06'
  report_type     text not null,          -- 'monthly' | 'trailing90' | 'ytd'
  operator_id     text not null,          -- '1000015842'
  operator_name   text,                   -- 'THORLEY, RICK'
  loc             text not null,          -- '05985'
  loc_name        text,                   -- 'DURANT-US HWY 70'
  dt_sat          smallint,               -- Drive Thru Overall Satisfaction %
  dt_dissat       smallint,               -- Drive Thru Dissatisfaction B2B %
  ir_sat          smallint,               -- In Restaurant Satisfaction %
  ir_dissat       smallint,               -- In Restaurant Dissatisfaction B2B %
  accuracy_b2b    smallint,               -- Accuracy B2B %
  quality_b2b     smallint,               -- Overall Quality B2B %
  fries_b2b       smallint,               -- Fries Quality B2B %
  snack_wrap_b2b  smallint,               -- Snack Wrap Quality B2B % (NULL = N/A)
  source_file     text,
  created_at      timestamptz default now(),
  unique(period, report_type, operator_id, loc)
);

alter table public.smg_voice_performance enable row level security;

create policy "smg_voice_performance: public read" on public.smg_voice_performance
  for select using (true);

create policy "smg_voice_performance: public write" on public.smg_voice_performance
  for all using (true);

create index if not exists smg_voice_perf_period_idx
  on public.smg_voice_performance (period desc, report_type);

create index if not exists smg_voice_perf_loc_idx
  on public.smg_voice_performance (loc, period desc);

-- ── Labor Analysis Rows (daily per-store data for forecasting / DI calibration) ──
-- Each row = one store's daily metrics from a QSRSoft Labor Analysis report.
-- Persisted here so history accumulates across browser cache clears and devices.
-- unique(loc, report_date) deduplicates re-uploads automatically.
-- Run `select count(*), min(report_date), max(report_date) from labor_rows;`
-- to verify coverage after upload.
create table if not exists public.labor_rows (
  id          bigserial primary key,
  loc         text not null,          -- store number, e.g. '3708'
  report_date date not null,          -- calendar date of the labor row
  sales       float,                  -- net sales ($)
  labor_pct   float,                  -- crew labor % (decimal, e.g. 0.2142)
  tpph        float,                  -- transactions per person-hour
  ot_hrs      float,                  -- overtime hours
  ot_dollar   float,                  -- overtime dollars
  uploaded_at timestamptz default now(),
  unique(loc, report_date)
);

alter table public.labor_rows enable row level security;

create policy "labor_rows: public read" on public.labor_rows
  for select using (true);

create policy "labor_rows: public write" on public.labor_rows
  for all using (true);

create index if not exists labor_rows_loc_date_idx
  on public.labor_rows (loc, report_date desc);

create index if not exists labor_rows_date_idx
  on public.labor_rows (report_date desc);

-- ── FOB / Food Over Base rows ─────────────────────────────────────────────────
-- Per-period per-store food cost breakdown from QSRSoft Operations Report FOB sheet.
-- Primary key: (loc, date) — one row per store per reporting period.
create table if not exists public.fob_rows (
  loc                  text not null,
  date                 date not null,
  sales                float,
  base_food_pct        float,
  fob_pct              float,
  comp_waste           float,
  raw_waste            float,
  condiment            float,
  emp_meal             float,
  stat_var             float,
  unexplained          float,
  disc_coupon          float,
  pl_food_promo        float,
  pl_paper_promo       float,
  pl_paper_pct         float,
  pl_food_pct          float,
  labor_pct            float,
  tpph                 float,
  sales_vs_ly          float,
  ops_supplies         float,
  fob_dollar           float,
  fob_wo_unexp_pct     float,
  fob_wo_unexp_dollar  float,
  pl_food_cost_dollar  float,
  pl_paper_cost_dollar float,
  updated_at           timestamptz default now(),
  primary key (loc, date)
);

alter table public.fob_rows enable row level security;
create policy "fob_rows: public read"  on public.fob_rows for select using (true);
create policy "fob_rows: public write" on public.fob_rows for all    using (true);
create index if not exists fob_rows_date_idx on public.fob_rows (date desc);

-- ── Operations / Service rows ─────────────────────────────────────────────────
-- Daily per-store service metrics (OEPE, park, KVS, R2P) from Operations Report.
-- Primary key: (loc, date).
create table if not exists public.ops_rows (
  loc        text not null,
  date       date not null,
  oepe       float,
  park       float,
  kvst       float,
  kvsu       float,
  r2p        float,
  updated_at timestamptz default now(),
  primary key (loc, date)
);

alter table public.ops_rows enable row level security;
create policy "ops_rows: public read"  on public.ops_rows for select using (true);
create policy "ops_rows: public write" on public.ops_rows for all    using (true);
create index if not exists ops_rows_date_idx on public.ops_rows (date desc);

-- ── Controls rows ─────────────────────────────────────────────────────────────
-- Daily per-store cash/controls metrics from QSRSoft Operations Report Controls sheet.
-- Primary key: (loc, date).
create table if not exists public.ctrl_rows (
  loc              text not null,
  date             date not null,
  cash_os_pct      float,
  cash_os_amt      float,
  t_red_a_pct      float,
  t_red_a_cnt      float,
  t_red_b_pct      float,
  t_red_b_cnt      float,
  pos_over_cnt     float,
  pos_over_amt     float,
  ot_hrs           float,
  ot_dollar        float,
  labor_pct        float,
  act_vs_need      float,
  disc_pct         float,
  disc_amt         float,
  disc_cnt         float,
  promo_pct        float,
  promo_amt        float,
  promo_cnt        float,
  cash_ref_cnt     float,
  cash_ref_amt     float,
  cashless_ref_cnt float,
  cashless_ref_amt float,
  manual_ref_amt   float,
  drawer_opens     float,
  tpph             float,
  spph             float,
  avg_rate         float,
  emp_meal_amt     float,
  mgr_meal_amt     float,
  act_hrs          float,
  crew_hrs         float,
  salary_mgr_hrs   float,
  petty_amt        float,
  deposit_amt      float,
  updated_at       timestamptz default now(),
  primary key (loc, date)
);

alter table public.ctrl_rows enable row level security;
create policy "ctrl_rows: public read"  on public.ctrl_rows for select using (true);
create policy "ctrl_rows: public write" on public.ctrl_rows for all    using (true);
create index if not exists ctrl_rows_date_idx on public.ctrl_rows (date desc);

-- ── 3 Peaks rows (speed-of-service + daypart sales) ─────────────────────────
-- Daypart-level per-store data from the 3 Peaks report.
-- Service rows (is_svc=true): OEPE, KVS, park stats.
-- Sales rows (is_svc=false): net sales, GC, avg check, TPPH.
-- Primary key: (loc, date, slice, is_svc).
create table if not exists public.peaks_rows (
  loc           text    not null,
  date          date    not null,
  slice         text    not null,  -- daypart label ('Breakfast', 'Lunch', etc.)
  is_svc        boolean not null,  -- true = service row, false = sales row
  oepe          numeric,
  r2p           numeric,
  avg_ctp       numeric,
  kvst          numeric,
  kvsu          numeric,
  dt_gc         numeric,
  dt_order_time numeric,
  dt_line_time  numeric,
  dt_win1       numeric,
  dt_win2       numeric,
  park_cnt      numeric,
  park_pct      numeric,
  park_time     numeric,
  avg_dt_ttl    numeric,
  net_sales     numeric,
  prod_sales    numeric,
  gc            numeric,
  avg_check     numeric,
  tpph          numeric,
  spph          numeric,
  updated_at    timestamptz default now(),
  primary key (loc, date, slice, is_svc)
);
alter table public.peaks_rows enable row level security;
create policy "peaks_rows: public read"  on public.peaks_rows for select using (true);
create policy "peaks_rows: public write" on public.peaks_rows for all    using (true);
create index if not exists peaks_rows_date_idx on public.peaks_rows (date desc);

-- ── Register Audit rows ───────────────────────────────────────────────────────
-- Per-employee per-day register audit data from QSRSoft Register Audit report.
-- Primary key: (loc, date, emp).
create table if not exists public.audit_rows (
  loc             text not null,
  date            date not null,
  emp             text not null,
  drawer_sales    numeric,
  avg_check       numeric,
  drawer_opens    numeric,
  drawer_gc       numeric,
  emp_meal_disc   numeric,
  emp_meal_ch     numeric,
  manual_ref_amt  numeric,
  refund_cnt      numeric,
  refund_cash     numeric,
  refund_cashless numeric,
  mgr_meal_amt    numeric,
  mgr_meal_cnt    numeric,
  cash_os_dollar  numeric,
  cash_os_pct     numeric,
  pos_over_amt    numeric,
  pos_over_cnt    numeric,
  promo_amt       numeric,
  promo_cnt       numeric,
  promo_pct       numeric,
  t_red_b_cnt     numeric,
  t_red_b_pct     numeric,
  t_red_b_avg     numeric,
  t_red_b_dollar  numeric,
  t_red_a_cnt     numeric,
  t_red_a_pct     numeric,
  t_red_a_avg     numeric,
  t_red_a_dollar  numeric,
  updated_at      timestamptz default now(),
  primary key (loc, date, emp)
);
alter table public.audit_rows enable row level security;
create policy "audit_rows: public read"  on public.audit_rows for select using (true);
create policy "audit_rows: public write" on public.audit_rows for all    using (true);
create index if not exists audit_rows_date_idx on public.audit_rows (date desc);

-- ── Daily Activity Report rows ────────────────────────────────────────────────
-- Hourly per-store service/sales data from the Daily Activity Report (DAR).
-- Primary key: (loc, date, hour) — multiple rows per store per day.
create table if not exists public.dar_rows (
  loc        text not null,
  date       date not null,
  hour       text not null,       -- e.g. '10:00 AM'
  oepe       float,
  oepe_pk    float,
  r2p        float,
  ctp        float,
  sales      float,
  gc         float,
  check_avg  float,
  updated_at timestamptz default now(),
  primary key (loc, date, hour)
);

alter table public.dar_rows enable row level security;
create policy "dar_rows: public read"  on public.dar_rows for select using (true);
create policy "dar_rows: public write" on public.dar_rows for all    using (true);
create index if not exists dar_rows_date_idx on public.dar_rows (date desc);

-- ── Feature Requests ─────────────────────────────────────────────────────────
create table if not exists public.feature_requests (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  category         text default 'General',
  status           text default 'idea',         -- idea | planned | in-progress | completed | declined
  priority         text default 'medium',        -- low | medium | high
  submitted_by     text,
  dev_notes        text,
  completed_version text,
  votes            int default 0,
  is_seed          boolean default false,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

alter table public.feature_requests enable row level security;
create policy "feature_requests: public read"  on public.feature_requests for select using (true);
create policy "feature_requests: public write" on public.feature_requests for all    using (true);
create index if not exists feature_requests_status_idx on public.feature_requests (status);

-- ── Custom Signals (Signal Lab) ───────────────────────────────────────────────
create table if not exists public.custom_signals (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  x_metric     text not null,
  y_metric     text not null,
  granularity  text not null default 'daily',   -- 'daily' | 'monthly'
  scope        text not null default 'district', -- 'district' | store loc string
  status       text not null default 'active',   -- 'active' | 'promoted' | 'graveyard'
  promoted_to  text[] default '{}',              -- subset of: 'projections','morning_brief','sage'
  latest_r     numeric,
  latest_n     int,
  history      jsonb default '[]',               -- [{date,r,n}] last 50 computations
  note         text,
  votes        int default 0,
  x_condition  text not null default 'all',         -- 'all'|'high'|'low'|'positive'|'negative'
  x_reference  text not null default 'median',      -- 'median'|'average'
  y_condition  text not null default 'all',
  y_reference  text not null default 'median',
  created_by   uuid references auth.users(id),
  created_at   timestamptz default now()
);
-- Migration: add condition columns to existing table (safe to re-run)
alter table public.custom_signals add column if not exists x_condition text not null default 'all';
alter table public.custom_signals add column if not exists x_reference text not null default 'median';
alter table public.custom_signals add column if not exists y_condition text not null default 'all';
alter table public.custom_signals add column if not exists y_reference text not null default 'median';
alter table public.custom_signals enable row level security;
create policy "custom_signals: public read"  on public.custom_signals for select using (true);
create policy "custom_signals: public write" on public.custom_signals for all    using (true);

-- ── QSR eBOS Purchases (daily store purchase ledger) ─────────────────────────
-- Aggregated daily purchase totals from prod.ebos.qsrsoft.com store_ledger endpoint.
-- One row per store per date. Auto-synced via qsrsoft-ebos-pull.mjs GitHub Action.
-- Excludes Credits and inter-store Transfers — Purchase records only.
create table if not exists public.qsr_ebos_daily (
  loc              text    not null,  -- 7-digit padded NSN, e.g. '0003708'
  date             date    not null,
  food_purchases   numeric,           -- sum of food_sub for Purchase records
  paper_purchases  numeric,           -- sum of paper_sub
  ops_purchases    numeric,           -- sum of ops_sub (cleaning, supplies, smallwares)
  hm_purchases     numeric,           -- sum of happy_meal_sub
  other_purchases  numeric,           -- sum of other_sub
  primary key (loc, date)
);
alter table public.qsr_ebos_daily enable row level security;
create policy "qsr_ebos_daily: public read" on public.qsr_ebos_daily
  for select using (true);
create policy "qsr_ebos_daily: public write" on public.qsr_ebos_daily
  for all using (true);
create index if not exists qsr_ebos_daily_date_idx
  on public.qsr_ebos_daily (date desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- forecast_snapshots — per-day forecast vs actual accuracy record
-- Written by ForecastAccuracyPanel.runBacktest; queried by SAGE tool use.
-- PK: (loc, dt, source). source ∈ {ai, ly, blend, di, qsr}
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.forecast_snapshots (
  id              uuid    primary key default gen_random_uuid(),
  loc             text    not null,   -- numeric NSN, e.g. '3708' (no zero-padding)
  dt              date    not null,
  source          text    not null,   -- 'ai' | 'ly' | 'blend' | 'di' | 'qsr'
  forecast_sales  numeric,
  actual_sales    numeric,
  mape            numeric,            -- |actual - forecast| / actual * 100
  created_at      timestamptz default now(),
  unique(loc, dt, source)
);
alter table public.forecast_snapshots enable row level security;
create policy "forecast_snapshots: public read" on public.forecast_snapshots
  for select using (true);
create policy "forecast_snapshots: public write" on public.forecast_snapshots
  for all using (true);
create index if not exists forecast_snapshots_loc_dt_idx
  on public.forecast_snapshots (loc, dt desc);

-- qsr_field_definitions — field info-icon definitions scraped from QSRSoft UI
-- Written by scripts/qsrsoft-field-scraper.mjs; powers tooltips + SAGE context.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.qsr_field_definitions (
  id          uuid    primary key default gen_random_uuid(),
  page_key    text    not null,   -- 'dar' | 'fob' | 'pnl' | 'ebos' | 'cash'
  field_label text    not null,   -- display label from QSRSoft column header
  description text,               -- tooltip / info-icon text
  db_col      text,               -- optional: maps to our Supabase column name
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(page_key, field_label)
);
alter table public.qsr_field_definitions enable row level security;
create policy "qsr_field_definitions: public read" on public.qsr_field_definitions
  for select using (true);
create policy "qsr_field_definitions: service write" on public.qsr_field_definitions
  for all using (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- QSRSoft emailed reports — server-side parsed (cloud-first, cross-device)
-- Populated by scripts/qsrsoft-email-parse.mjs (GitHub Action): reads the CSVs
-- ingested to the qsr-reports storage bucket, parses with src/parsers, upserts
-- here. Previously these were parsed client-side on login into device-local IDB
-- only. One row per store per date. loc = numeric NSN as parsed (e.g. '3708').
-- ═══════════════════════════════════════════════════════════════════════════════

-- Sales Ledger — channel sales mix (DT, breakfast, McDelivery, MOP, kiosk, etc.)
create table if not exists public.sales_ledger_daily (
  loc                text not null,
  date               date not null,
  all_net_sales      numeric,
  all_net_sales_ly   numeric,
  sales_vs_ly_pct    numeric,
  gc                 numeric,
  avg_check          numeric,
  dt_sales           numeric,
  dt_gc              numeric,
  dt_avg_chk         numeric,
  dt_pct_total       numeric,
  bf_sales           numeric,
  bf_gc              numeric,
  bf_avg_chk         numeric,
  bf_pct_total       numeric,
  deliv_sales        numeric,
  deliv_gc           numeric,
  deliv_avg_chk      numeric,
  deliv_pct_total    numeric,
  mop_sales          numeric,
  mop_gc             numeric,
  mop_avg_chk        numeric,
  mop_pct_total      numeric,
  kiosk_sales        numeric,
  kiosk_gc           numeric,
  kiosk_avg_chk      numeric,
  kiosk_pct_total    numeric,
  fc_sales           numeric,
  fc_gc              numeric,
  fc_pct_total       numeric,
  in_store_sales     numeric,
  in_store_gc        numeric,
  in_store_pct_total numeric,
  eat_in_sales       numeric,
  eat_in_gc          numeric,
  updated_at         timestamptz default now(),
  primary key (loc, date)
);
alter table public.sales_ledger_daily enable row level security;
create policy "sales_ledger_daily: public read"  on public.sales_ledger_daily for select using (true);
create policy "sales_ledger_daily: public write" on public.sales_ledger_daily for all    using (true);
create index if not exists sales_ledger_daily_date_idx on public.sales_ledger_daily (date desc);

-- Daily Glimpse — controls + service scorecard (OEPE, KVS, cash O/S, T-reds, promo, daypart)
create table if not exists public.daily_glimpse_daily (
  loc                 text not null,
  date                date not null,
  all_net_sales       numeric,
  sales_vs_prior      numeric,
  sales_vs_prior_pct  numeric,
  dt_sales            numeric,
  dt_gc               numeric,
  dt_avg_check        numeric,
  gc                  numeric,
  avg_check           numeric,
  labor_pct           numeric,
  promo_amt           numeric,
  promo_pct           numeric,
  pos_over_cnt        numeric,
  pos_over_amt        numeric,
  cash_os             numeric,
  cash_os_pct         numeric,
  t_red_void_cnt      numeric,
  t_red_deleted_cnt   numeric,
  oepe                numeric,
  oepe_full           numeric,
  parked_pct          numeric,
  kvst                numeric,
  kvs_items           numeric,
  kvs_healthy         numeric,
  brk_car_cnt         numeric,
  lu_car_cnt          numeric,
  dn_car_cnt          numeric,
  digital_pct_sales   numeric,
  app_pct_sales       numeric,
  updated_at          timestamptz default now(),
  primary key (loc, date)
);
alter table public.daily_glimpse_daily enable row level security;
create policy "daily_glimpse_daily: public read"  on public.daily_glimpse_daily for select using (true);
create policy "daily_glimpse_daily: public write" on public.daily_glimpse_daily for all    using (true);
create index if not exists daily_glimpse_daily_date_idx on public.daily_glimpse_daily (date desc);

-- Cash Sheet — cash management + 3PO delivery platform breakdown
create table if not exists public.cash_sheet_daily (
  loc                text not null,
  date               date not null,
  all_net_sales      numeric,
  gc                 numeric,
  avg_check          numeric,
  doordash_sales     numeric,
  doordash_gc        numeric,
  ubereats_sales     numeric,
  ubereats_gc        numeric,
  grubhub_sales      numeric,
  grubhub_gc         numeric,
  total_3po_sales    numeric,
  total_3po_gc       numeric,
  mop_eat_in         numeric,
  mop_takeout        numeric,
  kiosk_eat_in       numeric,
  kiosk_takeout      numeric,
  cash_os            numeric,
  cash_os_pct        numeric,
  cash_ref_cnt       numeric,
  cash_ref_amt       numeric,
  cashless_ref_cnt   numeric,
  cashless_ref_amt   numeric,
  pos_over_cnt       numeric,
  pos_over_amt       numeric,
  t_red_void_cnt     numeric,
  t_red_deleted_cnt  numeric,
  updated_at         timestamptz default now(),
  primary key (loc, date)
);
alter table public.cash_sheet_daily enable row level security;
create policy "cash_sheet_daily: public read"  on public.cash_sheet_daily for select using (true);
create policy "cash_sheet_daily: public write" on public.cash_sheet_daily for all    using (true);
create index if not exists cash_sheet_daily_date_idx on public.cash_sheet_daily (date desc);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INITIAL SEED (run manually after schema)
-- ═══════════════════════════════════════════════════════════════════════════════
-- After creating your first user account, promote it to admin:
--   update public.profiles set role = 'admin' where email = 'your@email.com';
--
-- Emerald Arches supervisor setup example:
--   update public.profiles
--     set role = 'supervisor',
--         org  = 'emerald',
--         accessible_locs = array['6178','6838','10034','35242','37566','38609','43701']
--     where email = 'brad@example.com';

-- ── Labor Analysis: Store Config (Fixed-Labor-Hours worksheet) ──────────────────
-- Slowly-changing per-store config for the weekly FLH labor analysis. Seeded from
-- the MBI Labor Analysis worksheet, then maintained via the in-app editor.
-- hours_json = canonical 7-weekday model:
--   { "mon": {"open":0.2292,"close":0.9167,"hours":16.5}, ... "sun": {...} }
-- (open/close are Excel time fractions of a day; hours = resolved hours open.)
create table if not exists public.store_labor_config (
  loc              text primary key,          -- store number, e.g. '3708'
  is_24hr          boolean default false,      -- open 24h every day
  is_24_note       text,                       -- preserves nuance e.g. "24 HR W/E"
  maint_hours      float,                      -- Total Maintenance Hours/Wk
  maint_people     float,                      -- Number of Maint. People Scheduled
  maint_days_off   text,                        -- Primary Maint. Days Off
  prep_hours       float,                      -- Total Prep Hours/Wk
  lobby_hours      float,                      -- Total Lobby Hours/Wk
  hours_json       jsonb,                       -- 7-weekday open/close/hours
  updated_at       timestamptz default now(),
  updated_by       uuid references public.profiles(id)
);

alter table public.store_labor_config enable row level security;

create policy "store_labor_config: public read" on public.store_labor_config
  for select using (true);
create policy "store_labor_config: public write" on public.store_labor_config
  for all using (true);

-- ── Labor Analysis: Weekly LifeLenz Inputs (Band 1) ─────────────────────────────
-- One row per store per week — the LifeLenz-sourced labor projection inputs the
-- FLH report is built from. Interim source: parsed from the MBI worksheet upload;
-- future: scraped from LifeLenz live scheduling pages. Derived efficiency columns
-- (scheduled/target labor $, projected hours, variances, recommended fixed/floor)
-- are computed in src/engine/labor-analysis.js, NOT stored.
create table if not exists public.lifelenz_labor_week (
  loc                text not null,             -- store number, e.g. '3708'
  week_start         date not null,             -- Monday/period start, e.g. 2026-07-15
  week_end           date,                      -- period end, e.g. 2026-07-21
  month_tag          text,                      -- label from the sheet, e.g. 'June'
  proj_sales_month   float,                     -- Proj Sales for Month (optional)
  sales_fcst         float,                     -- Sales Forecast (week)
  labor_pct_actual   float,                     -- Labor % of Sales (actual scheduled)
  gc_fcst            float,                     -- GC Forecast
  hours_fcst         float,                     -- Hours Forecast
  hours_sched        float,                     -- Hours Scheduled
  sched_fixed_pct    float,                     -- Scheduled Fixed Labor %
  tpph               float,                     -- Scheduled TPMH (TPPH)
  rate               float,                     -- Current Avg Rate of Pay
  labor_target_org   float,                     -- Labor Target (Organization) %
  actual_hours       float,                     -- Actual Hours (optional)
  source             text default 'mbi_upload', -- 'mbi_upload' | 'lifelenz_scrape'
  updated_at         timestamptz default now(),
  updated_by         uuid references public.profiles(id),
  primary key (loc, week_start)
);

alter table public.lifelenz_labor_week enable row level security;

create policy "lifelenz_labor_week: public read" on public.lifelenz_labor_week
  for select using (true);
create policy "lifelenz_labor_week: public write" on public.lifelenz_labor_week
  for all using (true);

create index if not exists lifelenz_labor_week_week_idx
  on public.lifelenz_labor_week (week_start);

-- ── Smart Targets: per-store known-event adjustments ────────────────────────────
-- Lets the owner (a) drop one-off days from the learning history (holidays, remodels,
-- outages, freak weather) so anomalies don't bias the target, and (b) add a signed
-- known-event delta to the projected period total (e.g. +$8k for a local event next
-- month). Consumed by src/views/smart-targets.js via the engine's excludeDates /
-- eventDelta hooks. One row per (loc, metric_key).
create table if not exists public.smart_target_adjustments (
  loc            text not null,               -- store number, e.g. '3708'
  metric_key     text not null,               -- 'sales' | 'laborpct' | 'oepe' | …
  exclude_dates  jsonb default '[]'::jsonb,   -- ISO 'YYYY-MM-DD' one-off days to drop
  event_delta    float default 0,             -- signed units added to the projection (sales $)
  event_note     text,                        -- free-text reason (shown on hover)
  updated_at     timestamptz default now(),
  updated_by     uuid references public.profiles(id),
  primary key (loc, metric_key)
);

alter table public.smart_target_adjustments enable row level security;

create policy "smart_target_adjustments: public read" on public.smart_target_adjustments
  for select using (true);
create policy "smart_target_adjustments: public write" on public.smart_target_adjustments
  for all using (true);

-- ── SAGE: saved prompt library ──────────────────────────────────────────────────
-- Reusable SAGE prompts the owner saves for quick re-run (and, in Phase 2, for
-- scheduled auto-runs). Consumed by src/views/sage.js.
create table if not exists public.sage_prompts (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  prompt_text  text not null,
  tags         text,                        -- optional comma-separated labels
  created_by   text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.sage_prompts enable row level security;

create policy "sage_prompts: public read" on public.sage_prompts
  for select using (true);
create policy "sage_prompts: public write" on public.sage_prompts
  for all using (true);

-- Phase 2 scheduling columns (safe to run against an existing sage_prompts table).
alter table public.sage_prompts add column if not exists schedule_enabled boolean default false;
alter table public.sage_prompts add column if not exists schedule_hour    int;      -- UTC hour 0-23
alter table public.sage_prompts add column if not exists schedule_freq    text;     -- 'daily' | 'weekly'
alter table public.sage_prompts add column if not exists schedule_dow     int;      -- 0=Sun..6=Sat (weekly only)
alter table public.sage_prompts add column if not exists last_run_at      timestamptz;

-- ── SAGE: scheduled-prompt run history ──────────────────────────────────────────
-- One row per auto-run (scripts/sage-run.mjs). Feeds the At-A-Glance "Scheduled
-- Runs" tile and the prompt-library run log.
create table if not exists public.sage_prompt_runs (
  id          uuid primary key default gen_random_uuid(),
  prompt_id   uuid references public.sage_prompts(id) on delete cascade,
  title       text,                        -- snapshot of the prompt title at run time
  ran_at      timestamptz default now(),
  ok          boolean default true,
  result_md   text,                        -- SAGE's answer (markdown)
  error       text
);

alter table public.sage_prompt_runs enable row level security;

create policy "sage_prompt_runs: public read" on public.sage_prompt_runs
  for select using (true);
create policy "sage_prompt_runs: public write" on public.sage_prompt_runs
  for all using (true);

create index if not exists sage_prompt_runs_ran_idx on public.sage_prompt_runs (ran_at desc);

-- ── Crew Skills Matrix (LifeLenz People List, Simple CSV) ───────────────────────
-- One row per employee per ROSTER store (keyed by roster store + name) — a person
-- rostered at a shared/transition store shows under THAT store, not their home.
-- skills_json = the exploded
-- "SCHEDULE JOBS" map, e.g. {"DRIVE THRU":3,"BEVERAGE SPECIALIST":5,...} rated 1-5.
-- Rendered as the "Skill Levels" matrix. Interim source: parsed from the People
-- List Simple CSV upload; future: scraped from the LifeLenz people page per store.
create table if not exists public.employee_skills (
  loc              text not null,             -- home store number, e.g. '11657'
  employee         text not null,             -- employee full name
  home_store       text,                      -- store name, e.g. 'PURCELL'
  role             text,                      -- primary role, e.g. 'CREW PERSON'
  role_code        text,                      -- role code, e.g. '00650'
  is_primary_role  boolean default true,
  school_calendar  text,
  skills_json      jsonb,                     -- { job: rating(1-5) }
  source           text default 'lifelenz_people_csv',
  updated_at       timestamptz default now(),
  updated_by       uuid references public.profiles(id),
  primary key (loc, employee)
);

alter table public.employee_skills enable row level security;

create policy "employee_skills: public read"  on public.employee_skills for select using (true);
create policy "employee_skills: public write" on public.employee_skills for all using (true);
