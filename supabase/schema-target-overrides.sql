-- ═══════════════════════════════════════════════════════════════════════════════
-- TARGET OVERRIDES (dispatch #132 item 3)
-- Company/State/Patch/Store scoped override cascade for Performance Review target fields
-- that either have no source in the yearly/monthly target workbooks at all (Total Profit,
-- Complaint Contacts, Shift Certified Managers) or that the owner wants to adjust without a
-- new Excel upload. See src/engine/target-overrides.js's file header for the full precedence
-- + architecture reasoning (a NEW overlay table, not a mutation of yearly_targets/
-- monthly_targets rows — those are one-row-per-(loc,year[,month]) workbook snapshots with no
-- slot for a company/state/patch-scoped value).
--
-- Precedence (highest wins), applied in src/engine/review-engine.js's mergedTargetsForLoc /
-- mergedTargetsForLocMonth via applyTargetOverrides():
--   STORE override > PATCH override > STATE override > COMPANY override
--     > monthly_targets > yearly_targets > DEFAULT_TARGETS (src/constants.js)
--
-- scope_id meaning by scope_type:
--   company -> always 'ALL' (sentinel, not NULL -- keeps the unique index below simple/reliable)
--   state   -> INV_ORG_COORDS[loc].state, e.g. 'OK' / 'FL'
--   patch   -> INV_ORG_COORDS[loc].sup (the supervisor/patch grouping — same field
--              LocationSelector's buildLocationHierarchy() groups stores by, PanelControls.js)
--   store   -> the store's loc, e.g. '3708'
--
-- `field` is a review-engine.js target-field key (tMcdWait, tDigAppGCRD, tHeadcount, ... —
-- see src/engine/target-overrides.js's TARGET_OVERRIDE_FIELDS for the full, current list; two
-- of those keys, tTotalProfitTarget and tComplaintsTarget, exist ONLY as override fields — no
-- workbook parser ever produces them).
--
-- Deliberately NOT year-scoped in this first pass (unlike yearly_targets/monthly_targets) — an
-- override applies until changed or removed. Add a `year` column + widen the unique index below
-- if per-year overrides are ever needed; nothing in src/engine/target-overrides.js assumes a
-- single-year table, but v1 does not need the complexity.
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.target_overrides (
  id          uuid primary key default gen_random_uuid(),
  scope_type  text not null check (scope_type in ('company','state','patch','store')),
  scope_id    text not null,             -- 'ALL' for company; state/patch/store id otherwise
  field       text not null,             -- e.g. 'tMcdWait', 'tTotalProfitTarget'
  value       double precision not null,
  tenant_id   uuid not null default '00000000-0000-0000-0000-000000000001',
  updated_at  timestamptz default now(),
  updated_by  uuid references public.profiles(id),
  unique (tenant_id, scope_type, scope_id, field)
);

alter table public.target_overrides enable row level security;

-- Tenant isolation only (no per-loc RESTRICTIVE policy like yearly_targets/monthly_targets):
-- a company/state/patch-scoped row has no single loc to check my_locs() against, and a
-- store-scoped row's loc is still meaningful to filter, but reading a PATCH's override
-- necessarily means reading a row that isn't keyed to any one store the caller might be
-- restricted to. Writing is gated in the UI (Targets editor, perm 'reviews.customize' —
-- admin-only by default) rather than in RLS; every authenticated tenant user can READ every
-- override (needed so a GM's own review correctly reflects a district-wide company/state/patch
-- override that was never set at their specific store), same tenant-only pattern already used
-- for org_config.
drop policy if exists target_overrides_tenant on public.target_overrides;
create policy target_overrides_tenant on public.target_overrides
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

create index if not exists target_overrides_field_idx on public.target_overrides (field);

comment on table public.target_overrides is
  'Company/State/Patch/Store scoped target overrides for Performance Review metric fields with no (or an adjustable) workbook source. Resolved by src/engine/target-overrides.js (applyTargetOverrides), layered on top of yearly_targets/monthly_targets/DEFAULT_TARGETS in review-engine.js mergedTargetsForLoc/mergedTargetsForLocMonth. See that file for the full precedence + architecture reasoning (dispatch #132).';
