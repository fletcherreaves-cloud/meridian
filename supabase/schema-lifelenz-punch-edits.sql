-- ── lifelenz_punch_edits — per-employee punch EDIT/ADD events, with the editing manager ────────
-- Unblocks plan-security-loss-prevention.md §2.4's manual-time-edit-pattern rules (Phase 1b).
-- Source: LifeLenz admin report `time_punch_change_approvals_report`, owner-captured
-- 2026-10-12 (memory/finding-lifelenz-punch-edit-audit-report-2026-10-12.md). Same host/auth/
-- scheduleId shape as the already-confirmed `labor_analysis_actuals_report` pull
-- (scripts/lifelenz-pull.mjs's fetchReportChunk/pollForReport, reused as-is for this report).
--
-- This is NOT a general punch log (that's QSRSoft's qsr_punch_times, a separate vendor/table) --
-- it stores ONLY rows where the report's own `Adjustment Type` column is non-blank (an actual
-- Add or Edit event), which is what makes this table small and specifically about EDITS, not
-- every punch. See scripts/lifelenz-pull.mjs's parsePunchEditCSV() for the exact filter.
--
-- Names/GEIDs/manager names are stored directly, not tokenized -- same domain as
-- lifelenz_shift_assignments (dispatch #125, owner directive: "no reason to hide names for
-- scheduling and punch times"). No SSN/DOB/address field exists anywhere in this report.
create table if not exists public.lifelenz_punch_edits (
  tenant_id             uuid        not null default '00000000-0000-0000-0000-000000000001',
  loc                   text        not null,   -- store number, 7-char zero-padded, e.g. '0034222'
  geid                  text        not null,    -- LifeLenz GEID -- stable per-employee key
  employee_name         text,                    -- resolved name, carried forward from the CSV's employee-block header row
  payroll_id            text,
  punch_type            text        not null,    -- Clock In | Clock Out | Break Start | Break End | Role Rate Operation
  punch_method          text,                    -- Pin | Biometrics | Manual (how the punch was ORIGINALLY made, not the edit itself)
  adjustment_type       text        not null,    -- Add | Edit -- Add means no original punch existed; Edit means an existing one was changed
  original_punch_at     timestamp,               -- naive, store-local as given by the report (no timezone conversion applied) -- null for an Add
  adjusted_punch_at      timestamp,               -- the new/corrected punch time after the edit
  modified_at           timestamp   not null,    -- when the EDIT itself was made -- the key timestamp for every manual-edit-pattern rule
  manager_modified      text        not null,    -- the editor's name -- THE field this table exists to carry
  employee_action_at    timestamp,               -- when the employee acknowledged/responded, if at all
  employee_action_status text,                   -- e.g. 'Acknowledged' -- null if the employee hasn't acted
  updated_at            timestamptz not null default now(),
  -- Natural composite key: no stable row id exists in the CSV, but a given employee's punch of
  -- a given type can only be modified once at a given instant. Idempotent across re-pulls of the
  -- same safety-window range (same source row -> same modified_at -> same upsert target).
  --
  -- adjusted_punch_at is deliberately NOT part of this key (corrected 2026-10-12, same day as
  -- the first live run) -- a primary-key column is implicitly NOT NULL in Postgres, and the
  -- first live pull against the real API proved adjusted_punch_at IS legitimately blank on some
  -- real Add/Edit rows (manual run, 2026-10-12: 7 of 26 active stores had their entire batch
  -- upsert fail with `null value in column "adjusted_punch_at" ... violates not-null
  -- constraint`, losing 133 of 317 real edit-events). The four remaining key columns are already
  -- guaranteed non-null by parsePunchEditCSV()'s own row-building filter (scripts/lifelenz-
  -- pull.mjs skips any row missing punch_type or modified_at before it's ever returned).
  primary key (loc, geid, punch_type, modified_at)
);

-- Migration for a table already created under the ORIGINAL (buggy) 5-column key, before this
-- was caught by the first live run -- `create table if not exists` above is a no-op against an
-- existing table, so the fix needs an explicit ALTER. Safe to re-run: on a table that already
-- has the correct 4-column key (either a fresh deploy of this file, or one already migrated),
-- the constraint name is unchanged, so this drops and immediately recreates the SAME key --
-- a harmless no-op, not a second migration.
alter table public.lifelenz_punch_edits drop constraint if exists lifelenz_punch_edits_pkey;
alter table public.lifelenz_punch_edits add primary key (loc, geid, punch_type, modified_at);

create index if not exists lifelenz_punch_edits_loc_modified_idx
  on public.lifelenz_punch_edits (loc, modified_at desc);
create index if not exists lifelenz_punch_edits_manager_idx
  on public.lifelenz_punch_edits (manager_modified);
create index if not exists lifelenz_punch_edits_geid_idx
  on public.lifelenz_punch_edits (geid);

alter table public.lifelenz_punch_edits enable row level security;

-- Same two-layer pattern as lifelenz_shift_assignments (schema-lifelenz-shift-assignments.sql):
-- tenant match + accessible_locs loc-scoping via the existing (select public.my_locs())
-- RESTRICTIVE predicate. This is operational labor data, not an identity-reveal-gated table --
-- per dispatch #125's existing directive for this exact data domain (scheduling/punch times).
drop policy if exists "lifelenz_punch_edits: tenant read" on public.lifelenz_punch_edits;
create policy "lifelenz_punch_edits: tenant read" on public.lifelenz_punch_edits
  for select using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

drop policy if exists "lifelenz_punch_edits: loc scope" on public.lifelenz_punch_edits;
create policy "lifelenz_punch_edits: loc scope" on public.lifelenz_punch_edits
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
-- scripts/lifelenz-pull.mjs's service-role key, which bypasses RLS entirely. Matches
-- lifelenz_shift_assignments'/security_findings' own "writes are backend-only" pattern.

comment on table public.lifelenz_punch_edits is
  'Per-employee punch EDIT/ADD events with the editing manager (Manager Modified), edit timestamp (Modified Date/Time), and original-vs-adjusted value, from LifeLenz''s time_punch_change_approvals_report. Unblocks plan-security-loss-prevention.md Phase 1b''s manual-edit-pattern rules (self-approval, per-manager outlier rate, rounding-direction skew). Written only by scripts/lifelenz-pull.mjs (service role); read gated by ordinary tenant + accessible_locs RLS.';
