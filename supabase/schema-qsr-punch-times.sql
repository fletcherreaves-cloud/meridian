-- ============================================================================
-- qsr_punch_times — actual clock punches (shift + meal), dispatch #124, un-tokenized by #126
--
-- Built on memory/finding-qsrsoft-time-punches-endpoint-2026-08-21.md's live capture and
-- memory/dispatch-124.md's scope. Companion to dispatch #123 (Crew Schedule Lookup, LifeLenz-
-- side) — a SEPARATE table, deliberately no shared migration file.
--
-- 🔴 THE SOURCE ENDPOINT CAN RETURN SSNs AND FULL LEGAL NAMES. This table stores NEITHER, and
-- that is UNCHANGED by dispatch #126 below. scripts/qsrsoft-punch-times-pull.mjs's SELECT_COLS
-- allowlist never requests ssn or a name field FROM THE PUNCH ENDPOINT ITSELF, guarded at import
-- time by assertNoDeniedSelectCols() — see that script's header for the full reasoning. This
-- table's columns are exactly, and only, the safe fields the finding documented: geid, loc,
-- punch_type, is_paid_break, start/end_date_time, in/out_modified, job_title_code, badge_type —
-- plus employee_name and emp_token, BOTH resolved via a wholly separate, already-owner-approved
-- table (qsr_employee_tenure), never from the punch endpoint (see below). NO ssn, NO
-- time_card_number (finding: "often null; not a reliable key" — excluded, not just unrequested).
--
-- 🎯 IDENTITY: geid is QSRSoft's own stable person key. Independently confirmed in the dispatch's
-- own session (live query, service-role credential, 1000 rows each) that geid occupies the SAME
-- identifier space as audit_rows.emp_id (digit-length band ranges match almost exactly across
-- 6/7/8/9-digit geids; audit_rows' own '0' sentinel for "no geid captured" also matched). geid is
-- NEVER null on a saved row (the pull filters out anything missing one).
--
-- 🔓 DISPATCH #126 (2026-08-25) — un-tokenization. Owner, directly, after this table shipped
-- tokenized-only: "there is no reason to hide names for scheduling and punch times > everyone can
-- see this data as-is." employee_name is now the PRIMARY resolved-identity column, populated by
-- the pull script via the SAME qsr_employee_tenure.(loc,geid) → full_employee_name join that
-- always ran here (this is NOT sourced from the punch endpoint itself, which is never asked for a
-- name field -- SELECT_COLS/assertNoDeniedSelectCols on that endpoint are unchanged by this
-- migration). Nullable -- a geid with no matching qsr_employee_tenure row has no name to resolve;
-- geid remains the reliable fallback join key in that case.
--
-- emp_token is KEPT (not dropped), additive and NULLABLE alongside employee_name -- a documented,
-- no-wrong-answer choice (dispatch #126): harmless to leave, costs nothing extra beyond what the
-- name lookup already does, and stays available as a stable join key against another name-keyed
-- vault entry (e.g. dispatch #125's LifeLenz-side data, if that side also keeps emp_token) without
-- an exact-string name match across two independently-formatted sources. Still resolved via the
-- SAME name-keyed identity vault get_or_create_employee_token() uses. See the pull script's own
-- header comment for the full reasoning, including the one open caveat: emp_token equality across
-- QSRSoft and LifeLenz has not been verified for exact name-string parity (a QSRSoft "Last, First"
-- vs. a LifeLenz "First Last" would silently produce two different tokens for the same person) --
-- employee_name and geid are the fields to rely on directly.
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
  employee_name     text,                                 -- resolved via qsr_employee_tenure, dispatch #126 -- nullable, see header
  emp_token         uuid        references public.employee_identity_vault(id), -- nullable, kept alongside employee_name, see header
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

-- Idempotent for a table already live in production (dispatch #124 -> #126): the create table
-- above is a no-op once the table exists, so this alter is what actually lands employee_name on
-- an existing deployment. Safe to re-run -- "add column if not exists" is a no-op once applied.
alter table public.qsr_punch_times add column if not exists employee_name text;

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
  'Actual clock punches (shift+meal), dispatch #124, un-tokenized by dispatch #126 (2026-08-25, owner directive: "no reason to hide names for scheduling and punch times"). NO ssn -- the punch endpoint itself (people/time-punches-matched) is never asked for a name or ssn field, see finding-qsrsoft-time-punches-endpoint-2026-08-21.md and the pull script header. geid is the reliable person key (confirmed same identity space as audit_rows.emp_id). employee_name is resolved via a SEPARATE qsr_employee_tenure name lookup (not from the punch endpoint) and is nullable -- no matching tenure row means no name to resolve, geid remains the fallback. emp_token is additive/nullable alongside employee_name, resolved into the SAME vault dispatch #123 uses. No business-day derivation applied -- raw timestamps only, boundary unconfirmed.';

-- ── ONE-TIME BACKFILL (dispatch #126) — resolve employee_name for rows collected before this
-- migration (PR #724 has been live since 2026-08-25, so qsr_punch_times already holds real rows
-- with employee_name still null). Same join the pull script now performs going forward. Idempotent
-- and safe to re-run: only touches rows where employee_name is still null, so a partial run (or a
-- later qsr_employee_tenure pull resolving a name that was previously missing) fills the remaining
-- gap without re-writing rows that already resolved. NOT run against production from this sandbox
-- -- no live Supabase credential is available here (see CLAUDE.md's "agent session's environment
-- is fixed at container start" + "a live-data claim must name the credential" rules). Handed off
-- for the owner or a future session with SUPABASE_SERVICE_ROLE_KEY to execute; report back
-- before/after row counts (see the VERIFY queries below for the counts to compare).
update public.qsr_punch_times pt
set employee_name = t.full_employee_name
from public.qsr_employee_tenure t
where pt.tenant_id = t.tenant_id
  and pt.loc = t.loc
  and pt.geid = t.geid
  and pt.employee_name is null
  and t.full_employee_name is not null
  and btrim(t.full_employee_name) <> '';

-- ── VERIFY (expect real numbers once the workflow has run at least once) ──────────────────────
--   select count(*) from public.qsr_punch_times;
--   select loc, geid, employee_name, punch_type, start_date_time, end_date_time, in_modified, out_modified
--     from public.qsr_punch_times order by updated_at desc limit 5;
--   select count(*) filter (where employee_name is not null) as name_resolved,
--          count(*) filter (where emp_token is not null) as token_resolved,
--          count(*) as total
--     from public.qsr_punch_times;
-- Run this BEFORE and AFTER the one-time backfill above to get the before/after row counts
-- dispatch #126's verification bar asks for.

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop table if exists public.qsr_punch_times;
