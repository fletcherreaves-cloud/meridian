-- ── lifelenz_employee_performance — per-employee reliability/performance scorecard ────────
-- Source: LifeLenz's Data Explorer "Employee Performance" report (Lakehouse-backed, same
-- trigger→poll→download async mechanism as lifelenz_schedule_variance/lifelenz_compliance_audit
-- -- see scripts/lifelenz-employee-performance-pull.mjs's header and memory/lifelenz-session.md).
--
-- Grain: ONE ROW PER (loc, geid, period_end) -- a rolling window ending that day, refreshed
-- daily, same rolling-period-snapshot shape as lifelenz_attendance_summary (schema-lifelenz-
-- attendance.sql), but at the PER-EMPLOYEE grain instead of a store-level rollup. This report's
-- own real shape (confirmed live, GitHub Actions run 41371639603, 2026-11-02) is fundamentally
-- different from Compliance Audit/Schedule Variance: there is NO per-row date/shift_date column
-- at all -- every column is a COUNT or RATE aggregated across the ENTIRE requested date range
-- for that employee (e.g. attendance_rate is one number for the whole window, not a per-day
-- figure). So unlike those two siblings (which have a natural per-event id/date), this table's
-- primary key is synthesized by the PULL SCRIPT's own request window boundaries, exactly the
-- way lifelenz_attendance_summary's (loc, period_end) key already works -- period_end advances
-- by one day on each daily run, so re-running the pull naturally produces a new trend point
-- rather than overwriting history.
--
-- geid (employees_geid, "Employee ID" in the report -- a human-facing payroll/GEID number, the
-- SAME identifier compliance_audit_report's own `geid` column already carries) is the natural
-- per-employee key component, not employees_employee_id (LifeLenz's own internal UUID for the
-- employee record, kept here as lifelenz_employee_id for cross-report joins, not as the key).
--
-- All 30 real columns confirmed live via GetReportMeta are plain operational fields -- none are
-- ssn/dateOfBirth/address/etc. (the standing PII rule's named forbidden fields). employees_
-- minor_age is kept per the SAME precedent lifelenz_compliance_audit already set (a labor-law-
-- relevant derived age flag, not a birthdate) -- promoted there too. Every column is promoted
-- directly (no `raw` JSONB) since this report has exactly 30 columns total and essentially all
-- of them are things a performance-scorecard UI needs to sort/filter/aggregate on directly --
-- unlike Compliance Audit's 42-column report, there is no "long tail" of rarely-used fields to
-- defensively bucket. Employee names are stored in plain columns with ordinary tenant +
-- accessible_locs RLS, matching lifelenz_compliance_audit's own precedent (also a per-employee,
-- named table) -- not routed through the separate identity-reveal vault mechanism
-- (schema-identity-vault.sql), which this codebase reserves for security/loss-prevention
-- accusation contexts (Security Events / crew-schedule-panel.js), a narrower category than an
-- ordinary attendance/performance scorecard.
create table if not exists public.lifelenz_employee_performance (
  tenant_id                    uuid        not null default '00000000-0000-0000-0000-000000000001',
  loc                          text        not null,   -- store number, 7-char zero-padded
  geid                         text        not null,   -- employees_geid, "Employee ID" -- human-facing payroll/GEID number
  period_start                 date        not null,
  period_end                   date        not null,   -- the pull's rolling-window end date (the key's date component)
  employee_name                text,                   -- employees_employee_name
  employee_name_last_first     text,                   -- employees_employee_name_last_first
  lifelenz_employee_id         text,                   -- employees_employee_id -- LifeLenz's own internal employee UUID, not the key
  employment_status            text,                   -- employees_current_status
  employment_type              text,                   -- employees_employment_type_name
  minor_age                    integer,                -- employees_minor_age -- same precedent as lifelenz_compliance_audit
  is_salaried                  boolean,                -- employees_is_salaried
  is_manager                   boolean,                -- employees_is_manager
  absent_count                 integer,
  late_count                   integer,
  no_punch_count               integer,
  attendance_rate              numeric,                -- % for the whole window; null when scheduled_count=0 (no denominator)
  scheduled_count              integer,
  worked_count                 integer,
  unscheduled_count            integer,
  drop_approved_count          integer,
  drop_rate                    numeric,
  pickup_request_count         integer,
  pickup_approved_count        integer,
  total_worked_hours           numeric,
  disciplinary_action_count    integer,
  commendation_count           integer,
  leave_days_requested         numeric,
  leave_days_approved          numeric,
  swap_manager_approved_count  integer,
  swap_rate                    numeric,
  updated_at                   timestamptz not null default now(),
  primary key (loc, geid, period_end)
);

create index if not exists lifelenz_employee_performance_period_end_idx
  on public.lifelenz_employee_performance (period_end desc);
create index if not exists lifelenz_employee_performance_employee_idx
  on public.lifelenz_employee_performance (geid);

alter table public.lifelenz_employee_performance enable row level security;

-- Same two-layer pattern as lifelenz_compliance_audit/lifelenz_schedule_variance: tenant match +
-- accessible_locs loc-scoping via the existing (select public.my_locs()) RESTRICTIVE predicate.
drop policy if exists "lifelenz_employee_performance: tenant read" on public.lifelenz_employee_performance;
create policy "lifelenz_employee_performance: tenant read" on public.lifelenz_employee_performance
  for select using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

drop policy if exists "lifelenz_employee_performance: loc scope" on public.lifelenz_employee_performance;
create policy "lifelenz_employee_performance: loc scope" on public.lifelenz_employee_performance
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
-- scripts/lifelenz-employee-performance-pull.mjs's service-role key, which bypasses RLS entirely.

comment on table public.lifelenz_employee_performance is
  'Per-employee reliability/performance scorecard from LifeLenz''s Data Explorer Employee Performance report (Lakehouse-backed): attendance %, drop/pickup/swap activity, worked hours, discipline/commendations, leave days, one row per (loc, geid, period_end) rolling window. Written only by scripts/lifelenz-employee-performance-pull.mjs (service role); read gated by ordinary tenant + accessible_locs RLS.';
