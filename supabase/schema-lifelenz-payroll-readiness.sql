-- ── lifelenz_payroll_readiness — per-employee, per-pay-period payroll pre-close audit ────────
-- Source: LifeLenz's Data Explorer "Payroll Readiness" report (Lakehouse-backed, same async
-- trigger→poll→download mechanism as lifelenz_schedule_variance/lifelenz_compliance_audit/
-- lifelenz_employee_performance -- see scripts/lifelenz-payroll-readiness-pull.mjs's header and
-- memory/lifelenz-session.md). This table's pull script is
-- scripts/lifelenz-payroll-readiness-pull.mjs.
--
-- ⚠️ UNCONFIRMED AT A LEVEL BEYOND EVERY SIBLING TABLE ABOVE -- flagged here too, not just in
-- the pull script, since this schema itself encodes the same unverified guesses. The reportKey
-- (`payroll_readiness_report`) is a naming-pattern guess (memory/lifelenz-session.md's own
-- words: "unconfirmed, would need to open each tile and capture its own GetReportMeta call to
-- be sure"), and the column member names below are copied from that same memory file's
-- representative (not live-captured) 58-column description. Do NOT treat this table's real
-- data, once it exists, as validated until a live GetReportMeta dispatch (same method task #30
-- used for Employee Performance) confirms the real reportKey and field members match.
--
-- Grain: ONE ROW PER (loc, geid, pay_period_start) -- unlike lifelenz_employee_performance's
-- synthesized rolling window, this report's own pay_periods_start_time is (expected to be) a
-- REAL per-row column, so it is not synthesized here -- same "real event id/date" shape as
-- lifelenz_compliance_audit's shift_date, not lifelenz_employee_performance's windowed shape.
--
-- Only the fields explicitly named in memory/lifelenz-session.md's representative description
-- are promoted to real columns; everything else the pull script's runtime GetReportMeta call
-- discovers lands in `raw` JSONB -- same "avoids guessing an entire 58-column schema" precedent
-- lifelenz_compliance_audit already set for an unconfirmed long-tail report. This also means a
-- wrong guess in one promoted field just leaves that one column null (value sits in `raw`
-- instead) rather than breaking anything.
--
-- overtime_earnings/overtime_hours are the two fields task #85 actually cares about (closing
-- the loop on "which employees/pay periods ran OT, and what did it cost" -- the whole point of
-- this pull) -- both promoted to real columns precisely because they need to be queried/summed
-- directly, not just carried along in `raw`.
create table if not exists public.lifelenz_payroll_readiness (
  tenant_id               uuid        not null default '00000000-0000-0000-0000-000000000001',
  loc                     text        not null,   -- store number, 7-char zero-padded
  geid                    text        not null,    -- employees_geid, same identifier compliance_audit_report/employee_performance_report already use
  pay_period_start        date        not null,    -- pay_periods_start_time
  employee_name           text,                    -- employees_employee_name
  pay_period_status       text,                     -- pay_periods_pay_period_status
  scheduled_hours         numeric,                  -- scheduled_shifts_scheduled_hours
  worked_hours            numeric,
  total_worked_hours      numeric,
  hours_variance          numeric,                  -- same field name as Schedule Variance, but at the PAY-PERIOD level
  cost_variance           numeric,
  total_earnings          numeric,
  regular_earnings        numeric,
  overtime_earnings       numeric,                  -- the field task #85 is actually built around
  overtime_hours          numeric,
  double_earnings         numeric,
  double_hours            numeric,
  time_off_earnings       numeric,
  time_off_hours          numeric,
  additional_earnings     numeric,
  additional_hours        numeric,
  misc_earnings           numeric,
  misc_hours              numeric,
  compliance_earnings     numeric,
  compliance_hours        numeric,
  differential_earnings   numeric,
  differential_hours      numeric,
  poster_employee_name    text,                     -- pay_period_posters_employee_name -- who posted payroll
  approver_employee_name  text,                     -- pay_period_approvers_employee_name -- who approved it
  absent_reason_text      text,                     -- scheduled_shifts_absent_reason_text
  time_off_type_name      text,                     -- time_off_types_name
  raw                     jsonb,                     -- every other real column this report carries (discovered at runtime via GetReportMeta, not hand-enumerated here)
  updated_at              timestamptz not null default now(),
  primary key (loc, geid, pay_period_start)
);

create index if not exists lifelenz_payroll_readiness_period_idx
  on public.lifelenz_payroll_readiness (pay_period_start desc);
create index if not exists lifelenz_payroll_readiness_employee_idx
  on public.lifelenz_payroll_readiness (geid);
-- The whole point of task #85: finding employees/pay-periods with real overtime, fast.
create index if not exists lifelenz_payroll_readiness_overtime_idx
  on public.lifelenz_payroll_readiness (loc, overtime_hours) where overtime_hours > 0;

alter table public.lifelenz_payroll_readiness enable row level security;

-- Same two-layer pattern as lifelenz_compliance_audit/lifelenz_employee_performance: tenant
-- match + accessible_locs loc-scoping via the existing (select public.my_locs()) RESTRICTIVE
-- predicate. NOT the shared schema-multitenant-phase2-rls.sql/schema-rls-phase2-loc.sql loop
-- arrays recommendation_ledger just used -- this table follows the MORE SPECIFIC, more recent
-- precedent its own direct siblings (other LifeLenz Data Explorer per-employee tables) already
-- set, which is a deliberate, closer match than the generic shared-loop convention.
drop policy if exists "lifelenz_payroll_readiness: tenant read" on public.lifelenz_payroll_readiness;
create policy "lifelenz_payroll_readiness: tenant read" on public.lifelenz_payroll_readiness
  for select using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

drop policy if exists "lifelenz_payroll_readiness: loc scope" on public.lifelenz_payroll_readiness;
create policy "lifelenz_payroll_readiness: loc scope" on public.lifelenz_payroll_readiness
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
-- scripts/lifelenz-payroll-readiness-pull.mjs's service-role key, which bypasses RLS entirely.

comment on table public.lifelenz_payroll_readiness is
  'Per-employee, per-pay-period payroll pre-close audit from LifeLenz''s Data Explorer Payroll Readiness report (Lakehouse-backed): scheduled vs worked hours, hours/cost variance, earnings by type (regular/overtime/double/time-off/etc.), one row per (loc, geid, pay_period_start). Task #85''s overtime-correlation work point-of-origin. UNCONFIRMED reportKey/field-member guesses -- see this table and its pull script''s own header comments before trusting real data here. Written only by scripts/lifelenz-payroll-readiness-pull.mjs (service role); read gated by ordinary tenant + accessible_locs RLS.';
