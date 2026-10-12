-- Supporting index for qsr_hourly_sales_records' DISTINCT ON -- run this AFTER
-- schema-qsr-hourly-sales-records-view.sql (the view itself). Re-running is safe
-- (`create index concurrently if not exists`).
--
-- Measured immediately after the view was applied (2026-10-12): the EXACT query shape the app's
-- own loadHourlySalesRecords() runs (select loc,hour_slot,dt,product_sales order by loc,hour_slot
-- through the view) hit a real `57014` statement timeout -- same root cause already documented
-- for security_findings_latest (schema-security-findings-latest-index.sql): without an index
-- matching the view's own `distinct on (loc, hour_slot) order by loc, hour_slot, product_sales
-- desc, dt desc`, Postgres has to Sort the full ~631,000-row qsr_daily_activity table to compute
-- DISTINCT ON on every single request -- the view alone, with no companion index, is not enough
-- (that repo precedent exists for exactly this reason; it was missed when the view shipped here).
--
-- This index gives the planner a path that already returns rows in DISTINCT ON's required order
-- (Index Scan -> Unique instead of Seq Scan -> Sort -> Unique), the same fix that took
-- security_findings_latest from 59,975ms to 9,708ms for an equivalent paginated fetch.
--
-- CONCURRENTLY (not used by the security_findings_latest precedent, used here deliberately):
-- qsr_daily_activity is under active writes from 3 daily automated pull scripts (LifeLenz,
-- QSRSoft eBOS, QSRSoft DAR) -- a plain CREATE INDEX takes a table-wide lock that would block
-- those writes for however long the build takes on 631k rows. CONCURRENTLY avoids that at the
-- cost of a longer build and two scans, and cannot run inside a transaction block (the Supabase
-- SQL editor runs each statement standalone, which is already compatible -- no BEGIN needed).

create index concurrently if not exists qsr_hourly_sales_records_support_idx
  on public.qsr_daily_activity (loc, hour_slot, product_sales desc, dt desc);
