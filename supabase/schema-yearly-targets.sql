-- ═══════════════════════════════════════════════════════════════════════════════
-- YEARLY TARGETS (dispatch #107)
-- Per-store annual target workbook (2026_Restaurant_Targets__Updated__OK__FL.xlsx-
-- style upload), parsed by parseYearlyTargets() (src/parsers/index.js). Mirrors
-- monthly_targets' pattern (supabase/schema.sql ~monthly_targets) one tier up: PK is
-- (loc, year) instead of (loc, year, month) since this workbook carries one row per
-- store per YEAR, no month dimension.
--
-- Precedence (already implemented, see review-engine.js mergedTargetsForLoc):
--   DEFAULT_TARGETS < yearly_targets (this table, ds.targets) < monthly_targets
--   (ds.monthlyTargets) — monthly always wins when both are present.
--
-- Categories captured (workbook columns → parser fields, this table's columns):
--   Service & Ops : OEPE PACE / Park % / KVS PACE+Usage / FC R2P PACE
--   CSAT          : Voice OSAT PACE / Execute-As-Designed / Overall Sat B2B / 1-800 Contacts
--   Digital       : App % of Sales / App GC-R-D / McDelivery GC-R-D / Wait Time / Star Rating
--   People        : Crew/Shift-Leader/Manager/Total-Headcount targets + Shift-Leader TTM,
--                    0-90 Crew, and YTD Crew turnover
--   Labor & FOB   : TPPH / Labor % / Food-Over-Base %
--
-- `source` distinguishes a bulk workbook upload from a manual per-store override typed
-- into the Planning > Yearly panel (dispatch #107 Part 3) — mirrors event_impact's
-- measured/override pattern. An override row for a field always wins for its own
-- (loc, year) because it's upserted over the same primary key; there is no separate
-- override table, so "override" here just documents provenance for the UI badge, not
-- a second precedence tier.
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.yearly_targets (
  loc               text not null,           -- store number, e.g. '3708'
  year              integer not null,
  -- Service & Ops
  oepe_pace         float,                   -- OEPE PACE (s)
  park_pct          float,                   -- Park %
  kvs_pace          float,                   -- KVS PACE (s)
  kvs_usage_pct     float,                   -- KVS Healthy Use 2nd Side %
  r2p_pace          float,                   -- FC R2P PACE (s)
  -- CSAT
  voice_osat_pct    float,                   -- Voice OSAT PACE (5★, higher=better)
  osat_b2b_pct      float,                   -- Overall Satisfaction B2B (1★, lower=better)
  voice_ead_pct     float,                   -- Voice Execute As Designed %
  contacts_1800     float,                   -- 1-800 Contacts (count)
  -- Digital
  dig_app_pct       float,                   -- Digital App % of Sales
  dig_app_gcrd      float,                   -- Digital App (GC/R/D)
  mcd_gcrd          float,                   -- McDelivery (GC/R/D)
  mcd_wait_time     float,                   -- McDelivery Restaurant Wait Time
  mcd_star_rating   float,                   -- McDelivery Star Rating
  -- People
  crew_staffing_target   float,              -- Crew Staffing Target
  shift_leader_target    float,              -- Shift Leader Target
  manager_target         float,              -- GM/DM/Swing Mgr Target
  headcount_target       float,              -- Total Headcount Target (All Hourly)
  turnover_shift_leader_pct float,           -- TTM Shift Leader T/O
  turnover_crew_090_pct     float,           -- 0-90 Day Crew T/O
  turnover_crew_ytd_pct     float,           -- YTD Crew T/O
  -- Labor & FOB (same field names/precedence tier as monthly_targets' tpph_target/fob_target_pct —
  -- monthly overrides these when both are present)
  tpph_target       float,                   -- TPPH
  labor_pct         float,                   -- Labor %
  fob_target_pct    float,                   -- Food Over Base %
  -- Provenance + audit
  source            text default 'upload',   -- 'upload' (bulk workbook) | 'override' (manual, Planning > Yearly)
  tenant_id         uuid not null default '00000000-0000-0000-0000-000000000001',
  updated_at        timestamptz default now(),
  updated_by        uuid references public.profiles(id),
  primary key (loc, year)
);

alter table public.yearly_targets enable row level security;

drop policy if exists yearly_targets_tenant on public.yearly_targets;
create policy yearly_targets_tenant on public.yearly_targets
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Per-location restriction, ANDed with the tenant policy above (RESTRICTIVE) — mirrors
-- supabase/schema-news-mentions.sql / schema-rls-phase2-loc.sql. The (select ...) subselect
-- form is load-bearing (InitPlan, evaluated once per statement not once per row) — do not
-- unwrap it.
drop policy if exists yearly_targets_loc on public.yearly_targets;
create policy yearly_targets_loc on public.yearly_targets
  as restrictive for all to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

create index if not exists yearly_targets_year_idx
  on public.yearly_targets (year);

comment on table public.yearly_targets is
  'Per-store annual target workbook (parseYearlyTargets, src/parsers/index.js), persisted so it survives across sessions/devices without re-uploading. Loaded into ds.targets (most recent year) + ds.allYearlyTargets (by year) — see src/lib/supabase.js loadYearlyTargets/loadAllYearlyTargets and App.js startup hydration. Monthly targets (monthly_targets table) supersede these when both are present for the same field — see review-engine.js mergedTargetsForLoc.';
