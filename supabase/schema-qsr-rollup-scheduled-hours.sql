-- ── qsr_daily_activity_rollup: add total_scheduled_hours ─────────────────────
-- Issue #210 (Push 3) — split the labor gap two ways: Needed→Scheduled (planning accuracy,
-- coach the scheduler/forecast) vs Scheduled→Actual (execution, coach the shift manager).
-- The rollup table already sums actual_punched_hours and total_needed_hours, but never
-- total_scheduled_hours — even though qsr_daily_activity (the raw hourly table) has carried it
-- since the DAR pull script started writing it. Without this column, loadQsrActSummary's
-- rollup path (the one actually used in production — see the block comment above it) can never
-- distinguish "scheduled to plan but ran long" (execution) from "never scheduled to plan"
-- (planning), because it has no scheduled-hours figure at all.
--
-- CREATE TABLE for qsr_daily_activity_rollup is not checked into this repo (created ad hoc
-- against the live project) — this file only adds the one missing column, matching the
-- existing schema-qsr-rollup-dt-heldtime.sql convention for incremental ALTERs.
alter table public.qsr_daily_activity_rollup add column if not exists total_scheduled_hours float;

comment on column public.qsr_daily_activity_rollup.total_scheduled_hours is
  'Sum of total_scheduled_hours across the day''s hourly qsr_daily_activity rows. Needed to split the labor gap into planning accuracy (scheduled - needed) vs execution (actual - scheduled) — #210.';

-- Historical rows: scripts/qsrsoft-dar-pull.mjs's refreshRollup() now sums total_scheduled_hours
-- on every write, so new days and the normal recent-window re-pull backfill it automatically.
-- Rows older than that rolling window keep total_scheduled_hours NULL until either they age out
-- (60-90 day table) or the owner runs the pull once with QSRSOFT_DAR_FORCE_FULL=1 to re-cover
-- full history. Until then engine/labor-gap-split.js treats a week with any NULL row as
-- "scheduled hours unknown" (reports planningGapHrs/executionGapHrs as null, not a fabricated
-- number built on a partial sum) rather than silently under-reporting — same caution as
-- dt_heldtime, but that fix's "under-subtracts, same direction of error" grace does NOT apply
-- here: a missing scheduled-hours figure has no safe default direction to guess in.
