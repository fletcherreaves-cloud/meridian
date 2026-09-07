-- ═══════════════════════════════════════════════════════════════════════════════
-- store_assessments — manual per-store rating tracker (Staged Experiments / Risk Tracking)
--
-- Replaces a table that never existed. backlog-master-2026-08-19.md §12 / backlog-open-
-- 2026-09-06.md §12 tracked an "8/20 scheduling-workshop stores rated" progress figure
-- against a `store_assessments` table with ZERO references anywhere in src/, supabase/, or
-- scripts/ — settled 2026-09-07 via a live service-role read: PGRST205, the table was never
-- created. The figure lived only in the owner's own tracking. This is the real table + the
-- panel that reads/writes it (src/views/store-assessments.js).
--
-- Deliberately generic, not scheduling-workshop-specific: `assessment_type` lets any rating
-- program (scheduling-workshop today, a different one later) share the same table without a
-- schema change, matching this app's existing "one row per store, replace on re-rate" shape
-- (schema-dispatch-141-retention-marks.sql's sched_retention_marks is the direct template —
-- same manual, per-store, user-editable-not-pull-written pattern, same RLS shape).
--
-- One row per (loc, assessment_type) — re-rating a store overwrites its previous rating for
-- that assessment type rather than appending a history row, matching sched_retention_marks'
-- own single-mark-per-store semantics. If a rating HISTORY is ever needed, that's a real
-- schema change (a surrogate PK + an index on (loc, assessment_type, assessed_date)), not a
-- reason to guess ahead of the actual need now.
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.store_assessments (
  loc              text        not null,   -- store number, unpadded (e.g. '3708') — matches
                                            -- STORE_NAMES/constants.js convention, not the
                                            -- zero-padded loc the qsr_* pull tables use
  assessment_type  text        not null default 'scheduling-workshop',
  tenant_id        uuid        not null default '00000000-0000-0000-0000-000000000001',
  status           text        not null default 'pending',  -- 'pending' | 'rated'
  rating           text,                   -- free text/score (e.g. "4/5", "Pass") — deliberately
                                            -- not a numeric column: different assessment types
                                            -- may use different rating shapes
  assessed_date    date,
  assessed_by      text,
  due_date         date,
  notes            text,
  updated_at       timestamptz not null default now(),
  updated_by       uuid        references public.profiles(id),
  primary key (loc, assessment_type)
);

alter table public.store_assessments enable row level security;

-- Tenant isolation (same shape as sched_retention_marks/target_overrides/yearly_targets) —
-- every authenticated tenant user can read/write; the UI's own perm gate ('analytics.store')
-- is the intended access control, not a second RLS-level restriction.
drop policy if exists store_assessments_tenant on public.store_assessments;
create policy store_assessments_tenant on public.store_assessments
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Per-location restriction, ANDed with the tenant policy above (RESTRICTIVE) — mirrors
-- sched_retention_marks_loc / yearly_targets_loc verbatim (same InitPlan-friendly
-- (select ...) subselect form — do not unwrap it).
drop policy if exists store_assessments_loc on public.store_assessments;
create policy store_assessments_loc on public.store_assessments
  as restrictive for all to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

comment on table public.store_assessments is
  'Manual per-store rating tracker (Staged Experiments / Risk Tracking backlog). One row per (loc, assessment_type); re-rating a store overwrites its previous rating for that type. Written by src/views/store-assessments.js via an authenticated client (not a pull script) — RLS is the access control, matching sched_retention_marks.';
