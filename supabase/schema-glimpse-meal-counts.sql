-- ── Daily Glimpse: employee & manager meal COUNTS ───────────────────────────
-- Notes 60, follow-on to schema-glimpse-meals.sql.
--
-- The Glimpse carries the counts beside the dollars — verified against a real
-- 2026-08-07 file, columns "Employee Discount Cnt" and "Manager Discount Cnt".
--
-- Worth having because this codebase has already been bitten by the amount-without-count
-- asymmetry: see the tRedACnt/tRedBCnt note in metric-source.js, where the percentage had
-- a resolution chain and the count beside it did not, so one tile showed a fresh figure
-- next to a stale one. Same trap, same report.
alter table public.daily_glimpse_daily add column if not exists emp_meal_cnt numeric;
alter table public.daily_glimpse_daily add column if not exists mgr_meal_cnt numeric;

comment on column public.daily_glimpse_daily.emp_meal_cnt is
  'Employee meal transaction count. Glimpse column "Employee Discount Cnt".';
comment on column public.daily_glimpse_daily.mgr_meal_cnt is
  'Manager meal transaction count. Glimpse column "Manager Discount Cnt" — label says discount, value is manager meals.';
