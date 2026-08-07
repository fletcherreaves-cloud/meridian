-- ============================================================================
-- qsr_daily_activity_rollup — a real TABLE, replacing the view that couldn't work
-- ============================================================================
-- WHY A TABLE AND NOT A VIEW (both were tried on production today):
--   • Without security_invoker, a view BYPASSES the base table's RLS entirely —
--     it served per-store sales to the public anon key.
--   • With security_invoker, it evaluates RLS per row while aggregating 367,562
--     rows and hits the statement timeout.
--   Neither is shippable. A table carries its own tenant_id and its own cheap
--   policies over ~15,000 indexed rows, and pays the aggregation cost ONCE at
--   write time instead of on every read.
--
-- WHY IT MATTERS: Sales & Guest Counts, Sales vs LY, Guest Count vs LY and TPPH
-- all resolve from this data. Today the client pages ~40,000 hourly rows across
-- ~40 requests to build it, which is the single heaviest thing in the app and the
-- reason those tiles are the last to appear.
--     hourly, 60-day window ....... ~40,000 rows / ~40 requests
--     this table, 60-day window ...  ~1,650 rows / 2 requests
--
-- SUMS ONLY. Every derived metric (OEPE, R2P, KVS Time, KVS Healthy, park %, TPPH,
-- salesVsLY) stays in loadQsrActSummary's JS, where each carries the store and date
-- it was reconciled against the QSRSoft report. Re-deriving them here would create a
-- second definition free to drift from the first.
--
-- Verified before writing: qsr_daily_activity carries tenant_id (single tenant
-- today, 00000000-…-0001), spans 2025-01-01 → 2026-08-07, and all 23 source columns
-- exist.
-- ============================================================================

create table if not exists public.qsr_daily_activity_rollup (
  loc                       text        not null,
  dt                        date        not null,
  tenant_id                 uuid        not null,
  product_sales             numeric,
  transactions              numeric,
  healthy_count             numeric,
  unhealthy_count           numeric,
  dt_untilserve             numeric,
  dt_untilstore             numeric,
  dt_trans_cnt              numeric,
  dt_carsheld               numeric,
  fc_untilserve             numeric,
  fc_untilclosedrawer       numeric,
  fc_trans_cnt              numeric,
  mfy_untilserve            numeric,
  mfy_trans_cnt             numeric,
  proj_total_transactions   numeric,
  proj_sales_dollars        numeric,
  ly_product_sales          numeric,
  ly_transactions           numeric,
  actual_punched_hours      numeric,
  total_needed_hours        numeric,
  refreshed_at              timestamptz not null default now(),
  primary key (loc, dt)
);

-- dt-leading, because every read is "last N days". The base table's PK is
-- (loc, dt, hour_slot) and that leading loc is exactly why it seq-scanned.
create index if not exists qsr_daily_activity_rollup_dt_idx
  on public.qsr_daily_activity_rollup (dt);

-- ── Backfill / refresh. Idempotent; safe to re-run at any time. ─────────────
insert into public.qsr_daily_activity_rollup (
  loc, dt, tenant_id,
  product_sales, transactions, healthy_count, unhealthy_count,
  dt_untilserve, dt_untilstore, dt_trans_cnt, dt_carsheld,
  fc_untilserve, fc_untilclosedrawer, fc_trans_cnt,
  mfy_untilserve, mfy_trans_cnt,
  proj_total_transactions, proj_sales_dollars,
  ly_product_sales, ly_transactions,
  actual_punched_hours, total_needed_hours, refreshed_at
)
select
  -- uuid has no min() aggregate in Postgres, so take the first value instead.
  -- Safe here: tenant_id is uniform within a (loc, dt) group — every row for a store
  -- on a day belongs to the same tenant.
  loc, dt, (array_agg(tenant_id))[1],
  sum(coalesce(product_sales,0)), sum(coalesce(transactions,0)),
  sum(coalesce(healthy_count,0)), sum(coalesce(unhealthy_count,0)),
  sum(coalesce(dt_untilserve,0)), sum(coalesce(dt_untilstore,0)),
  sum(coalesce(dt_trans_cnt,0)), sum(coalesce(dt_carsheld,0)),
  sum(coalesce(fc_untilserve,0)), sum(coalesce(fc_untilclosedrawer,0)),
  sum(coalesce(fc_trans_cnt,0)),
  sum(coalesce(mfy1_untilserve,0) + coalesce(mfy2_untilserve,0)),
  sum(coalesce(mfy1_trans_cnt,0)  + coalesce(mfy2_trans_cnt,0)),
  sum(coalesce(proj_total_transactions,0)), sum(coalesce(proj_sales_dollars,0)),
  sum(coalesce(ly_product_sales,0)), sum(coalesce(ly_transactions,0)),
  sum(coalesce(actual_punched_hours,0)), sum(coalesce(total_needed_hours,0)),
  now()
from public.qsr_daily_activity
group by loc, dt
on conflict (loc, dt) do update set
  tenant_id = excluded.tenant_id,
  product_sales = excluded.product_sales,   transactions = excluded.transactions,
  healthy_count = excluded.healthy_count,   unhealthy_count = excluded.unhealthy_count,
  dt_untilserve = excluded.dt_untilserve,   dt_untilstore = excluded.dt_untilstore,
  dt_trans_cnt = excluded.dt_trans_cnt,     dt_carsheld = excluded.dt_carsheld,
  fc_untilserve = excluded.fc_untilserve,   fc_untilclosedrawer = excluded.fc_untilclosedrawer,
  fc_trans_cnt = excluded.fc_trans_cnt,
  mfy_untilserve = excluded.mfy_untilserve, mfy_trans_cnt = excluded.mfy_trans_cnt,
  proj_total_transactions = excluded.proj_total_transactions,
  proj_sales_dollars = excluded.proj_sales_dollars,
  ly_product_sales = excluded.ly_product_sales, ly_transactions = excluded.ly_transactions,
  actual_punched_hours = excluded.actual_punched_hours,
  total_needed_hours = excluded.total_needed_hours,
  refreshed_at = now();

-- ── RLS: tenant + per-loc, same proven predicate as the other 58 tables ─────
alter table public.qsr_daily_activity_rollup enable row level security;

drop policy if exists qsr_daily_activity_rollup_tenant on public.qsr_daily_activity_rollup;
create policy qsr_daily_activity_rollup_tenant
  on public.qsr_daily_activity_rollup for select to authenticated
  using (tenant_id = public.current_tenant_id());

drop policy if exists qsr_daily_activity_rollup_loc_scope on public.qsr_daily_activity_rollup;
create policy qsr_daily_activity_rollup_loc_scope
  on public.qsr_daily_activity_rollup as restrictive for all to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc,'0') in (select unnest((select public.my_locs()))) )
  with check ( (select public.my_locs()) is null
          or ltrim(loc,'0') in (select unnest((select public.my_locs()))) );

-- ── VERIFY ──────────────────────────────────────────────────────────────────
--   select count(*) from public.qsr_daily_activity_rollup;        -- ~15,000
--   -- must match the hourly sum exactly for any date:
--   select r.loc, r.product_sales, s.summed
--     from public.qsr_daily_activity_rollup r
--     join (select loc, dt, sum(product_sales) summed
--             from public.qsr_daily_activity where dt = '2026-08-05' group by loc, dt) s
--       on s.loc = r.loc and s.dt = r.dt
--    where r.dt = '2026-08-05'
--      and round(r.product_sales,2) <> round(s.summed,2);          -- expect 0 rows

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop table if exists public.qsr_daily_activity_rollup;
