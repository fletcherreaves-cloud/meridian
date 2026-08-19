-- ============================================================================
-- forecast_week_cache — precomputed weekly sales forecast, one row per (loc, dt)
-- ============================================================================
-- Dispatch22, Workstream A (memory/plan-normalization-2026-08-17.md): moves the
-- 189 forecastDay() calls (27 stores x 7 days) that at-a-glance.js's weekProjections
-- useMemo made on every render — 76,503 ms of 82,221 ms measured render time (93%),
-- closing a modal cost up to 4.3s as a direct result — off the render path. Written
-- daily by scripts/forecast-week-precompute.mjs (forecastDay() ITSELF is unchanged —
-- this job is a new caller, not a new algorithm). The client reads this table and
-- falls back to live forecastDay() calls only when the cache is missing/incomplete
-- for a store's current week (see src/views/at-a-glance.js weekProjections).
--
-- Deliberately its OWN table, not an extension of forecast_snapshots
-- (supabase/schema.sql:917) — considered and rejected. forecast_snapshots is a
-- backtest/accuracy record (PK loc,dt,SOURCE; written by ForecastAccuracyPanel's
-- runBacktest and read by SAGE's query_forecast_snapshots tool) with no lastYear
-- column and a different grain (one row per model-source per day, not the weekly
-- rollup shape weekProjections builds). Extending it risks two different things
-- writing under one schema and SAGE's tool seeing rows it wasn't built to expect —
-- not disturbing an existing, working reader was the deciding factor.
--
-- Only carries the THREE fields at-a-glance.js's weekProjections actually consumes
-- from forecastDay()'s return object (forecast, actual, lyAdj) — every other field
-- forecastDay returns (oepe/tpph/labor/t2/t4/t6/varPct/pass/goal/...) is discarded
-- by the caller today and is not cached. `actual`/`ly` here are the RAW forecastDay
-- values (from ds.laborRows/qsrActSummaryRows at compute time) — the client's own
-- post-fetch patch (folding in ds.qsrActSummaryRows for same-day freshness) still
-- runs client-side on top of whatever this table returns, unchanged from today.
create table if not exists public.forecast_week_cache (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  loc          text not null,          -- numeric NSN, e.g. '3708' (no zero-padding)
  dt           date not null,
  forecast     numeric,
  actual       numeric,
  ly           numeric,                -- forecastDay's own lyAdj field, not a "true" LY sales figure for every model branch (see PR body / header comment in the precompute script)
  model_used   text,                   -- forecastDay's assigned weekly model, e.g. 'ae' — lets a future reader tell which formula produced a row without re-deriving it
  computed_at  timestamptz not null default now(),
  unique(tenant_id, loc, dt)
);

alter table public.forecast_week_cache enable row level security;

drop policy if exists "forecast_week_cache: tenant read" on public.forecast_week_cache;
create policy "forecast_week_cache: tenant read" on public.forecast_week_cache
  for select using (tenant_id = public.current_tenant_id());

-- Written only by the service-role precompute job (scripts/forecast-week-precompute.mjs),
-- same as every other scheduled-pull table — no authenticated-user write path needed.
drop policy if exists "forecast_week_cache: service write" on public.forecast_week_cache;
create policy "forecast_week_cache: service write" on public.forecast_week_cache
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop trigger if exists set_tenant_id_forecast_week_cache on public.forecast_week_cache;
create trigger set_tenant_id_forecast_week_cache
  before insert on public.forecast_week_cache
  for each row execute function public.set_tenant_id();

create index if not exists forecast_week_cache_loc_dt_idx
  on public.forecast_week_cache (loc, dt);
