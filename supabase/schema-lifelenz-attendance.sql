-- ── lifelenz_attendance_summary — per-store, rolling-28-day attendance rollup ──────────────
-- Replaces src/views/scheduling.js's hand-transcribed, frozen-since-June TA_DATA (no live
-- source, "Update by uploading a new T&A report from LifeLenz" that never got a pull built).
-- Source: LifeLenz's `attendance_report` CSV export (report-name slug found live 2026-09-06,
-- memory/backlog-open-2026-09-06.md §3 -- see scripts/lifelenz-attendance-pull.mjs's header for
-- the endpoint and the exact CSV shape captured).
--
-- Grain: ONE ROW PER (loc, period_end) -- a rolling 28-day window ending that day, refreshed
-- daily by the pull script. This is a STORE-LEVEL rollup (summed across every employee at that
-- store for the window), not a per-employee table -- the app's own UI use (scheduling.js's
-- "Missed Shifts" tile) only ever needed a store total, and per-employee LifeLenz names carry
-- no operational need here the way lifelenz_shift_assignments' per-employee schedule lookup
-- does, so storing only the aggregate avoids raising a PII surface for zero UI benefit.
--
-- unexcused_absences is what scheduling.js's TA_DATA.missedShifts is replaced by -- an employee
-- scheduled and no-call/no-showed. This is a judgment call, not a verified-identical
-- replacement of whatever the original hand-typed number's own methodology was (that snapshot
-- documented no source at all -- see scheduling.js's own TA_DATA comment). Flagged for the
-- owner to confirm the definition matches what "missed shift" should mean in this panel.
create table if not exists public.lifelenz_attendance_summary (
  loc                   text        not null,   -- store number, e.g. '0033222' (7-char zero-padded, matches lifelenz_schedule/qsr_* convention)
  period_end            date        not null,    -- last day of the rolling window (the pull's "yesterday")
  tenant_id             uuid        not null default '00000000-0000-0000-0000-000000000001',
  period_start          date        not null,    -- period_end - 27 days
  employee_count        integer     not null default 0, -- distinct employees with >=1 scheduled shift in the window
  scheduled_shifts      integer     not null default 0, -- sum(SCHEDULED SHIFT #)
  accepted_shifts       integer     not null default 0, -- sum(ACCEPTED SHIFT #)
  pickup_shifts         integer     not null default 0, -- sum(PICK UP #)
  excused_absences      integer     not null default 0, -- sum(EXCUSED ABSENCE #)
  unexcused_absences    integer     not null default 0, -- sum(UNEXCUSED ABSENCE #) -- see header note, replaces TA_DATA.missedShifts
  unfilled_shifts       integer     not null default 0, -- sum(UNFILLED SHIFT #)
  late_shift_starts     integer     not null default 0, -- sum(LATE SHIFT START #)
  early_shift_starts    integer     not null default 0, -- sum(EARLY SHIFT START #)
  dropped_shifts        integer     not null default 0, -- sum(DROPPED #)
  swapped_shifts        integer     not null default 0, -- sum(SWAPPED #)
  pulled_at             timestamptz not null default now(),
  primary key (loc, period_end)
);

create index if not exists lifelenz_attendance_summary_period_end_idx
  on public.lifelenz_attendance_summary (period_end desc);

alter table public.lifelenz_attendance_summary enable row level security;

-- Same two-layer pattern as every other loc-keyed operational table added after
-- schema-rls-phase2-loc.sql shipped (see schema-lifelenz-shift-assignments.sql's own header for
-- the full reasoning) -- tenant match + accessible_locs scoping via the live (select
-- public.my_locs()) RESTRICTIVE predicate. This is a store-level aggregate with no employee
-- names at all, so there is no identity-reveal tier question here the way the shift-assignments
-- table had to work through.
drop policy if exists "lifelenz_attendance_summary: tenant read" on public.lifelenz_attendance_summary;
create policy "lifelenz_attendance_summary: tenant read" on public.lifelenz_attendance_summary
  for select using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

drop policy if exists "lifelenz_attendance_summary: loc scope" on public.lifelenz_attendance_summary;
create policy "lifelenz_attendance_summary: loc scope" on public.lifelenz_attendance_summary
  as restrictive for all to authenticated
  using (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  )
  with check (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  );
-- No insert/update/delete policy for any role -- writes are service-role-only
-- (scripts/lifelenz-attendance-pull.mjs), matching every other pull-written table.

comment on table public.lifelenz_attendance_summary is
  'Per-store rolling-28-day attendance rollup from LifeLenz''s attendance_report CSV (found 2026-09-06). Replaces scheduling.js''s hand-transcribed TA_DATA. Written only by scripts/lifelenz-attendance-pull.mjs (service role); read gated by tenant + accessible_locs RLS.';
