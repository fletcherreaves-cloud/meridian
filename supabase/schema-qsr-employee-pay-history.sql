-- ── QSRSoft employee pay-period history — real historical wage ground truth (owner request,
-- 2026-11-05, same day as the LifeLenz crew-roster pay-rate work) ─────────────────────────────
--
-- Owner surfaced QSRSoft's own employee-pay-details endpoint mid-session while reviewing the
-- LifeLenz-based crew pay-rate fix: "we can also infer wages in the past from this report."
-- Measured live (service-role + a real QSRSoft Cognito token, 2026-11-05) against store 33109:
--   - Real per-pay-period rows going back to at least 2020-08-05 (6+ years) -- far deeper than
--     any history the LifeLenz roster snapshot (schema-lifelenz-employee-roster.sql) can ever
--     build, since that one only starts accumulating a trail from whenever it first runs.
--   - payType cleanly separates 'Regular' and 'Overtime' as DISTINCT rows per period, and
--     Overtime's hourlyPayRate is exactly 1.5x the Regular row's rate across every pair sampled
--     ($10->$15, $11.10->$16.65, $9.75->$14.63) -- a real, already-clean straight-time rate with
--     zero OT-contamination risk, no derivation needed (unlike the LifeLenz-shift-pay-derived
--     crew rate, which required splitting earnings by payType to avoid exactly this problem --
--     see memory/finding-crew-pay-rate-ot-blending-2026-11-05.md).
--   - isFinal flags whether a pay period is locked/settled (9.8% of a sampled window were 'N',
--     still in progress) -- kept as its own column so consumers can choose whether to trust an
--     in-progress period, not silently dropped.
--   - ONE endpoint covers BOTH crew and management (confirmed job titles: "CREW PERSON",
--     "CERT. SWING MGR."), keyed by the SAME geid already used by qsr_employee_tenure /
--     employee_pay_rate_changes for management.
--
-- Architecture (owner-confirmed 2026-11-05): this table becomes the PRIMARY source for Pay Rate
-- History going forward, backfilled as deep as the data supports. The two mechanisms shipped
-- earlier the same day/session -- LifeLenz's lifelenz_employee_roster snapshot-diff for crew,
-- and qsr_employee_tenure's own diff for management -- are NOT removed; they stay as fallback/
-- cross-check (per CLAUDE.md's standing caution against unilaterally retiring a shipped,
-- tested mechanism without separately verifying nothing else depends on it staying primary).
--
-- PII: this table stores NO name, address, phone, email, or SSN -- selectCols requested from
-- QSRSoft is an explicit allowlist (see scripts/qsrsoft-pay-history-pull.mjs's SELECT_COLS +
-- assertNoDeniedSelectCols(), same guard pattern as every other QSRSoft pull in this repo).
-- geid is the person key; a display name is resolved by joining to qsr_employee_tenure at read
-- time, same pattern scripts/qsrsoft-punch-times-pull.mjs already uses for punch data.
create table if not exists public.qsr_employee_pay_period_history (
  tenant_id       uuid             not null default '00000000-0000-0000-0000-000000000001',
  loc             text             not null,
  geid            text             not null,
  pay_type        text             not null,        -- 'Regular' | 'Overtime', raw passthrough (never matched against a hardcoded enum)
  period_start    date             not null,
  period_end      date,
  hourly_pay_rate double precision,
  total_hours     double precision,
  total_dollars   double precision,
  is_final        boolean,
  job_title_code  text,
  updated_at      timestamptz      not null default now(),
  primary key (tenant_id, loc, geid, pay_type, period_start)
);

create index if not exists qsr_employee_pay_period_history_loc_idx on public.qsr_employee_pay_period_history (loc);
create index if not exists qsr_employee_pay_period_history_geid_idx on public.qsr_employee_pay_period_history (geid, period_start desc);

alter table public.qsr_employee_pay_period_history enable row level security;

drop policy if exists "qsr_employee_pay_period_history: tenant" on public.qsr_employee_pay_period_history;
create policy "qsr_employee_pay_period_history: tenant" on public.qsr_employee_pay_period_history
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Role gate (RESTRICTIVE, ANDed with the tenant policy above) -- wage data is Owner/Admin/DO
-- only, same decision + same get_my_role() pattern as every other wage table in this schema
-- (schema-employee-pay-rate-changes.sql, schema-lifelenz-shift-pay.sql, schema-lifelenz-
-- employee-roster.sql).
drop policy if exists "qsr_employee_pay_period_history: role" on public.qsr_employee_pay_period_history;
create policy "qsr_employee_pay_period_history: role" on public.qsr_employee_pay_period_history
  as restrictive for select to authenticated
  using (get_my_role() in ('admin', 'owner', 'do'));

drop policy if exists "qsr_employee_pay_period_history: loc" on public.qsr_employee_pay_period_history;
create policy "qsr_employee_pay_period_history: loc" on public.qsr_employee_pay_period_history
  as restrictive for select to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

comment on table public.qsr_employee_pay_period_history is
  'Real historical pay-period wage data from QSRSoft employee-pay-details, geid-keyed, crew AND management in one table (owner request 2026-11-05). Regular/Overtime are separate rows with Overtime already at the real 1.5x rate -- no derivation needed. No PII beyond geid. See memory/finding-qsr-employee-pay-history-2026-11-05.md for the full measurement and architecture decision.';
