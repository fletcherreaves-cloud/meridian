-- ── lifelenz_forecast_captures — immutable, lead-time-tagged snapshots of LifeLenz's OWN forecast ──
--
-- Built 2026-09-11: the owner asked to compare Meridian's forecast against LifeLenz's on a
-- genuinely apples-to-apples footing (same lead time), after the "MBI vs LifeLenz Accuracy" tab
-- showed LifeLenz winning ~57% of days. The reason that comparison isn't apples-to-apples:
-- `lifelenz_schedule` upserts on (loc, date) -- every daily pull OVERWRITES fcst_sales for a
-- given target date, so by the time a date has passed, the stored fcst_sales is whatever
-- LifeLenz's own system last reported for it (likely very close to day-of, since LifeLenz's own
-- support bot confirms it "continuously updates" forecasts as the date approaches). Meridian's
-- side of that same comparison (forecast_snapshots' 'simple' source) is a leak-free TRAILING
-- model computed retrospectively, which is a different kind of freshness than "what would a
-- human have seen when they had to lock the schedule."
--
-- This table fixes that going forward by never overwriting: scripts/lifelenz-pull.mjs writes
-- ONE row per (loc, target_date, captured_date) on every daily run, for every date still in the
-- future as of that run -- the exact fcst_sales LifeLenz reported for that target date, AS OF
-- that specific day. Over a few weeks this builds a full lead-time curve per (loc, target_date):
-- what did LifeLenz predict 30 days out, 20 days out, ... 1 day out, for the SAME day. The
-- owner's specific ask -- LifeLenz's forecast as captured the Thursday before the work week it
-- describes (6 days out, matching when a real schedule gets locked) -- is just one slice of that
-- curve (captured_date is a Thursday AND target_date - captured_date = 6), not a special case.
--
-- Cannot be backfilled: lifelenz_schedule's upsert-on-write already destroyed any earlier lead-
-- time state for every past date. This table only has data from whenever it starts being written.
create table if not exists public.lifelenz_forecast_captures (
  loc              text        not null,   -- store number, unpadded (matches forecast_snapshots' own convention)
  target_date      date        not null,   -- the day being forecast
  captured_date    date        not null,   -- the day this snapshot was taken (today, at write time)
  lead_days        integer     not null,   -- target_date - captured_date, denormalized for cheap filtering
  tenant_id        uuid        not null default '00000000-0000-0000-0000-000000000001',
  fcst_sales       numeric,
  adj_fcst_sales   numeric,
  created_at       timestamptz not null default now(),
  primary key (loc, target_date, captured_date)
);

-- The Thursday-6-days-out slice (and any other fixed-lead-time slice) is the expected query
-- shape, not a scan over every capture of a target date.
create index if not exists lifelenz_forecast_captures_target_lead_idx
  on public.lifelenz_forecast_captures (loc, target_date, lead_days);

alter table public.lifelenz_forecast_captures enable row level security;

drop policy if exists "lifelenz_forecast_captures: tenant read" on public.lifelenz_forecast_captures;
create policy "lifelenz_forecast_captures: tenant read" on public.lifelenz_forecast_captures
  for select using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

drop policy if exists "lifelenz_forecast_captures: loc scope" on public.lifelenz_forecast_captures;
create policy "lifelenz_forecast_captures: loc scope" on public.lifelenz_forecast_captures
  as restrictive for all to authenticated
  using (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  )
  with check (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  );
-- No insert/update/delete policy for any role -- every write comes from scripts/lifelenz-
-- pull.mjs's service-role key, which bypasses RLS entirely. Same pattern as
-- lifelenz_shift_assignments/lifelenz_schedule.

comment on table public.lifelenz_forecast_captures is
  'Immutable, lead-time-tagged snapshots of LifeLenz''s own forecast (fcst_sales), one row per (loc, target_date, captured_date), written daily by scripts/lifelenz-pull.mjs for every date still in the future as of that run. Unlike lifelenz_schedule (which upserts and only ever shows the LATEST forecast), this never overwrites -- it exists specifically to let a genuinely lead-time-matched MBI-vs-LifeLenz accuracy comparison be built once enough history accumulates. See scripts/lifelenz-pull.mjs''s captureForecastLeadTime() and memory/project-lifelenz-leadtime-capture-2026-09-11.md.';
