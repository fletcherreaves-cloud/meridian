-- ── lifelenz_shift_assignments — per-employee, per-shift schedule rows (dispatch #123) ────────
-- Crew Schedule Lookup: "search for an employee and see their upcoming schedule." Source:
-- scripts/lifelenz-pull.mjs's pullShiftAssignments() -- the SAME ShiftsForSchedulePeriod
-- GraphQL call lifelenz_job_hours already uses, reduced per-SHIFT instead of rolled up per
-- week/station (src/engine/lifelenz-shift-jobs.js's shiftsForEmployeeSchedule), plus a roster
-- lookup (GetSchedulableEmploymentsForPeriod) for the employee's name.
--
-- 🔄 DISPATCH #125 (owner directive, 2026-08-25, sent while this PR was open for review):
-- "there is no reason to hide names for scheduling and punch times > everyone can see this data
-- as-is." This table originally stored ONLY emp_token (dispatch #123's non-negotiable rule at
-- the time). That rule is reversed: employee_name now stores the resolved name directly, and the
-- emp_token/identity-vault machinery has been dropped from this table entirely --
-- scripts/lifelenz-pull.mjs no longer calls tokenizeRows()/getOrCreateToken() for this pull, and
-- there is no other consumer of an emp_token on this table (dispatch #126's companion QSRSoft
-- punch-times migration resolves ITS employee_name via a DIFFERENT join -- qsr_employee_tenure --
-- not by joining back to this table's emp_token, so keeping the column around for a future
-- cross-table join was considered and rejected as dead weight: it would mean continuing to run
-- identity-vault writes, with their audit-log surface, for zero consumers).
-- assigned_employment_id (LifeLenz's own opaque employment id) remains the stable join key --
-- unrelated to this change, it was never a privacy mechanism, just a system identifier, and is
-- still used as a display fallback ("Employee #12345") on the rare row where no roster match was
-- found (roster fetch failed, or the employee genuinely has no roster entry in this window).
create table if not exists public.lifelenz_shift_assignments (
  loc                     text        not null,   -- store number, e.g. '0003708'
  shift_id                text        not null,   -- LifeLenz GraphQL Shift.id -- globally unique
  tenant_id               uuid        not null default '00000000-0000-0000-0000-000000000001',
  date                    date        not null,    -- calendar date of shift_start (LifeLenz's own scheduling day, NOT the 4am ABC business-day boundary -- this is a SCHEDULE, displayed the same way LifeLenz's own UI groups a shift by its start date)
  shift_start             timestamptz,
  shift_end               timestamptz,
  assigned_employment_id  text        not null,    -- LifeLenz employmentId -- opaque, safe to display as "Employee #<id>" when employee_name is null
  employee_name           text,                    -- resolved employee name (dispatch #125). Nullable: a roster fetch failure or a genuinely unmatched employmentId leaves this null and the panel falls back to assigned_employment_id.
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

-- Seam for dispatch #124/#126 (actual punch times, a separate/parallel dispatch, NOT built
-- here): that table joins onto this one by (loc, date) + name/employmentId matching to compute
-- scheduled-vs-punched (the original emp_token-based join seam this index was built for no
-- longer applies -- #126 resolves its own employee_name via qsr_employee_tenure instead). This
-- index still serves the panel's own "employee's upcoming schedule, scoped to a location + date
-- range" query, so it's kept, just no longer indexing emp_token.
create index if not exists lifelenz_shift_assignments_loc_date_idx
  on public.lifelenz_shift_assignments (loc, date);
create index if not exists lifelenz_shift_assignments_date_idx
  on public.lifelenz_shift_assignments (date desc);
create index if not exists lifelenz_shift_assignments_employment_idx
  on public.lifelenz_shift_assignments (assigned_employment_id);

alter table public.lifelenz_shift_assignments enable row level security;

-- RBAC re-decision (dispatch #125, stated explicitly per the dispatch's request, not a rubber
-- stamp): dispatch #123 gated this table at the SAME tier as security_findings/
-- reveal_employee_identity() (admin/supervisor always; manager only with
-- org_config.gm_identity_reveal_enabled) specifically BECAUSE it was named-employee-revealing
-- data. With the owner's reversal that names are not sensitive here ("everyone can see this data
-- as-is"), a per-employee work schedule is ordinary operational data -- the same category as
-- lifelenz_schedule/lifelenz_job_hours (labor planning) or the per-loc-scoped tables in
-- schema-rls-phase2-loc.sql (labor_rows, ops_rows, ...) -- not an identity investigation. A GM
-- asking "who's on shift Tuesday at my store" is core scheduling use, not a security lookup, and
-- keeping the security_findings-tier gate on it after the reveal step is removed would mean most
-- managers (and every gm/office_staff/DO/VP/owner role) simply can't open the panel at all with
-- no principled reason left -- the ONLY thing that tier ever protected was the name itself.
-- So this drops to the SAME two-layer pattern every other loc-keyed operational table in this
-- schema uses: tenant match (this deployment is single-tenant today, same default as before) +
-- accessible_locs scoping via the existing (select public.my_locs()) RESTRICTIVE predicate
-- (schema-rls-phase2-loc.sql's own pattern, reproduced here inline since this table was created
-- after that migration ran rather than being in its table array). This is NOT "no RBAC" -- a GM
-- still only ever sees rows for locs in their own accessible_locs, exactly like every other
-- operational panel (Labor Tools, Calendar Manager) that has no panel-specific gate beyond
-- ordinary nav permission + RLS loc scoping. Nav-level visibility is perm:'analytics.store' in
-- src/app/panel-registry.js (same key Labor Tools/Scheduling/Calendar Manager use), not
-- perm:'security.view' -- there is no more reason for this panel to sit behind the Security nav
-- gate than there is for Labor Tools to.
drop policy if exists "lifelenz_shift_assignments: gated read" on public.lifelenz_shift_assignments;
drop policy if exists "lifelenz_shift_assignments: tenant read" on public.lifelenz_shift_assignments;
create policy "lifelenz_shift_assignments: tenant read" on public.lifelenz_shift_assignments
  for select using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

drop policy if exists "lifelenz_shift_assignments: loc scope" on public.lifelenz_shift_assignments;
create policy "lifelenz_shift_assignments: loc scope" on public.lifelenz_shift_assignments
  as restrictive for all to authenticated
  using (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  )
  with check (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  );
-- No insert/update/delete policy for any role -- every write comes from scripts/lifelenz-
-- pull.mjs's service-role key, which bypasses RLS entirely regardless of policies here. Matches
-- security_findings'/identity_reveal_log's own "writes are backend-only" pattern -- unchanged by
-- this dispatch, it was never part of the identity-tokenization question.

comment on table public.lifelenz_shift_assignments is
  'Per-employee, per-shift schedule rows (dispatch #123, Crew Schedule Lookup). Stores employee_name directly (dispatch #125 reversed the original emp_token-only design -- owner: "no reason to hide names for scheduling"). Written only by scripts/lifelenz-pull.mjs (service role); read gated by ordinary tenant + accessible_locs RLS, the same tier as other operational labor tables (lifelenz_schedule, labor_rows), not the identity-reveal-specific tier.';
