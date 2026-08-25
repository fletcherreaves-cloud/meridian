-- ═══════════════════════════════════════════════════════════════════════════════
-- DISPATCH #141 — sched_retention_marks: cloud-persisted "workshop week" marks
--
-- ⚠️ OWNER ACTION REQUIRED: run this against the live Supabase project (SQL editor) for the
-- Patch/Operator/Org/State retention rollup (dispatch #141) to work correctly. The application
-- code (src/lib/supabase.js's loadRetentionMarks/saveRetentionMark/deleteRetentionMark) already
-- calls this table and degrades gracefully (logs a clear console warning, returns an empty/no-op
-- result) if this migration hasn't run yet — same pattern dispatch #142 used for
-- yearly_targets.prod_sales/crew_labor_pct — so nothing crashes either way, but until this runs:
--   - src/views/schedule-retention.js's per-store report falls back to its pre-existing
--     localStorage-only mark (unchanged behavior, still works on the SAME device/browser).
--   - The new Retention Rollup tab (Scheduling hub) will show every store as "no marked workshop
--     week" (excluded), since it reads ONLY the cloud table — see that file's dispatch #141
--     comment for why: a rollup that partially trusts localStorage would silently under-count
--     marks made from a different device, exactly the bug this migration exists to fix.
--
-- ROOT CAUSE (dispatch #141 brief, memory/dispatch-141.md, confirmed by reading the code):
--   schedule-retention.js's workshop-week mark was `localStorage.getItem('mf_sched_retention_
--   mark')` — per-browser, per-device, never synced to Supabase. A cross-store rollup computed
--   in one session had no way to see which week was marked for a store from a DIFFERENT device/
--   session, so "who is driving this" (the owner's ask) was unanswerable without this table.
--
-- One mark per store (the report only ever supports ONE workshop week per location at a time —
-- schedule-retention.js's markWeek() replaces, never appends), so `loc` alone is the primary key,
-- matching every other single-tenant table in this schema (see schema-yearly-targets.sql's
-- `primary key (loc, year)` — tenant_id is a column with a fixed default, not part of the key).
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.sched_retention_marks (
  loc         text not null primary key,   -- store number, unpadded (e.g. '3708') — matches
                                            -- schedule-retention.js's _normLoc() convention, NOT
                                            -- the zero-padded loc used by the qsr_* pull tables
  week_key    text not null,               -- the marked "workshop week" — computeStoreWeeks'
                                            -- own weekKey format (LifeLenz business-week, Wed-
                                            -- anchored), never re-derived here
  tenant_id   uuid not null default '00000000-0000-0000-0000-000000000001',
  updated_at  timestamptz default now(),
  updated_by  uuid references public.profiles(id)
);

alter table public.sched_retention_marks enable row level security;

-- Tenant isolation (same shape as target_overrides/yearly_targets) — every authenticated tenant
-- user can read/write, matching this report's existing perm gate ('analytics.store', checked in
-- the UI before this panel ever mounts) rather than a second RLS-level restriction.
drop policy if exists sched_retention_marks_tenant on public.sched_retention_marks;
create policy sched_retention_marks_tenant on public.sched_retention_marks
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Per-location restriction, ANDed with the tenant policy above (RESTRICTIVE) — mirrors
-- schema-yearly-targets.sql's yearly_targets_loc policy verbatim (same InitPlan-friendly
-- (select ...) subselect form — do not unwrap it).
drop policy if exists sched_retention_marks_loc on public.sched_retention_marks;
create policy sched_retention_marks_loc on public.sched_retention_marks
  as restrictive for all to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

comment on table public.sched_retention_marks is
  'Cloud-persisted "workshop week" mark per store for the Schedule Retention report (src/views/schedule-retention.js) and its cross-store Patch/Operator/Org/State rollup (dispatch #141). Replaces the pre-#141 localStorage-only mark (mf_sched_retention_mark), which was invisible across devices/sessions and made a cross-store rollup meaningless. One row per store (loc is the primary key) — marking a new week for a store overwrites its previous mark, matching the UI''s existing mark/unmark toggle semantics.';
