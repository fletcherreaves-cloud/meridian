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
  seq                   integer     not null default 0,
  -- seq (added 2026-10-12, SECOND same-day correction): LifeLenz's own Modified Date/Time is
  -- MINUTE granularity, not actually unique per (loc,geid,punch_type) -- the owner's second live
  -- attempt at a migration (loc,geid,punch_type,modified_at) alone hit a real duplicate:
  -- (0013113, 200668686, 'Role Rate Operation', 2026-10-09 15:29:00) appeared on more than one
  -- row, almost certainly a multi-segment role/rate split saved in one action. No other CSV
  -- field reliably disambiguates (original_punch_at/adjusted_punch_at can each legitimately be
  -- null). seq is assigned by parsePunchEditCSV() as a 0-based counter per
  -- (loc,geid,punch_type,modified_at) group, in the order rows are encountered in that single
  -- CSV parse -- always present, always an integer, never null, so it's safe as a PK column
  -- regardless of which other fields are blank. Idempotency across re-pulls of the same
  -- safety-window range depends on LifeLenz returning rows in a stable order for a given group
  -- across repeat calls -- unverified beyond this one capture; if it ever doesn't hold, the
  -- worst case is the SAME real events land under swapped seq slots, not data loss or a crash.
  primary key (loc, geid, punch_type, modified_at, seq)
);

-- seq column, for a table that predates it (added 2026-10-12). A no-op on a genuinely fresh
-- table (already has it from the create table block above).
alter table public.lifelenz_punch_edits add column if not exists seq integer not null default 0;

-- THIRD same-day correction: a live re-verification run after the seq fix STILL hit the exact
-- same "null value in column adjusted_punch_at ... violates not-null constraint" error on the
-- same 7 stores -- the earlier `DROP CONSTRAINT lifelenz_punch_edits_pkey` (first migration)
-- removed the PRIMARY KEY constraint but, measured live, did NOT revert the column-level NOT
-- NULL that Postgres applies as a side effect of making a column part of a primary key. That
-- NOT NULL is a separate, independent column attribute -- dropping the constraint that first
-- caused it does not undo it; it needs its own explicit DROP NOT NULL. Safe to re-run
-- (ALTER COLUMN ... DROP NOT NULL is idempotent -- a no-op if the column is already nullable).
alter table public.lifelenz_punch_edits alter column adjusted_punch_at drop not null;

-- Backfill seq for rows already saved under an EARLIER key (the original run saved 184 real
-- rows under the first, 5-column key, before either bug was found) -- a blanket default of 0
-- leaves every row in a duplicate group at seq=0, which would make the ADD PRIMARY KEY below
-- fail AGAIN on the pre-existing duplicate pair, not just future inserts. Assigns a stable
-- 0-based rank within each (loc,geid,punch_type,modified_at) group, ordered by adjusted_punch_at
-- (nulls first) then ctid as the final tiebreaker for true ties -- a no-op (zero rows touched)
-- on a fresh table with no pre-existing data.
with ranked as (
  select ctid, row_number() over (
    partition by loc, geid, punch_type, modified_at
    order by adjusted_punch_at nulls first, ctid
  ) - 1 as rn
  from public.lifelenz_punch_edits
)
update public.lifelenz_punch_edits t
set seq = ranked.rn
from ranked
where t.ctid = ranked.ctid and t.seq is distinct from ranked.rn;

-- Migration for a table already created under an earlier (buggy) key -- first the original
-- 5-column key (included adjusted_punch_at, implicitly NOT NULL, crashed on real blank values),
-- then a 4-column key (loc,geid,punch_type,modified_at) that turned out not to be unique on real
-- data either (see the seq comment above). `create table if not exists` above is a no-op against
-- an existing table, so the fix needs an explicit ALTER every time. Safe to re-run: on a table
-- that already has the correct 5-column key, the constraint name is unchanged, so this drops and
-- immediately recreates the SAME key -- a harmless no-op, not a further migration.
alter table public.lifelenz_punch_edits drop constraint if exists lifelenz_punch_edits_pkey;
alter table public.lifelenz_punch_edits add primary key (loc, geid, punch_type, modified_at, seq);

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
