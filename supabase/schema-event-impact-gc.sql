-- ── Event Impact Registry: GC (guest-count) lift columns (Dispatch #108) ────────────────────────
-- Additive extension of supabase/schema-event-impact.sql. Owner asked for GC lift alongside the
-- existing sales lift for every event type, not just Sports. Mirrors the sales-lift columns 1:1,
-- computed by the SAME measureEventLift median-baseline/±28-day/K=10-shrink methodology
-- (src/engine/retail-events.js), just with opts.valueKey:'gc' over guest-count rows instead of
-- sales rows. Existing sales columns (home_impact/away_impact/measured_home/measured_away/
-- n_home/n_away) are completely untouched by this file — a store/type can carry sales lift, GC
-- lift, both, or neither, independently (data coverage differs: GC's source only backfills to
-- 2024-01-01, sales back to 2022-01-01 — see memory/dispatch-108.md Resolution).
--
-- GC source: qsr_daily_activity_rollup.transactions (the app's already-established canonical `gc`
-- source — src/engine/metric-source.js's `gc` chain leads with qsrActSummaryRows, which is this
-- table). Cross-validated against qsr_sales_mix.metrics.gross_sales_qty (exact match, spot-checked
-- store 3708 / 2026-08-01: both 979) — either table would answer the same number; this one is used
-- because it is already the app's canonical `gc` metric, not a new source being introduced.
--
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.
alter table public.event_impact add column if not exists gc_home_impact   numeric;  -- GC-lift fraction, home/primary case
alter table public.event_impact add column if not exists gc_away_impact  numeric;  -- GC-lift fraction, away case (sports only; null otherwise)
alter table public.event_impact add column if not exists measured_gc_home numeric; -- original measured GC seed (reset target)
alter table public.event_impact add column if not exists measured_gc_away numeric;
alter table public.event_impact add column if not exists n_gc_home       integer; -- sample size behind the GC measurement
alter table public.event_impact add column if not exists n_gc_away      integer;

-- No RLS change needed — event_impact's existing row-level policies (schema-event-impact.sql)
-- apply per-row regardless of which columns are read/written; a new column inherits the table's
-- policy automatically.

-- ── VERIFY ───────────────────────────────────────────────────────────────────────────────────────
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='event_impact' and column_name like 'gc_%' or column_name like '%_gc_%';
--   -- expect: gc_home_impact, gc_away_impact, measured_gc_home, measured_gc_away, n_gc_home, n_gc_away
