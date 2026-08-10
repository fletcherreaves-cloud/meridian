-- ============================================================================
-- Meridian — qsr_daily_activity DAILY ROLLUP VIEW  ⛔ SUPERSEDED, DO NOT USE
-- ============================================================================
-- ⛔ SUPERSEDED 2026-08-07 by the rollup TABLE `qsr_daily_activity_rollup`. Nothing
-- in src/ reads this view. Kept only as the record of WHY a view lost, because the
-- reasoning is easy to rediscover and get wrong — as happened on 2026-08-10.
--
-- A view over an RLS-protected base table is an RLS bypass unless it is declared
-- `security_invoker = true`. Both variants were tried on production 2026-08-07:
--   • WITHOUT security_invoker — bypassed RLS entirely; it served per-store sales
--     to the public anon key. Unacceptable.
--   • WITH security_invoker (as written below) — correct, but it evaluates RLS per
--     row while aggregating 367k rows and hits the STATEMENT TIMEOUT on the real
--     60-day workload. A single filtered day still returns fine, which is exactly
--     what makes this trap convincing: it verifies green and then fails in use.
-- The table wins because it carries its own tenant_id, has cheap policies over
-- ~15,000 indexed rows, and pays the aggregation cost once at write time.
--
-- HOW THIS FILE WASTED TIME (worth reading before "fixing" something similar):
-- loadQsrActSummary's header comment still claimed it "prefers the server-side
-- rollup view (supabase/schema-qsr-daily-summary.sql)" long after the code moved to
-- the table. The issue #119 RLS audit read this view's missing GRANT as a live gap,
-- required a security_invoker fix for it, and had the owner run the file — recreating
-- abandoned infrastructure. Harmless (the grant is authenticated/service_role only,
-- and the anon key gets 42501 permission denied — verified 2026-08-10), but avoidable.
-- The audit checked whether the SQL was SAFE and never asked whether the view was
-- still WANTED. Ask that first.
--
-- TO REMOVE IT (safe — no consumer in src/, and scripts/measure-denominator-floors.mjs
-- was repointed at the table on 2026-08-10):
--   drop view if exists public.qsr_daily_activity_daily;
-- ============================================================================
-- ⚠️ RE-APPLY NOTE (2026-08-10, issue #119 audit): the live authenticated role
-- currently gets "permission denied for view qsr_daily_activity_daily" — the
-- `grant select ... to authenticated` at the bottom of this file (unchanged,
-- still correct) was apparently never actually run against production, or was
-- run before the view's most recent `create or replace`. This file is idempotent;
-- re-running it as-is (SQL editor) fixes it. Verify after with:
--   node scripts/rls-table-audit.mjs   -- qsr_daily_activity_daily should flip to OK
--
-- ⚠️ SECURITY FIX (2026-08-10, PM review on issue #119's PR): the comment two
-- sections down ("a view runs with the privileges of its owner") is more serious
-- than it was originally treated as. By DEFAULT, Postgres applies a view's ROW
-- SECURITY policies using the VIEW OWNER's rights, not the querying role's —
-- meaning re-applying the grant above, as originally written, would have handed
-- EVERY authenticated user (any tenant, any accessible_locs restriction) every
-- row of qsr_daily_activity through this view, even though the base table itself
-- is correctly scoped by both tenant_id (schema-multitenant-phase2-rls.sql) and
-- accessible_locs (schema-rls-phase2-loc.sql — qsr_daily_activity is literally the
-- table my_locs() was proven against). A view is an RLS bypass unless declared
-- otherwise. Fixed below with `security_invoker = true` (PostgreSQL 15+), which
-- makes the view apply the CALLING role's own RLS policies instead of the
-- owner's. Measured, not assumed: this project's PostgREST OpenAPI root
-- (`GET /rest/v1/`) reports `info.version: "14.5"` — PostgREST populates that
-- field from the connected server's Postgres version, but this is the only view
-- in supabase/, so there's no other precedent in this repo proving 15+, and this
-- environment has no direct psql connection to double-check with `SHOW
-- server_version`. If this project is actually on Postgres 14, `security_invoker`
-- is invalid syntax there (added in 15) and this statement will fail loudly and
-- immediately when run — a safe failure, not a silent bypass — rather than
-- appearing to work. Owner: confirm the actual version in the Supabase dashboard
-- (Project Settings → Infrastructure) before running this file.
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

create or replace view public.qsr_daily_activity_daily
with (security_invoker = true) as
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

-- RLS: `security_invoker = true` above makes this view apply the CALLING role's
-- RLS policies (tenant + accessible_locs, same as the base table) instead of the
-- view owner's — so it's now safe to grant broad SELECT: the base table's row
-- security still does the actual scoping per caller, exactly as if they'd queried
-- qsr_daily_activity directly.
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
--
--   -- Also confirm the invoker-rights fix actually restricts a restricted caller:
--   -- log in as (or impersonate) a profile with a non-null accessible_locs, and
--   -- confirm this view returns ONLY that profile's locs — not the full district.

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop view if exists public.qsr_daily_activity_daily;
