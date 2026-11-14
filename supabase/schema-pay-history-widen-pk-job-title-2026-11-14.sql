-- GH #1698 fix -- widen qsr_employee_pay_period_history's primary key to include job_title_code
-- (owner-run, 2026-11-14, confirmed live against the production DB via the Management API).
--
-- Root cause: the scheduled Pay History pull was failing on 15/28 stores ("ON CONFLICT DO
-- UPDATE command cannot affect row a second time") because QSRSoft genuinely returns two
-- distinct real rows when an employee works two different job titles within one pay period --
-- e.g. geid 200379134 had separate Regular-pay rows for two different roles in the same period,
-- each with its own hourly_pay_rate/total_hours/total_dollars. The old PK (tenant_id, loc, geid,
-- pay_type, period_start) couldn't tell those two rows apart, so the upsert batch collided on
-- the same conflict key twice in one statement.
--
-- Two options were weighed: (1) widen the PK to match the real data model (this migration --
-- permanent, no information loss, every current and future multi-title case just works), or
-- (2) merge colliding rows in the script before upsert (simpler, no DDL, but silently blends two
-- different jobs' hours/rate/dollars into one row forever -- a standing, recurring loss in a
-- table whose whole purpose is being the real historical wage ground truth). Chose (1).
--
-- job_title_code can come back null from QSRSoft (scripts/qsrsoft-pay-history-pull.mjs's
-- mapRow() maps it as `r.jobTitleCode ?? null` before this fix). A PRIMARY KEY column cannot be
-- nullable, so existing nulls are backfilled to '' (the same sentinel the pull script now writes
-- going forward -- see mapRow()'s `?? ''`) before the column goes NOT NULL with that default.
--
-- Applied and confirmed live 2026-11-14: 0 rows with job_title_code null after backfill; PK now
-- (tenant_id, loc, geid, pay_type, period_start, job_title_code), all 6 columns NOT NULL;
-- column_default for job_title_code is ''::text. Companion script fix in the same dispatch
-- updates mapRow()'s null-coalesce and saveRows()'s onConflict target to match.

update public.qsr_employee_pay_period_history set job_title_code = '' where job_title_code is null;

alter table public.qsr_employee_pay_period_history drop constraint qsr_employee_pay_period_history_pkey;
alter table public.qsr_employee_pay_period_history alter column job_title_code set not null;
alter table public.qsr_employee_pay_period_history alter column job_title_code set default '';
alter table public.qsr_employee_pay_period_history add primary key (tenant_id, loc, geid, pay_type, period_start, job_title_code);
