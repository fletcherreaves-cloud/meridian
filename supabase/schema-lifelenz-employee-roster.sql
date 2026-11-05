-- ── LifeLenz employee roster — crew pay-rate ground truth (owner request 2026-11-05) ───────────
-- Owner, mid-raise-entry, caught the Pay Rate History panel's crew numbers looking wrong
-- (including apparent decreases that aren't real) and asked: "If we need to, we can wire in the
-- employee roster report from Lifelenz and obtain the current pay information from there...
-- make sure we do not lose data here." That's exactly what this migration + its pull-script
-- counterpart do.
--
-- Root cause this fixes: crew pay rate in this app has NEVER been a real field — it's DERIVED
-- (src/engine/employee-pay-history.js's weeklyCrewRates(), Σearnings/Σhours from actual worked
-- shifts). That's inherently noisy (role mix, low-hour weeks, a raise lagging until it's
-- actually worked) and can show a "decrease" that never happened. LifeLenz's own
-- employee_roster_report endpoint (admin reporting API, same family already automated in
-- scripts/lifelenz-pull.mjs) carries a real, vendor-recorded CURRENT pay rate per employee,
-- crew included — the ground truth management already has via QSRSoft's roster pull
-- (qsr_employee_tenure.hourly_pay_rate). This table is crew's equivalent of that CURRENT-state
-- table; employee_pay_rate_changes (schema-employee-pay-rate-changes.sql, already exists) is
-- crew's equivalent of the CHANGE LOG, written with source='lifelenz_roster' alongside
-- management's existing source='qsr_tenure' rows — same table, same read-before-overwrite
-- diff pattern scripts/qsrsoft-employee-roster-pull.mjs already proves out (detectAndRecord
-- PayRateChanges reads the current value before the upsert below overwrites it).
--
-- PII: the LifeLenz employee_roster_report CSV returns SSN, DOB, full address, phone, email,
-- and emergency-contact fields alongside pay rate, with NO selectCols-style request param to
-- ask for fewer columns (unlike QSRSoft's roster endpoint) — the discipline has to live entirely
-- in how the pull script PARSES the response. This table only ever gets the columns the parser
-- explicitly reads: loc, name, job title, hire/restaurant-start date, pay rate, status,
-- termination date/reason. SSN/DOB/address/phone/email/emergency-contact are never parsed into
-- a row at all, so they can't land here even by accident — see
-- scripts/lifelenz-pull.mjs's parseEmployeeRosterCSV() for the exact allowlist-by-omission.
--
-- person_key: the roster report's response CSV does NOT echo back an employee ID (only
-- first/last name), even though the REQUEST takes a LifeLenz employment-id array. The pull
-- script resolves each row back to a real assigned_employment_id by exact (loc, name) match
-- against that SAME run's lifelenz_shift_assignments rows (the employee_ids it requested in the
-- first place came from there) — person_key is that real employment id whenever the match
-- succeeds. When it doesn't (a brand-new hire with no shifts yet, or an unresolvable duplicate
-- name at one store), person_key falls back to a visibly-synthetic 'name:<normalized name>' key
-- so the row still persists and is still diffable, just not joinable to the crew hours series.
create table if not exists public.lifelenz_employee_roster (
  tenant_id              uuid             not null default '00000000-0000-0000-0000-000000000001',
  loc                    text             not null,
  person_key             text             not null,
  full_name              text,
  job_title_code         text,
  hire_date              date,
  restaurant_start_date  date,
  status                 text,
  termination_date       date,
  termination_reason     text,
  pay_rate               double precision,
  updated_at             timestamptz      not null default now(),
  primary key (tenant_id, loc, person_key)
);

create index if not exists lifelenz_employee_roster_loc_idx on public.lifelenz_employee_roster (loc);

alter table public.lifelenz_employee_roster enable row level security;

-- Tenant isolation, matching the pattern used across every other operational table.
drop policy if exists "lifelenz_employee_roster: tenant" on public.lifelenz_employee_roster;
create policy "lifelenz_employee_roster: tenant" on public.lifelenz_employee_roster
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Role gate (RESTRICTIVE, ANDed with the tenant policy above) -- wage data is Owner/Admin/DO
-- only, same decision + same get_my_role() pattern as schema-employee-pay-rate-changes.sql /
-- schema-lifelenz-shift-pay.sql's identical policies.
drop policy if exists "lifelenz_employee_roster: role" on public.lifelenz_employee_roster;
create policy "lifelenz_employee_roster: role" on public.lifelenz_employee_roster
  as restrictive for select to authenticated
  using (get_my_role() in ('admin', 'owner', 'do'));

-- Per-location restriction for 'do' -- same my_locs() convention as every other loc-scoped
-- RESTRICTIVE policy in this schema; 'admin'/'owner' read my_locs() as NULL (unrestricted).
drop policy if exists "lifelenz_employee_roster: loc" on public.lifelenz_employee_roster;
create policy "lifelenz_employee_roster: loc" on public.lifelenz_employee_roster
  as restrictive for select to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

comment on table public.lifelenz_employee_roster is
  'Current-state snapshot of LifeLenz employee_roster_report, PII-stripped at parse time (see scripts/lifelenz-pull.mjs parseEmployeeRosterCSV) -- crew pay-rate ground truth, owner request 2026-11-05. History lives in employee_pay_rate_changes (source=''lifelenz_roster''), written by the pull script BEFORE this table''s own upsert overwrites pay_rate, same read-before-overwrite pattern scripts/qsrsoft-employee-roster-pull.mjs already proves for management.';
