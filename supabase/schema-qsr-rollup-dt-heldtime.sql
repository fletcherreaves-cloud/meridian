-- ── qsr_daily_activity_rollup: add dt_heldtime ───────────────────────────────
-- Issue #183 (#184 dispatch item 3). The rollup table sums dt_carsheld (a COUNT of held
-- cars, used for park %) but never summed dt_heldtime (the actual held TIME, seconds*1000,
-- needed to compute OEPE excluding parked time). Without this column loadQsrActSummary's
-- OEPE stayed the WITH-park variant even after the app-wide formula switch, because there was
-- nothing to subtract.
--
-- CREATE TABLE for qsr_daily_activity_rollup is not checked into this repo (created ad hoc
-- against the live project before this was set up as a tracked schema) — this file only adds
-- the one missing column, matching the existing schema-glimpse-meal-counts.sql convention for
-- incremental ALTERs.
alter table public.qsr_daily_activity_rollup add column if not exists dt_heldtime float;

comment on column public.qsr_daily_activity_rollup.dt_heldtime is
  'Sum of dt_heldtime (held/parked drive-thru time, µs*1000) across the day''s hourly rows. Needed for OEPE excluding parked time (#183) — dt_carsheld alone is a COUNT, not a time.';

-- Historical rows: scripts/qsrsoft-dar-pull.mjs's refreshRollup() now sums dt_heldtime on every
-- write, so new days and the normal recent-window re-pull backfill it automatically. Rows older
-- than that rolling window keep dt_heldtime NULL until either they age out (60-90 day table) or
-- the owner runs the pull once with QSRSOFT_DAR_FORCE_FULL=1 to re-cover full history. Until
-- then loadQsrActSummary's oepe falls back gracefully (NULL heldtime treated as 0, same as the
-- hourly path's coalesce) rather than erroring — it just under-subtracts for those older rows,
-- same direction of error as before this fix, not a new failure mode.
