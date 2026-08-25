-- ============================================================================
-- qsr_punch_times — actual clock punches (shift + meal), dispatch #124
--
-- Built on memory/finding-qsrsoft-time-punches-endpoint-2026-08-21.md's live capture and
-- memory/dispatch-124.md's scope. Companion to dispatch #123 (Crew Schedule Lookup, LifeLenz-
-- side) — a SEPARATE table, deliberately no shared migration file.
--
-- 🔴 THE SOURCE ENDPOINT CAN RETURN SSNs AND FULL LEGAL NAMES. This table stores NEITHER.
-- scripts/qsrsoft-punch-times-pull.mjs's SELECT_COLS allowlist never requests ssn or a name
-- field, guarded at import time by assertNoDeniedSelectCols() — see that script's header for the
-- full reasoning. This table's columns are exactly, and only, the safe fields the finding
-- documented: geid, loc, punch_type, is_paid_break, start/end_date_time, in/out_modified,
-- job_title_code, badge_type — plus emp_token (see below). NO ssn, NO name, NO
-- time_card_number (finding: "often null; not a reliable key" — excluded, not just unrequested).
--
-- 🎯 IDENTITY: geid is QSRSoft's own stable person key. Independently confirmed in the dispatch's
-- own session (live query, service-role credential, 1000 rows each) that geid occupies the SAME
-- identifier space as audit_rows.emp_id (digit-length band ranges match almost exactly across
-- 6/7/8/9-digit geids; audit_rows' own '0' sentinel for "no geid captured" also matched). geid is
-- NEVER null on a saved row (the pull filters out anything missing one).
--
-- emp_token is ADDITIVE and NULLABLE, resolved by the pull script via
-- qsr_employee_tenure.(loc,geid) → full_employee_name → get_or_create_employee_token() — the
-- SAME name-keyed identity vault dispatch #123's LifeLenz-side tokenization uses, so a resolved
-- emp_token lives in the same space as #123's join key, NOT a geid-derived pseudo-token. Null
-- when the geid has no matching qsr_employee_tenure row (e.g. separated before ever appearing in
-- an active-only roster pull) — geid remains the reliable fallback join key in that case. See the
-- pull script's own header comment for the full reasoning, including the one open caveat: this
-- has not been verified against dispatch #123's actual output (which doesn't exist in this repo
-- yet) for exact name-string parity between QSRSoft and LifeLenz.
--
-- 🟡 BUSINESS-DAY BOUNDARY: NOT CONFIRMED (no compType parameter on this endpoint, and this
-- dispatch had no live QSRSoft credentials to check real punch timestamps directly). So
-- start_date_time/end_date_time are stored as RAW timestamps with NO derived business-day `dt`
-- column — a consumer that needs day-bucketed punches must apply businessDate()/
-- lastClosedBusinessDay() (src/utils/date.js) or a calendar-day bucket EXPLICITLY, as a conscious
-- choice, never assumed already-done by this table. See the pull script's header for detail.
--
-- PK is (tenant_id, loc, geid, punch_type, start_date_time) — the best available natural key
-- given the endpoint exposes no punch ID (time_card_number is documented unreliable/often null).
-- KNOWN LIMITATION: if a punch is edited (in_modified/out_modified=true) such that its
-- start_date_time itself changes, a re-pull inserts a NEW row rather than replacing the old one
-- (the old start_date_time is a different key) — there is no better key available to fix this
-- without an endpoint-provided punch ID. Documented, not silently accepted.
--
-- tenant_id + accessible_locs-scoped read RLS, matching qsr_employee_tenure's own pattern (this
-- table carries a resolvable-to-name identity via emp_token, same sensitivity class). Write is
-- service-role only (automated pull). Safe to run top-to-bottom; idempotent.
-- ============================================================================

create table if not exists public.qsr_punch_times (
  tenant_id         uuid        not null default '00000000-0000-0000-0000-000000000001',
  loc               text        not null,               -- padded, e.g. '0003708'
  geid              text        not null,                -- QSRSoft's stable person key -- never a name
  emp_token         uuid        references public.employee_identity_vault(id), -- nullable, see header
  punch_type        text        not null,                -- 'shift' | 'meal' (raw passthrough, no hardcoded enum)
  is_paid_break     boolean,                              -- null on shift rows per the finding
  start_date_time   timestamptz not null,
  end_date_time     timestamptz,
  in_modified       boolean,                              -- punch-edit flag -- real loss-prevention signal, unconsumed today
  out_modified      boolean,                              -- punch-edit flag -- real loss-prevention signal, unconsumed today
  job_title_code    numeric,
  badge_type        text,                                 -- raw passthrough, no hardcoded enum (only 'Primary' seen so far)
  updated_at        timestamptz not null default now(),
  primary key (tenant_id, loc, geid, punch_type, start_date_time)
);

alter table public.qsr_punch_times enable row level security;

create policy "qsr_punch_times: read scoped" on public.qsr_punch_times for select
  to authenticated
  using (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.accessible_locs is null or public.qsr_punch_times.loc = any (p.accessible_locs))
    )
  );

-- Write: service role only -- entirely computed/automated, never user-entered.
create policy "qsr_punch_times: write service role" on public.qsr_punch_times
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create index if not exists qsr_punch_times_loc_idx on public.qsr_punch_times (loc);
create index if not exists qsr_punch_times_geid_idx on public.qsr_punch_times (geid);
create index if not exists qsr_punch_times_emp_token_idx on public.qsr_punch_times (emp_token);
create index if not exists qsr_punch_times_start_idx on public.qsr_punch_times (start_date_time);

comment on table public.qsr_punch_times is
  'Actual clock punches (shift+meal), dispatch #124. NO ssn, NO name, NO time_card_number -- see finding-qsrsoft-time-punches-endpoint-2026-08-21.md and the pull script header. geid is the reliable person key (confirmed same identity space as audit_rows.emp_id); emp_token is additive/nullable, resolved via qsr_employee_tenure name lookup into the SAME vault dispatch #123 uses. No business-day derivation applied -- raw timestamps only, boundary unconfirmed.';

-- ── VERIFY (expect real numbers once the workflow has run at least once) ──────────────────────
--   select count(*) from public.qsr_punch_times;
--   select loc, geid, punch_type, start_date_time, end_date_time, in_modified, out_modified
--     from public.qsr_punch_times order by updated_at desc limit 5;
--   select count(*) filter (where emp_token is not null) as resolved, count(*) as total
--     from public.qsr_punch_times;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop table if exists public.qsr_punch_times;
