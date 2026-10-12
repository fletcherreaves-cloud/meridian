-- ============================================================================
-- QSRSoft Quarter-Hour Sales — true 15-minute sales buckets, all 27 stores.
--
-- Built for "Record Hour in Sales" (owner request): the single best 60-CONSECUTIVE-
-- MINUTE rolling window of sales a store has ever had, any 15-min-aligned start
-- (7:15am-8:15am counts the same as 7:00am-8:00am). A prior V1 shipped using only
-- qsr_daily_activity's fixed clock-hour buckets (best single hour_slot, not a real
-- sliding window) because no 15-minute-granularity sales data existed anywhere in
-- Meridian — confirmed by a whole-repo grep before this table was added. This closes
-- that gap. See src/engine/record-hour.js for the sliding-window computation and
-- memory/finding-record-hour-quarter-hour-pull.md for the architecture decision.
--
-- Endpoint: the SAME one qsrsoft-dar-pull.mjs already drives for qsr_daily_activity --
--   GET https://api.reports.myqsrsoft.com/v1/reports/shift/daily-activity-raw
-- DAR requests it with timeSegment=openClose&segmentBy=hour&timeInterval=hour, which
-- returns 24 rows/store-day keyed by `endQtrHourTime` -- a field name that was already
-- a strong hint the API's native grain is quarter-hour and DAR was simply asking it to
-- pre-aggregate up to the hour. scripts/qsrsoft-sales-quarter-hour-pull.mjs requests the
-- IDENTICAL endpoint/params with segmentBy=quarterHour&timeInterval=quarterHour instead,
-- confirmed valid by memory/qsrsoft-report-catalog.md's Product Mix filter-surface table
-- ("View Segment | By Total - By Hour - By Quarter Hour | timeInterval") -- that capture
-- is for the Product Mix report, not this one, so the pull script logs a loud diagnostic
-- on its first live day (distinct-slot count) rather than assuming the param carries over
-- silently. Re-measure against that log before trusting this table's grain.
--
-- Deliberately NOT sourced from Product Mix's item-level `qtr-hr` segmentation --
-- memory/qsrsoft-report-catalog.md flags that as "enormous volume" (441 rows/store-day
-- at DAILY grain already; quarter-hour item-level would multiply that by ~96). This
-- table pulls the ALREADY-AGGREGATED sales total per quarter-hour instead (same shape
-- DAR already proves out for the hourly case), which is what Record Hour actually needs
-- -- no item-level breakdown, just a sales $ total per 15-minute bucket. Projected volume
-- (not yet live-measured -- this sandbox has no QSRSoft credentials to test against):
-- 96 slots/store-day x 27 stores = 2,592 rows/day, ~945K rows/year -- two orders of
-- magnitude below qsr_product_mix's ~4.3M rows/year, because this is sales totals, not
-- per-item facts.
--
-- Grain: (loc, dt, qtr_slot). qtr_slot is the raw `endQtrHourTime` string ("05:15" ..
-- "28:00", the same 4am-28h business-day numbering qsr_daily_activity.hour_slot uses,
-- just at 15-minute resolution instead of 60).
--
-- loc is UNPADDED here (matches ds.storeIds/STORE_NAMES), NOT the zero-padded NSN format
-- qsr_product_mix/qsr_fob/qsr_service_stats use -- deliberate choice, not an oversight.
-- CLAUDE.md records FOUR separate loc-padding incidents (v4.809/823/827/831) from a new
-- stream picking the "wrong" convention silently; this table has exactly one consumer
-- (src/lib/supabase.js's loadQsrSalesQuarterHour, which unpads on read) so there is no
-- cross-table join needing the padded form, and unpadded matches record-hour.js's only
-- real need: keying against ds.storeIds. The pull script itself still WRITES padded NSNs
-- (matching every other QSRSoft-sourced table, including qsr_daily_activity) -- only the
-- client-side loader unpads, exactly like src/lib/supabase.js's own _loadOpsTable does
-- for the ops-pull family.
--
-- tenant_id + tenant-scoped RLS from day one (CLAUDE.md standing rule; pattern matches
-- schema-product-mix.sql). Zero rows at creation time -- the cheapest a tenant_id column
-- ever gets.
-- Safe to run top-to-bottom; idempotent. Expected: "Success. No rows returned."
-- ============================================================================
create table if not exists public.qsr_sales_quarter_hour (
  loc             text    not null,              -- padded, e.g. '0035064' (see header)
  dt              date    not null,
  qtr_slot        text    not null,               -- endQtrHourTime, e.g. '05:15' .. '28:00'
  transactions    numeric,
  product_sales   numeric,
  net_sales       numeric,                         -- the figure Record Hour sums
  dt_transactions numeric,
  dt_sales        numeric,
  tenant_id       uuid not null default '00000000-0000-0000-0000-000000000001',
  updated_at      timestamptz default now(),
  primary key (loc, dt, qtr_slot)
);

alter table public.qsr_sales_quarter_hour enable row level security;
drop policy if exists qsr_sales_quarter_hour_tenant on public.qsr_sales_quarter_hour;
create policy qsr_sales_quarter_hour_tenant on public.qsr_sales_quarter_hour
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

create index if not exists qsr_sales_quarter_hour_dt_idx  on public.qsr_sales_quarter_hour (dt desc, loc);
create index if not exists qsr_sales_quarter_hour_loc_idx on public.qsr_sales_quarter_hour (loc, dt desc);
