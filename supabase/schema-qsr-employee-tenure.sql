-- ============================================================================
-- qsr_employee_tenure — per-person tenure, dispatch #57 (#56 Part B, for real this time)
--
-- Reverses a deliberate decision. qsrsoft-employee-roster-pull.mjs's own header used to say
-- "No individual-employee data is stored anywhere" -- that pull only ever wrote AGGREGATE
-- counts (roster_role_counts). Owner-approved 2026-08-21 reversal: *"reverse it... Let's just
-- do it all. I can address the role level access to certain metrics/data later."* This table
-- is the storage half of that reversal. See memory/dispatch-57.md for full scoping.
--
-- 🔴 BOTH start dates, distinctly labelled -- the core of the dispatch. org_start_date =
-- joined the ORGANIZATION; store_start_date = joined THIS STORE. They diverge often and
-- hugely (one measured record: 8 years with the org, 2 months at this store) -- neither
-- reconstructs the other. NEVER render either as an unqualified "start date"; that reading is
-- wrong for every transferred employee, and transfers are exactly the people whose tenure gets
-- misjudged. job_title_code_start_date (time in current ROLE) is a third, distinct date --
-- arguably the most coaching-relevant of the three.
--
-- ⚠️ "0000-00-00" is QSRSoft's date-null sentinel, not an actual date -- it appears on
-- store_end_date and termination_entry_date for every active employee. Normalized to null by
-- the parser (src/engine/people-reports.js's cleanDate()) on ingest; never stored raw.
--
-- loc is PADDED to 7 chars, matching every other QSRSoft-sourced table. The API returns an
-- unpadded storeNum/homeLocation -- the pull script re-pads it with the SAME convention every
-- other pull script uses (padStart(7,'0')), not a second one.
--
-- PII: full_employee_name and hourly_pay_rate are stored here, on the owner's explicit
-- authorization ("do it all"). geid is QSRSoft's own stable person key -- the PK, and the join
-- key every OTHER panel should keep using; this table storing a name is not a licence for
-- other panels to start rendering names directly (the identity vault stays the reveal path for
-- the security panel). hourly_pay_rate is stored but the owner explicitly deferred surfacing it
-- ("I can address the role level access to certain metrics/data later") -- do not render pay in
-- any panel until that access model exists; an unrendered column is easy to gate later, a
-- rendered one is not.
--
-- 🚫 What stays excluded (unchanged from the pre-existing SELECT_COLS discipline): ssn,
-- dateOfBirth/birthday, nationalOrigin, gender, federalMaritalStatus, address fields,
-- emailAddress, phone numbers, emergency contacts. ssn must never leave QSRSoft; the
-- protected-class attributes (nationalOrigin/gender/dateOfBirth/federalMaritalStatus) must
-- never sit beside performance data where an auto-correlation feature (the Signals Scanner)
-- could compute a metric split by race/age/sex by accident. Guarded in the pull script by
-- assertNoDeniedSelectCols().
--
-- tenant_id + accessible_locs-scoped read RLS (per the dispatch's own instruction: "like every
-- other table"), NOT the plain tenant-only pattern -- this table carries a name and a pay rate
-- per person, so read access should track the same accessible_locs a user's profile already
-- scopes every other per-store view by. Write is service-role only (automated pull).
-- Safe to run top-to-bottom; idempotent. Expected: "Success. No rows returned."
-- ============================================================================

create table if not exists public.qsr_employee_tenure (
  tenant_id                  uuid        not null default '00000000-0000-0000-0000-000000000001',
  loc                        text        not null,               -- padded, e.g. '0003708'
  geid                       text        not null,                -- QSRSoft's stable person key -- the PK, not a name
  full_employee_name         text,                                -- PII, owner-approved -- see header
  employment_status          text,
  location_type              text,
  org_start_date             date,                                -- joined the ORGANIZATION -- see header, never conflate with store_start_date
  store_start_date           date,                                -- joined THIS STORE
  store_end_date             date,
  termination_entry_date     date,
  termination_reason         text,
  job_title_code              numeric,
  job_code_type               text,
  job_title_code_description  text,
  job_title_code_start_date   date,                                -- time in current ROLE -- a third, distinct date
  hourly_pay_rate             numeric,                             -- stored, NOT surfaced in any panel yet -- see header
  updated_at                  timestamptz not null default now(),
  primary key (tenant_id, loc, geid)
);

alter table public.qsr_employee_tenure enable row level security;

create policy "qsr_employee_tenure: read scoped" on public.qsr_employee_tenure for select
  to authenticated
  using (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.accessible_locs is null or public.qsr_employee_tenure.loc = any (p.accessible_locs))
    )
  );

-- Write: service role only -- entirely computed/automated, never user-entered.
create policy "qsr_employee_tenure: write service role" on public.qsr_employee_tenure
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create index if not exists qsr_employee_tenure_loc_idx on public.qsr_employee_tenure (loc);

comment on table public.qsr_employee_tenure is
  'Per-person tenure (dispatch #57, #56 Part B) -- both org_start_date and store_start_date, distinctly labelled, never conflated. Reverses the prior aggregate-only decision on qsrsoft-employee-roster-pull.mjs. hourly_pay_rate stored but not yet surfaced in any panel (owner deferred role-gating). RLS is accessible_locs-scoped, not the plain tenant-only pattern -- see schema-qsr-security-events.sql for the same distinction on a different table.';

-- ── VERIFY (expect real numbers once the workflow has run at least once) ──────────────────────
--   select count(*) from public.qsr_employee_tenure;
--   select loc, geid, full_employee_name, org_start_date, store_start_date
--     from public.qsr_employee_tenure order by updated_at desc limit 5;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop table if exists public.qsr_employee_tenure;
