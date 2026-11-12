-- ── hme_dt_daily — HME Cloud drive-thru timer/DT timing data, all stores ──
-- Source: HME Cloud's `portal-service.hmecloud.com` dashboard REST API (two-step REST login,
-- no Playwright needed -- confirmed live 2026-11-12). This table's pull script is
-- scripts/hme-cloud-pull.mjs. See memory/finding-hme-squadle-integration-2026-11-06.md for the
-- full research history.
--
-- IMPORTANT scope note (confirmed live, not assumed): HME's own `getDashboardData` endpoint
-- only ever returns the CURRENT DAY's accumulated rollup -- there is no real historical-date
-- or hour-level granularity reachable via REST (that only exists inside HME's own embedded
-- Power BI "Trends Dashboard", explicitly not pursued -- fragile, short-lived embed token, per
-- the finding doc's own recommendation). So this table accumulates its own history: the pull
-- runs intraday (same cadence as the other intraday pulls, e.g. Operations Report/DAR) and
-- upserts the CURRENT business day's rolling snapshot by (loc, dt) -- each run overwrites the
-- same day's row with the latest accumulated total, and the row is "final" once the next
-- business day's pull has started. Never clobbers a past day -- (loc, dt) is the key, not a
-- single "latest" slot.
create table if not exists public.hme_dt_daily (
  tenant_id    uuid        not null default '00000000-0000-0000-0000-000000000001',
  loc          text        not null,   -- store number, 7-char zero-padded (matches STORE_NAMES convention)
  dt           date        not null,   -- business day this rollup covers (pull-time's own business date)
  store_name   text,                   -- HME's own Store_Name, for diagnostics only -- never the display name of record
  store_rank   integer,                -- HME's own district-wide speed rank for the day
  cars         integer,                -- total cars through DT so far this business day
  avg_seconds  integer,                -- average DT time in seconds so far this business day
  goal_a       integer,                -- HME's own speed-tier thresholds (seconds) -- store-specific, not uniform district-wide
  goal_b       integer,
  goal_c       integer,
  goal_d       integer,
  pct          numeric,                -- HME's own goal-achievement % for the day
  pulled_at    timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (loc, dt)
);

create index if not exists hme_dt_daily_dt_idx on public.hme_dt_daily (dt desc);

alter table public.hme_dt_daily enable row level security;

-- Same two-layer pattern as every other tenant-scoped stream table (tenant match +
-- accessible_locs loc-scoping via the public.my_locs() RESTRICTIVE predicate).
drop policy if exists "hme_dt_daily: tenant read" on public.hme_dt_daily;
create policy "hme_dt_daily: tenant read" on public.hme_dt_daily
  for select using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

drop policy if exists "hme_dt_daily: loc scope" on public.hme_dt_daily;
create policy "hme_dt_daily: loc scope" on public.hme_dt_daily
  as restrictive for all to authenticated
  using (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  )
  with check (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  );
-- No insert/update/delete policy for any role -- every write comes from
-- scripts/hme-cloud-pull.mjs's service-role key, which bypasses RLS entirely.

comment on table public.hme_dt_daily is
  'HME Cloud drive-thru timer rollup (cars/avg seconds/goal%), one row per store per business day, intraday-pulled and upserted as the day accumulates. Written only by scripts/hme-cloud-pull.mjs (service role); read gated by ordinary tenant + accessible_locs RLS. Phase 1 (task #105) -- not yet surfaced in any UI panel or metric-source chain; see memory/finding-hme-squadle-integration-2026-11-06.md for the deferred Phase 2 plan (likely extends dt-speedofservice.js rather than duplicating it).';
