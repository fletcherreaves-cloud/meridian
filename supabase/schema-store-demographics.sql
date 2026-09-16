-- ═══════════════════════════════════════════════════════════════════════════════
-- store_demographics — per-store Census-tract trade-area snapshot (Location Intel)
--
-- Backlog item (memory/backlog-open-2026-09-06.md §5: "Demographics per location
-- (Census/ACS API)"). Free, keyless US Census Bureau APIs — TIGERweb Geocoder
-- (lat/lon -> Census Tract) + ACS 5-Year Detailed Tables (tract -> population/
-- income/age/poverty/tenure). See src/engine/census-demographics.js for the fetch
-- logic and memory/project-location-demographics.md for the full design.
--
-- Tract-level, NOT a modeled drive-time trade area — Meridian has no GIS radius/
-- isochrone tooling, so this is honestly "the Census tract containing this store's
-- coordinates," a reasonable but coarser proxy. Refreshed manually/infrequently
-- (ACS 5-year estimates only update annually) via Location Intel's own "🔄 Refresh
-- Demographics" action, written by an authenticated client (not a pull script) —
-- same "manual, per-store, user-editable" shape as store_assessments/
-- store_vlh_config, same RLS pattern (schema-store-assessments.sql is the direct
-- template).
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.store_demographics (
  loc                        text        not null,   -- store number, unpadded (e.g. '3708') —
                                                       -- matches STORE_NAMES/STORE_COORDS convention
  tenant_id                  uuid        not null default '00000000-0000-0000-0000-000000000001',
  tract_geoid                text,                    -- 11-digit Census Tract GEOID (state+county+tract)
  county_fips                text,
  state_fips                 text,
  acs_vintage                integer,                 -- ACS 5-Year release year (e.g. 2023)
  population                 integer,                 -- B01003_001E, tract total population
  median_household_income    integer,                 -- B19013_001E, $ (inflation-adjusted)
  median_age                 numeric,                 -- B01002_001E, years
  poverty_rate               numeric,                 -- B17001_002E / B17001_001E, fraction 0-1
  owner_occupied_pct         numeric,                 -- B25003_002E / B25003_001E, fraction 0-1
  avg_household_size         numeric,                 -- B25010_001E
  updated_at                 timestamptz not null default now(),
  primary key (loc)
);

alter table public.store_demographics enable row level security;

-- Tenant isolation (same shape as store_assessments/sched_retention_marks/target_overrides) —
-- every authenticated tenant user can read/write; the UI's own perm gate is the intended access
-- control, not a second RLS-level restriction.
drop policy if exists store_demographics_tenant on public.store_demographics;
create policy store_demographics_tenant on public.store_demographics
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Per-location restriction, ANDed with the tenant policy above (RESTRICTIVE) — mirrors
-- store_assessments_loc / sched_retention_marks_loc verbatim (same InitPlan-friendly
-- (select ...) subselect form — do not unwrap it).
drop policy if exists store_demographics_loc on public.store_demographics;
create policy store_demographics_loc on public.store_demographics
  as restrictive for all to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

comment on table public.store_demographics is
  'Per-store Census-tract demographic snapshot (population/income/age/poverty/tenure) from the free/keyless Census Geocoder + ACS 5-Year API. Tract-level, not a modeled drive-time trade area. Written by src/features/location-intel.js via an authenticated client (manual refresh, not a scheduled pull) — RLS is the access control, matching store_assessments.';
