-- ── lifelenz_shift_assignments — per-employee, per-shift schedule rows (dispatch #123) ────────
-- Crew Schedule Lookup: "search for an employee and see their upcoming schedule." Source:
-- scripts/lifelenz-pull.mjs's pullShiftAssignments() -- the SAME ShiftsForSchedulePeriod
-- GraphQL call lifelenz_job_hours already uses, reduced per-SHIFT instead of rolled up per
-- week/station (src/engine/lifelenz-shift-jobs.js's shiftsForEmployeeSchedule), plus a roster
-- lookup (GetSchedulableEmploymentsForPeriod) for the employee's name.
--
-- 🔴 NON-NEGOTIABLE (dispatch #123): NO RAW EMPLOYEE NAME COLUMN. emp_token is the only identity
-- column, exactly the same tokenize-before-write discipline dispatch #37 established for
-- audit_rows.emp_token -- see src/engine/identity-vault.js and scripts/qsrsoft-register-audit-
-- pull.mjs's saveAuditRows(). assigned_employment_id (LifeLenz's own opaque employment id) is
-- kept in the clear -- it is a system key, not a name, and the dispatch explicitly allows it as
-- a display fallback ("Employee #12345") when no name was resolvable (roster fetch failed, or
-- the employee genuinely has no roster entry in this window).
create table if not exists public.lifelenz_shift_assignments (
  loc                     text        not null,   -- store number, e.g. '0003708'
  shift_id                text        not null,   -- LifeLenz GraphQL Shift.id -- globally unique
  tenant_id               uuid        not null default '00000000-0000-0000-0000-000000000001',
  date                    date        not null,    -- calendar date of shift_start (LifeLenz's own scheduling day, NOT the 4am ABC business-day boundary -- this is a SCHEDULE, displayed the same way LifeLenz's own UI groups a shift by its start date)
  shift_start             timestamptz,
  shift_end               timestamptz,
  assigned_employment_id  text        not null,    -- LifeLenz employmentId -- opaque, safe to display as "Employee #<id>" when emp_token is null
  emp_token               uuid        references public.employee_identity_vault(id),
  business_role_id        text,                    -- LifeLenz businessRoleId (station) -- src/engine/lifelenz-shift-jobs.js's LIFELENZ_BUSINESS_ROLES
  role_name               text,
  category                text,                    -- Variable | Floor | Fixed
  code                    text,
  job_title               text,                    -- resolved payroll title (e.g. "Crew Person"), NOT a raw jobTitleId
  is_absent               boolean     not null default false,
  schedule_id             text,
  updated_at              timestamptz not null default now(),
  primary key (loc, shift_id)
);

-- Seam for dispatch #124 (actual punch times, a separate/parallel dispatch, NOT built here):
-- that pull's own table is expected to join onto this one by (loc, date, emp_token) to compute
-- scheduled-vs-punched. This index exists for that future join AND for the panel's own
-- "employee's upcoming schedule, scoped to a location + date range" query today.
create index if not exists lifelenz_shift_assignments_loc_date_emp_idx
  on public.lifelenz_shift_assignments (loc, date, emp_token);
create index if not exists lifelenz_shift_assignments_date_idx
  on public.lifelenz_shift_assignments (date desc);
create index if not exists lifelenz_shift_assignments_employment_idx
  on public.lifelenz_shift_assignments (assigned_employment_id);

alter table public.lifelenz_shift_assignments enable row level security;

-- Gated read -- deliberately the SAME tier as security_findings and reveal_employee_identity()
-- (admin/supervisor always; manager only when org_config.gm_identity_reveal_enabled), NOT the
-- looser "any authenticated user" `using(true)` pattern most operational tables in this repo use
-- (lifelenz_schedule, lifelenz_job_hours, even audit_rows itself). Reasoning, stated explicitly
-- per security_findings' own precedent comment: a token alone isn't PII, but a per-employee
-- SCHEDULE, searchable and multi-select-able by design, is exactly the "named-employee" surface
-- CLAUDE.md's own dispatch #123 brief calls out as a first for this app -- a small night crew
-- with one flagged token (or one schedule row) isn't meaningfully anonymous to whoever is
-- looking. Starting at the conservative tier and loosening later on an explicit owner decision
-- is the safer default than the reverse. This is also the one place dispatch #123's own "should
-- a GM see their own store's schedule without the reveal toggle" open question is answered: NO,
-- deliberately -- see the PR body for the full reasoning (consistency with the Security panel's
-- established tier; avoiding a new, unreviewed RLS carve-out on the most sensitive table in this
-- schema, so soon after the reveal_employee_identity() NULL-role bypass incident).
drop policy if exists "lifelenz_shift_assignments: gated read" on public.lifelenz_shift_assignments;
create policy "lifelenz_shift_assignments: gated read" on public.lifelenz_shift_assignments
  for select using (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    and (
      get_my_role() in ('admin', 'supervisor')
      or (
        get_my_role() = 'manager'
        and coalesce((select (data->>'enabled')::boolean from public.org_config where key = 'gm_identity_reveal_enabled'), false)
      )
    )
  );
-- No insert/update/delete policy for any role -- every write comes from scripts/lifelenz-
-- pull.mjs's service-role key, which bypasses RLS entirely regardless of policies here. Matches
-- security_findings'/identity_reveal_log's own "writes are backend-only" pattern.

comment on table public.lifelenz_shift_assignments is
  'Per-employee, per-shift schedule rows (dispatch #123, Crew Schedule Lookup). emp_token only -- NEVER a raw name column. Written only by scripts/lifelenz-pull.mjs (service role); read gated to the same tier as reveal_employee_identity()/security_findings.';
