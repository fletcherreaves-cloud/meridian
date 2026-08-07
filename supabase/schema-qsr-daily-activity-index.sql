-- ============================================================================
-- Meridian — index qsr_daily_activity on dt
-- ============================================================================
-- MEASURED PROBLEM (production, 2026-08-07): the daily rollup view took 2.70s idle
-- with service_role, and 18.7s under startup contention with an authenticated
-- session — where it hit the statement timeout and returned HTTP 500. The client
-- then fell back to hourly pagination, which 500'd twice as well.
--
-- CAUSE: the primary key is (loc, dt, hour_slot) — leading column `loc`. Every query
-- this table serves filters on `dt` ("last N days"), which a loc-leading index cannot
-- satisfy, so each one seq-scans all 367,562 rows. The rollup view didn't create that
-- cost; it made it visible by doing the scan once instead of forty times.
--
-- This helps BOTH paths — the view and the hourly fallback — and every other
-- dt-filtered query against this table (Smart Targets, Signals, SAGE).
--
-- CONCURRENTLY so it does not lock the table against the running DAR pulls.
-- ⚠️ Must be run OUTSIDE a transaction block. In the Supabase SQL Editor, run this
-- file BY ITSELF — the editor wraps multi-statement scripts in a transaction and
-- CREATE INDEX CONCURRENTLY will fail with "cannot run inside a transaction block".
-- ============================================================================

create index concurrently if not exists qsr_daily_activity_dt_idx
  on public.qsr_daily_activity (dt);

-- ── VERIFY ──────────────────────────────────────────────────────────────────
--   select indexname, indexdef from pg_indexes
--    where tablename = 'qsr_daily_activity';
--
--   -- should now show an Index Scan on qsr_daily_activity_dt_idx, not a Seq Scan:
--   explain analyze
--   select loc, dt, sum(product_sales) from public.qsr_daily_activity
--    where dt >= current_date - 60 group by loc, dt;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop index concurrently if exists public.qsr_daily_activity_dt_idx;
