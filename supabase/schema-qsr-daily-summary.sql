-- ============================================================================
-- Meridian — qsr_daily_activity DAILY ROLLUP VIEW
-- ============================================================================
-- WHY: qsr_daily_activity is HOURLY — PK (loc, dt, hour_slot), ~675 rows/day across
-- 27 stores. A 60-day window is ~40,000 rows, which the client paginated in ~40
-- requests of 1000 and then summed by (loc, dt) in JavaScript.
--
-- Measured on production 2026-08-07: that single stream was the largest remaining
-- load AND the source of 18 of 22 HTTP 500s, failing in batches of exactly 6 — the
-- client's concurrency cap — because six concurrent 1000-row × 23-column queries is
-- more than the instance will serve at once.
--
-- This view does the same GROUP BY server-side. 27 stores × 60 days = ~1,620 rows,
-- which is ONE page instead of ~40. Roughly a 25x reduction on the single heaviest
-- stream, and the 6-concurrent-heavy-query pattern disappears with it.
--
-- ⚠️ SUMS ONLY, deliberately. Every derived metric (OEPE, R2P, KVS Time, KVS Healthy,
-- park %, TPPH, salesVsLY) stays in loadQsrActSummary's JS, where each carries the
-- comment recording the exact store/date it was reconciled against the QSRSoft report.
-- Re-deriving them in SQL would duplicate that math in a second place and invite the
-- two to drift. The view moves the aggregation, not the definitions.
--
-- Safe to run any time: creates a view, touches no data, changes no table. The client
-- falls back to the hourly path automatically if this view is absent, so deploying the
-- app before running this is fine.
-- ============================================================================

create or replace view public.qsr_daily_activity_daily as
select
  loc,
  dt,
  sum(coalesce(product_sales, 0))            as product_sales,
  sum(coalesce(transactions, 0))             as transactions,
  sum(coalesce(healthy_count, 0))            as healthy_count,
  sum(coalesce(unhealthy_count, 0))          as unhealthy_count,
  sum(coalesce(dt_untilserve, 0))            as dt_untilserve,
  sum(coalesce(dt_untilstore, 0))            as dt_untilstore,
  sum(coalesce(dt_trans_cnt, 0))             as dt_trans_cnt,
  sum(coalesce(dt_carsheld, 0))              as dt_carsheld,
  sum(coalesce(fc_untilserve, 0))            as fc_untilserve,
  sum(coalesce(fc_untilclosedrawer, 0))      as fc_untilclosedrawer,
  sum(coalesce(fc_trans_cnt, 0))             as fc_trans_cnt,
  -- MFY1 + MFY2 collapse to one pair here exactly as the client did when summing.
  sum(coalesce(mfy1_untilserve, 0) + coalesce(mfy2_untilserve, 0)) as mfy_untilserve,
  sum(coalesce(mfy1_trans_cnt, 0)  + coalesce(mfy2_trans_cnt, 0))  as mfy_trans_cnt,
  sum(coalesce(proj_total_transactions, 0))  as proj_total_transactions,
  sum(coalesce(proj_sales_dollars, 0))       as proj_sales_dollars,
  sum(coalesce(ly_product_sales, 0))         as ly_product_sales,
  sum(coalesce(ly_transactions, 0))          as ly_transactions,
  sum(coalesce(actual_punched_hours, 0))     as actual_punched_hours,
  sum(coalesce(total_needed_hours, 0))       as total_needed_hours
from public.qsr_daily_activity
group by loc, dt;

comment on view public.qsr_daily_activity_daily is
  'Per (loc, dt) rollup of the hourly qsr_daily_activity. Sums only — all derived metrics (OEPE, R2P, KVS, TPPH) remain in loadQsrActSummary so the reconciled definitions live in exactly one place.';

-- RLS: a view runs with the privileges of its owner and does NOT inherit the base
-- table's policies, so grant read to the same roles that can read the base table.
grant select on public.qsr_daily_activity_daily to authenticated, service_role;

-- ── VERIFY (expect identical numbers) ───────────────────────────────────────
--   select count(*) from public.qsr_daily_activity_daily;              -- ~27 × days
--   select loc, dt, product_sales, transactions
--     from public.qsr_daily_activity_daily
--    where dt = current_date - 2 order by loc limit 5;
--   -- must equal:
--   select loc, dt, sum(product_sales), sum(transactions)
--     from public.qsr_daily_activity where dt = current_date - 2
--    group by loc, dt order by loc limit 5;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop view if exists public.qsr_daily_activity_daily;
