-- ── lifelenz_schedule_variance — per-edit schedule-change audit trail, with the editing manager ──
-- Source: LifeLenz's NEW "Data Explorer" Schedule Variance report (Lakehouse-backed, async
-- report generation), owner-captured live DevTools curls 2026-11-01
-- (memory/lifelenz-session.md's "New Data Explorer" section has the full trigger→poll→download
-- flow this table's pull script, scripts/lifelenz-schedule-variance-pull.mjs, implements).
--
-- This is NOT the same thing as lifelenz_schedule (the published schedule itself) or
-- lifelenz_punch_edits (clock-PUNCH edits). This is the audit trail of edits made to the
-- SCHEDULE after it was published: who changed what value, when, and the resulting
-- hours/cost impact. Same domain and same "names stored directly, not tokenized" precedent as
-- lifelenz_punch_edits (dispatch #125/#126, owner directive: no reason to hide names for
-- scheduling and punch times).
--
-- Column list is the EXACT confirmed `columns` the UI itself requests for this report
-- (captured live, not guessed): locations_location_name, scheduled_shifts_scheduled_shift_id,
-- employees_employee_name, original_value, updated_value, schedule_event_actors_employee_name,
-- occurred_at, scheduled_hours_variance, cost_variance. `loc` here is NOT parsed from the CSV's
-- own locations_location_name text -- the pull script already knows which store it requested
-- (one LifeLenz schedule GUID = one store, looped per-store), which is more reliable than
-- re-deriving it from a free-text location-name column.
create table if not exists public.lifelenz_schedule_variance (
  tenant_id             uuid        not null default '00000000-0000-0000-0000-000000000001',
  loc                   text        not null,   -- store number, 7-char zero-padded
  scheduled_shift_id    text,                    -- the shift this edit applies to -- nullable: not every edit type is shift-scoped (e.g. a role-rate change)
  employee_name         text,                    -- whose shift was edited (employees_employee_name)
  original_value        text,                    -- raw value before the edit -- stored as text; real shape (a time, a role, a rate...) not yet confirmed against live data
  updated_value         text,                    -- raw value after the edit
  edited_by             text        not null,    -- schedule_event_actors_employee_name -- THE field this table exists to carry, same role as lifelenz_punch_edits.manager_modified
  occurred_at           timestamp   not null,     -- when the EDIT was made
  hours_variance        numeric,                 -- scheduled_hours_variance -- resulting change in scheduled hours from this edit
  cost_variance         numeric,                 -- resulting $ change from this edit
  updated_at            timestamptz not null default now(),
  seq                   integer     not null default 0,
  -- seq, same reasoning as lifelenz_punch_edits: occurred_at is not necessarily unique per
  -- (loc, edited_by) if LifeLenz batches multiple field changes from one save action under the
  -- same timestamp. seq is a 0-based counter assigned per (loc, edited_by, occurred_at) group in
  -- the order rows are encountered within one CSV parse -- always present, safe as a PK column
  -- regardless of which other (nullable) fields are blank.
  primary key (loc, edited_by, occurred_at, seq)
);

create index if not exists lifelenz_schedule_variance_loc_occurred_idx
  on public.lifelenz_schedule_variance (loc, occurred_at desc);
create index if not exists lifelenz_schedule_variance_edited_by_idx
  on public.lifelenz_schedule_variance (edited_by);
create index if not exists lifelenz_schedule_variance_shift_idx
  on public.lifelenz_schedule_variance (scheduled_shift_id);

alter table public.lifelenz_schedule_variance enable row level security;

-- Same two-layer pattern as lifelenz_punch_edits/lifelenz_shift_assignments: tenant match +
-- accessible_locs loc-scoping via the existing (select public.my_locs()) RESTRICTIVE predicate.
drop policy if exists "lifelenz_schedule_variance: tenant read" on public.lifelenz_schedule_variance;
create policy "lifelenz_schedule_variance: tenant read" on public.lifelenz_schedule_variance
  for select using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

drop policy if exists "lifelenz_schedule_variance: loc scope" on public.lifelenz_schedule_variance;
create policy "lifelenz_schedule_variance: loc scope" on public.lifelenz_schedule_variance
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
-- scripts/lifelenz-schedule-variance-pull.mjs's service-role key, which bypasses RLS entirely.

comment on table public.lifelenz_schedule_variance is
  'Per-edit schedule-change audit trail from LifeLenz''s Data Explorer Schedule Variance report (Lakehouse-backed): who edited a published schedule (edited_by), what value changed (original_value -> updated_value), when (occurred_at), and the resulting scheduled-hours and cost impact. Powers src/engine/schedule-discipline.js''s per-store/per-editor Schedule Discipline metrics (Labor & Scheduling hub''s Schedule Discipline tab). Written only by scripts/lifelenz-schedule-variance-pull.mjs (service role); read gated by ordinary tenant + accessible_locs RLS.';
