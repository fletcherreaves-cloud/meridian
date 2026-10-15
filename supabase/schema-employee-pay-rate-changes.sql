-- ── Employee pay-rate change history (owner request 2026-10-15) ───────────────────────────────
-- "Can we do a report for pay rates to show history of each employee's wages and rates of pay.
-- I would envision being able to pull a report and see when a pay rate changes and be able to
-- have analysis on its expected impact to overall labor in the restaurant."
--
-- MANAGEMENT ONLY (GM/AM/DM/SM) -- hourly crew's rate history is derived on demand from
-- lifelenz_shift_pay's per-shift earnings/seconds (src/engine/employee-pay-history.js), never
-- persisted here. Management needs a real table because qsr_employee_tenure has NO history
-- mechanism at all: scripts/qsrsoft-employee-roster-pull.mjs upserts it on (tenant_id,loc,geid)
-- every run, so the prior hourly_pay_rate is simply gone the moment a new value lands -- there
-- is nothing to derive a history FROM for management, unlike crew's naturally append-only
-- per-shift data. This table is that script's own diff-and-insert, append-only, written
-- BEFORE each run's upsert overwrites the value being compared against.
--
-- `source` is always 'qsr_tenure' today -- the column exists so a later crew-side persistence
-- decision (if the on-demand derivation ever needs caching for performance) can reuse this same
-- table/shape without a migration, not because crew rows are written here now.
create table if not exists public.employee_pay_rate_changes (
  id              uuid             not null default gen_random_uuid() primary key,
  tenant_id       uuid             not null default '00000000-0000-0000-0000-000000000001',
  loc             text             not null,
  source          text             not null default 'qsr_tenure',
  person_key      text             not null,       -- geid (qsr_tenure) -- the stable QSRSoft person key
  employee_name   text,
  job_title       text,
  prior_rate      double precision,                  -- null on a person's first-ever observed rate (not a "change")
  new_rate        double precision not null,
  effective_date  date             not null,         -- the date this run observed the new rate
  detected_at     timestamptz      not null default now()
);

create index if not exists employee_pay_rate_changes_person_idx on public.employee_pay_rate_changes (loc, person_key, effective_date desc);

alter table public.employee_pay_rate_changes enable row level security;

-- Tenant isolation, matching the pattern used across every other operational table.
drop policy if exists "employee_pay_rate_changes: tenant" on public.employee_pay_rate_changes;
create policy "employee_pay_rate_changes: tenant" on public.employee_pay_rate_changes
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Role gate (RESTRICTIVE, ANDed with the tenant policy above) -- wage data is Owner/Admin/DO
-- only (owner decision, 2026-10-15). Same get_my_role()-based pattern and same real, CURRENT
-- role ids as schema-lifelenz-shift-pay.sql's identical policy -- see that file's own comment
-- for why schema-identity-vault.sql's 3-role comment is stale and not what to copy.
drop policy if exists "employee_pay_rate_changes: role" on public.employee_pay_rate_changes;
create policy "employee_pay_rate_changes: role" on public.employee_pay_rate_changes
  as restrictive for select to authenticated
  using (get_my_role() in ('admin', 'owner', 'do'));

-- Per-location restriction for 'do' -- same my_locs() convention as every other loc-scoped
-- RESTRICTIVE policy in this schema; 'admin'/'owner' read my_locs() as NULL (unrestricted).
drop policy if exists "employee_pay_rate_changes: loc" on public.employee_pay_rate_changes;
create policy "employee_pay_rate_changes: loc" on public.employee_pay_rate_changes
  as restrictive for select to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

comment on table public.employee_pay_rate_changes is
  'Append-only management (GM/AM/DM/SM) pay-rate change log (owner request 2026-10-15) -- written by scripts/qsrsoft-employee-roster-pull.mjs BEFORE its own upsert overwrites qsr_employee_tenure.hourly_pay_rate, since that table keeps no history on its own. Role-gated (Owner/Admin/DO only) -- see this file''s own header for why hourly crew is NOT stored here.';
