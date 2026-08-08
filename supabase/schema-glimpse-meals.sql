-- ── Daily Glimpse: employee & manager meals ─────────────────────────────────
-- Notes 60. The owner confirmed both are in the Daily Glimpse report — manager meals
-- under the label "Manager Discount Amt", which is why it was never spotted.
--
-- The client parser now extracts them (src/parsers/index.js, parseDailyGlimpse), but the
-- table has nowhere to put them, so they are dropped on the way to Supabase. Same class of
-- gap as labor_rows never persisting the MBI floor-hours fields.
--
-- Safe to run before or after the code ships: the metric chain resolves from Controls and
-- the Register Audit until Glimpse starts producing values, so nothing breaks in between.
alter table public.daily_glimpse_daily add column if not exists emp_meal_amt numeric;
alter table public.daily_glimpse_daily add column if not exists mgr_meal_amt numeric;

comment on column public.daily_glimpse_daily.emp_meal_amt is
  'Employee meal $ for the day. Parsed from the Daily Glimpse.';
comment on column public.daily_glimpse_daily.mgr_meal_amt is
  'Manager meal $ for the day. Parsed from the Daily Glimpse column labelled "Manager Discount Amt" — the label says discount, the value is manager meals.';
