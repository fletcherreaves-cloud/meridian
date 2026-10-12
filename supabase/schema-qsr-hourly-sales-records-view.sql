-- qsr_hourly_sales_records — supports the "Record Hour" tab (Record Day panel, store-dash.js's
-- LeaderboardPanel). Run this once in the Supabase SQL editor; safe to re-run (create or replace).
--
-- The feature: per-store all-time best single CLOCK-HOUR by sales (and the breakfast/regular-menu
-- split within it), reusing the existing hourly qsr_daily_activity table (hour_slot is a fixed
-- clock-hour bucket, e.g. "06:00" = 5am-6am -- see this repo's CLAUDE.md "4am business day"
-- section). This is explicitly a clock-hour APPROXIMATION, not a true rolling 60-minute window --
-- no 15-minute sales data is pulled anywhere today (confirmed live 2026-10-12: qsr_daily_activity
-- is the finest grain available). The owner chose "ship the fast approximation now" over waiting
-- on a true quarter-hour pull (tracked separately; QSRSoft's Product Mix report has a "By Quarter
-- Hour" view segment that would enable a real sliding window, not yet pulled).
--
-- Why a view, not a client-side scan: qsr_daily_activity is ~631,000 rows (measured 2026-10-12,
-- service-role count, spans 2024-01-01 to today) -- pulling that client-side to find a max would
-- be the single heaviest load in the app, the exact mistake loadQsrActSummary's own header
-- documents fixing for a similar table (schema-qsr-daily-summary.sql). DISTINCT ON collapses it
-- server-side to at most (#stores x 24 hour_slots) rows -- ~650 for this district.
--
-- security_invoker = true (Postgres 15+) re-runs qsr_daily_activity's own RLS (multitenant +
-- per-loc scoping, schema-multitenant-phase2-rls.sql + schema-rls-phase2-loc.sql) AS THE QUERYING
-- ROLE -- same pattern as schema-security-findings-latest-view.sql, no policy duplication needed.
--
-- loadHourlySalesRecords() (src/lib/supabase.js) probes for this view on first use and falls back
-- to a bounded recent-window scan of the base table when it isn't found (PGRST205 schema-cache-miss,
-- not the raw Postgres 42P01 -- see that file's security_findings_latest probe for why), so the
-- feature works (with an honestly-labeled shorter lookback) before and after this migration runs.

create or replace view public.qsr_hourly_sales_records
  with (security_invoker = true) as
select distinct on (loc, hour_slot)
  loc, hour_slot, dt, product_sales
from public.qsr_daily_activity
where product_sales is not null and product_sales > 0
order by loc, hour_slot, product_sales desc, dt desc;

grant select on public.qsr_hourly_sales_records to authenticated;

comment on view public.qsr_hourly_sales_records is
  'One row per (loc, hour_slot) -- the single highest product_sales ever recorded in that fixed '
  'clock-hour bucket, and the date it happened (ties broken by most recent dt). Feeds the Record '
  'Day panel''s "Record Hour" tab (clock-hour approximation, not a true 15-minute rolling window). '
  'security_invoker=true re-runs qsr_daily_activity''s own RLS as the caller. '
  'loadHourlySalesRecords() (src/lib/supabase.js) already probes for and reads from this view '
  'automatically once it exists -- no app change needed after applying this file.';
