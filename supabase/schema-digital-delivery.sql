-- ============================================================================
-- QSRSoft Digital App + McDelivery 3PO → Performance-Review digital/delivery
-- metrics (Notes 32). Monthly per-loc summary tables, mirroring the People
-- tables (roster_statistics / turnover_monthly). PK = (loc, period_month 'YYYY-MM').
-- Parsers: src/engine/people-reports.js (parseDigitalAppApi / parseMcDelivery3POApi).
-- RLS = require-auth (matches Phase 1). Safe to run top-to-bottom; idempotent.
-- Expected result: "Success. No rows returned."
-- ============================================================================

-- Digital App — per store/month. Review metric = Digital App GC/R/D (guest counts
-- per restaurant per day). Sales/%/avg-check kept for context.
create table if not exists public.digital_app_monthly (
  loc            text not null,
  period_month   text not null,                 -- 'YYYY-MM'
  app_sales      numeric,                        -- Digital App Sales $
  app_gc         numeric,                        -- Digital App GCs (window total)
  app_gc_rd      numeric,                        -- Digital App GC/R/D (review metric)
  app_pct_sales  numeric,                        -- Digital App % of total sales
  avg_check      numeric,                        -- Digital App average check
  rest_days      numeric,                        -- qualified rest-days in window (GC/R/D denom)
  updated_at     timestamptz default now(),
  primary key (loc, period_month)
);

-- McDelivery 3PO — per store/month. Review metric = Delivery GC/R/D (3PO GC per
-- restaurant per day). Delivery-experience fields (CSAT, missing items, times) kept
-- for the delivery-experience project. Times stored in seconds.
create table if not exists public.mcdelivery_monthly (
  loc                        text not null,
  period_month               text not null,      -- 'YYYY-MM'
  vendor                     text,               -- e.g. 'Combined Vendors'
  delivery_gc                numeric,            -- 3PO GC (window total)
  delivery_gc_rd             numeric,            -- Delivery GC/R/D (review metric)
  pos_mcdelivery_gc          numeric,            -- POS McDelivery GC
  pos_3po_sales              numeric,            -- POS 3PO delivery sales $
  csat                       numeric,            -- avg CSAT
  orders_missing_items_pct   numeric,
  incorrect_orders           numeric,
  mcdelivery_time_sec        numeric,            -- avg McDelivery time (seconds)
  restaurant_time_sec        numeric,            -- avg restaurant time (seconds)
  total_experience_time_sec  numeric,            -- avg total experience time (seconds)
  rest_days                  numeric,            -- qualified rest-days in window (GC/R/D denom)
  updated_at                 timestamptz default now(),
  primary key (loc, period_month)
);

alter table public.digital_app_monthly enable row level security;
alter table public.mcdelivery_monthly  enable row level security;

drop policy if exists "digital_app_monthly: auth all" on public.digital_app_monthly;
create policy "digital_app_monthly: auth all" on public.digital_app_monthly
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "mcdelivery_monthly: auth all" on public.mcdelivery_monthly;
create policy "mcdelivery_monthly: auth all" on public.mcdelivery_monthly
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
