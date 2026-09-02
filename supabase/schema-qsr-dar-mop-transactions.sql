-- ── qsr_daily_activity / qsr_daily_activity_rollup: add mop_transactions ─────
-- backlog-master-2026-08-19.md: "MOP/app transactions (mop_transactions) not yet added to the
-- DAR pull" -- confirmed still open (memory/project-qsrsoft-dar-columns.md: "MOP GC =
-- mop_transactions (app order+pay -- we don't pull this yet)"), field name taken verbatim from
-- QSRSoft's own extracted columnFactory bundle (2026-07-21), not guessed.
--
-- Confirmed missing live (service-role read, 2026-09-02): a select on qsr_daily_activity for
-- mop_transactions returns 42703 "column does not exist". This is the one column scripts/
-- qsrsoft-dar-pull.mjs's next scheduled run needs before it starts requesting the field --
-- run this BEFORE the code change lands on main, matching the sequencing the rest of today's
-- pulls used (schema first, confirm, then dispatch/rely on the cron).
--
-- CREATE TABLE for qsr_daily_activity / qsr_daily_activity_rollup is not checked into this repo
-- (created ad hoc against the live project) -- this file only adds the one missing column each,
-- matching the existing schema-qsr-rollup-dt-heldtime.sql / schema-qsr-rollup-scheduled-hours.sql
-- convention for incremental ALTERs. Types match their sibling transaction-count columns exactly
-- (checked live via the PostgREST OpenAPI definitions): hourly table's own transaction counts
-- (transactions/dt_transactions/is_transactions) are all `integer default 0`; the rollup's summed
-- counterparts (transactions/dt_trans_cnt/dt_carsheld) are all `numeric` (JS-summed then upserted).

alter table public.qsr_daily_activity add column if not exists mop_transactions integer default 0;
alter table public.qsr_daily_activity_rollup add column if not exists mop_transactions numeric;

comment on column public.qsr_daily_activity.mop_transactions is
  'Mobile Order & Pay guest count for the hour (app order+pay transactions) -- QSRSoft raw field mop_transactions, one hourly leg alongside dt_transactions/is_transactions. Historically not requested by the DAR pull; NULL/0 on rows pulled before this column existed until a re-pull covers them.';
comment on column public.qsr_daily_activity_rollup.mop_transactions is
  'Sum of qsr_daily_activity.mop_transactions across the day''s hourly rows -- same MOP guest count, daily grain.';

-- Historical backfill: scripts/qsrsoft-dar-pull.mjs's normal rolling re-pull window (recent ~4-7
-- days) will populate this going forward automatically once the column exists and the code change
-- ships. Older rows keep mop_transactions NULL/0 until either they age out or the owner re-runs
-- the pull with QSRSOFT_DAR_FORCE_FULL=1 (full DAYS_BACK) or an explicit QSRSOFT_DAR_START_DATE/
-- END_DATE window to re-cover a specific range -- same recovery path dt_heldtime (#183) used.
