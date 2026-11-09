-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLING FORECAST SNAPSHOTS (owner-directed 2026-11-09 — "revisit our live
-- projections experiment"). Generalizes the proven lifelenz_forecast_captures
-- pattern (memory/project-lifelenz-leadtime-capture-2026-09-11.md, live since
-- 2026-09-11, ~2 months of real accumulated history as of this writing) to
-- Meridian's own forecast engine, v1 scoped to daily + weekly (owner's own call,
-- expand to monthly/yearly/hourly later once this proves out).
--
-- forecast_rolling_captures: APPEND-ONLY. One row per (loc, period_type, target_period,
-- captured_date) -- a new row every day a capture job runs, NEVER overwritten.
-- The freshest row for a given target_period IS the live forecast; the full set
-- is a complete revision history for free, with zero extra mechanism.
--
-- forecast_commits: a THIN POINTER, not a second copy of the data. "Committing"
-- a period does not freeze a number -- it names which forecast_rolling_captures row
-- (by captured_date) is the official plan. Re-committing just moves the pointer;
-- old commits aren't deleted, they fall out of being "current" (see history
-- table below). This deliberately replaces the OLD Week/Month lock mechanism's
-- semantics (a single overwritten JSON blob in user_settings.locked_projections)
-- with something that can't drift out of sync with the real history, per the
-- owner's own framing: "does the lock even need to exist... let's make it make
-- sense and not over cluttered." The UI-facing rename is "Commit" not "Lock" --
-- see memory/project-rolling-forecast-snapshots-2026-11-09.md for the full design
-- and the mockup this was built from.
--
-- forecast_commit_history: append-only log of every commit/re-commit, so "what
-- did we commit to, and when did that change" is itself never lost -- the same
-- principle applied one level up. Not required for v1's drift-alert math (which
-- only needs the CURRENT commit), but cheap to keep from day one rather than
-- bolt on later once the owner asks "what did we commit to last time."
--
-- Same tenant_id + RLS shape as every other small operational table in this
-- repo (closest analogs: new_store_launch_plan, lifelenz_forecast_captures).
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.forecast_rolling_captures (
  id                uuid primary key default gen_random_uuid(),
  loc               text not null,                 -- unpadded store number, matching DEFAULT_TARGETS/STORE_NAMES convention
  period_type       text not null check (period_type in ('daily','weekly')),
  target_period     date not null,                  -- the day being forecast, or the Monday of the week being forecast
  captured_date     date not null,                  -- the day this snapshot was computed (today, when the capture job ran)
  lead_days         int not null,                   -- target_period - captured_date, denormalized for fast lead-time queries (mirrors lifelenz_forecast_captures)
  forecast_value    numeric not null,
  model_used        text,                           -- forecastDay()'s own modelUsed field ('ae'|'ewma'|'simple'|'dow'|'di'|'launch-plan'|...), for provenance
  tenant_id         uuid not null default '00000000-0000-0000-0000-000000000001',
  created_at        timestamptz default now(),
  unique (tenant_id, loc, period_type, target_period, captured_date)
);

alter table public.forecast_rolling_captures enable row level security;

drop policy if exists forecast_rolling_captures_tenant on public.forecast_rolling_captures;
create policy forecast_rolling_captures_tenant on public.forecast_rolling_captures
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

create index if not exists forecast_rolling_captures_loc_period_idx
  on public.forecast_rolling_captures (loc, period_type, target_period, captured_date desc);

comment on table public.forecast_rolling_captures is
  'Append-only daily capture of the forecast engine''s own output, never overwritten -- generalizes lifelenz_forecast_captures'' proven pattern to Meridian''s own models. The freshest row per (loc, period_type, target_period) is the live forecast; the full set is a complete revision history.';

-- ───────────────────────────────────────────────────────────────────────────────

create table if not exists public.forecast_commits (
  id                      uuid primary key default gen_random_uuid(),
  loc                     text not null,
  period_type             text not null check (period_type in ('daily','weekly')),
  target_period           date not null,
  committed_captured_date date not null,             -- points at forecast_rolling_captures.captured_date -- the row being named "the plan"
  committed_by            text,                       -- user email/id, same convention as other owner-attributed actions in this repo
  committed_at            timestamptz default now(),
  tenant_id               uuid not null default '00000000-0000-0000-0000-000000000001',
  unique (tenant_id, loc, period_type, target_period)  -- exactly one active commit per period -- re-committing UPSERTs this row, never duplicates
);

alter table public.forecast_commits enable row level security;

drop policy if exists forecast_commits_tenant on public.forecast_commits;
create policy forecast_commits_tenant on public.forecast_commits
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

create index if not exists forecast_commits_loc_period_idx
  on public.forecast_commits (loc, period_type, target_period);

comment on table public.forecast_commits is
  'A pointer, not a freeze -- names which forecast_rolling_captures row (by captured_date) is the officially committed plan for a period. Re-committing moves the pointer; see forecast_commit_history for the log of every move.';

-- ───────────────────────────────────────────────────────────────────────────────

create table if not exists public.forecast_commit_history (
  id                      uuid primary key default gen_random_uuid(),
  loc                     text not null,
  period_type             text not null check (period_type in ('daily','weekly')),
  target_period           date not null,
  committed_captured_date date not null,
  committed_value         numeric,                    -- the forecast_value at commit time, denormalized so history reads without a join once snapshots roll off any future retention window
  committed_by            text,
  committed_at            timestamptz default now(),
  tenant_id               uuid not null default '00000000-0000-0000-0000-000000000001'
);

alter table public.forecast_commit_history enable row level security;

drop policy if exists forecast_commit_history_tenant on public.forecast_commit_history;
create policy forecast_commit_history_tenant on public.forecast_commit_history
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

create index if not exists forecast_commit_history_loc_period_idx
  on public.forecast_commit_history (loc, period_type, target_period, committed_at desc);

comment on table public.forecast_commit_history is
  'Append-only log of every commit/re-commit -- "what did we commit to, and when did that change" is never lost, same principle as forecast_rolling_captures applied one level up.';
