-- ============================================================================
-- Pending OPTIONAL tables — copy/paste into the Supabase SQL editor and Run.
-- These are the leftover blocks from schema.sql that were never confirmed-run.
-- Each is idempotent (create table if not exists / drop policy if exists), so
-- running this whole file is safe and repeatable. Every one FAILS SOFT in the app
-- (the feature just won't persist until its table exists) — nothing here is urgent.
-- Expected result: "Success. No rows returned."
--
--   forecast_snapshots        — Forecast Accuracy backtest → SAGE query tool
--   smart_target_adjustments  — Smart Targets per-store exclude-dates / event deltas
--   sage_prompts (+ sched)    — SAGE saved-prompt library + Phase-2 schedule columns
--   sage_prompt_runs          — SAGE scheduled-run history (At-A-Glance tile)
-- ============================================================================

-- ── forecast_snapshots ──────────────────────────────────────────────────────
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
drop policy if exists "forecast_snapshots: public read"  on public.forecast_snapshots;
drop policy if exists "forecast_snapshots: public write" on public.forecast_snapshots;
create policy "forecast_snapshots: public read"  on public.forecast_snapshots for select using (true);
create policy "forecast_snapshots: public write" on public.forecast_snapshots for all    using (true);
create index if not exists forecast_snapshots_loc_dt_idx on public.forecast_snapshots (loc, dt desc);

-- ── smart_target_adjustments ────────────────────────────────────────────────
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
drop policy if exists "smart_target_adjustments: public read"  on public.smart_target_adjustments;
drop policy if exists "smart_target_adjustments: public write" on public.smart_target_adjustments;
create policy "smart_target_adjustments: public read"  on public.smart_target_adjustments for select using (true);
create policy "smart_target_adjustments: public write" on public.smart_target_adjustments for all    using (true);

-- ── sage_prompts (saved-prompt library) + Phase-2 schedule columns ──────────
create table if not exists public.sage_prompts (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  prompt_text  text not null,
  tags         text,
  created_by   text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
alter table public.sage_prompts enable row level security;
drop policy if exists "sage_prompts: public read"  on public.sage_prompts;
drop policy if exists "sage_prompts: public write" on public.sage_prompts;
create policy "sage_prompts: public read"  on public.sage_prompts for select using (true);
create policy "sage_prompts: public write" on public.sage_prompts for all    using (true);
alter table public.sage_prompts add column if not exists schedule_enabled boolean default false;
alter table public.sage_prompts add column if not exists schedule_hour    int;
alter table public.sage_prompts add column if not exists schedule_freq    text;
alter table public.sage_prompts add column if not exists schedule_dow     int;
alter table public.sage_prompts add column if not exists last_run_at      timestamptz;

-- ── sage_prompt_runs (scheduled-run history) ────────────────────────────────
create table if not exists public.sage_prompt_runs (
  id          uuid primary key default gen_random_uuid(),
  prompt_id   uuid references public.sage_prompts(id) on delete cascade,
  title       text,
  ran_at      timestamptz default now(),
  ok          boolean default true,
  result_md   text,
  error       text
);
alter table public.sage_prompt_runs enable row level security;
drop policy if exists "sage_prompt_runs: public read"  on public.sage_prompt_runs;
drop policy if exists "sage_prompt_runs: public write" on public.sage_prompt_runs;
create policy "sage_prompt_runs: public read"  on public.sage_prompt_runs for select using (true);
create policy "sage_prompt_runs: public write" on public.sage_prompt_runs for all    using (true);
create index if not exists sage_prompt_runs_ran_idx on public.sage_prompt_runs (ran_at desc);
