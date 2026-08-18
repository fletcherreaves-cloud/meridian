-- ============================================================================
-- McValue 2.0 — the three verifications still open before the 25th
-- Run in the Supabase SQL Editor. loc is ZERO-PADDED to 7 in these tables.
-- ============================================================================


-- ── A1 · WHEN DID TISHOMINGO ACTUALLY OPEN? ─────────────────────────────────
-- The document says "early 2025". That is an INFERENCE, not a measurement — it
-- traces to a memory note that only says "opened later", never a date.
--
-- ⚠ The trap: qsr_daily_activity_rollup was BACKFILLED, so its earliest row is
-- the backfill floor, not the world's start. If Tishomingo's first row equals
-- the table floor, the answer is "at or before the floor" and A1 cannot date it.
-- If its first row sits WELL AFTER the floor, that gap IS the open date.
select
  (select min(dt) from qsr_daily_activity_rollup)                        as table_floor,
  (select min(dt) from qsr_daily_activity_rollup
     where loc = '0043380')                                              as tish_first_row,
  (select min(dt) from qsr_daily_activity_rollup
     where loc = '0043380' and product_sales > 0)                        as tish_first_sales,
  (select min(dt) from qsr_daily_activity_rollup
     where loc = '0043380' and product_sales > 0)
  - (select min(dt) from qsr_daily_activity_rollup)                      as days_after_floor;


-- ── A2 · the opening ramp, to confirm A1 is an opening and not a data gap ───
-- A real grand opening looks like a spike then a settle. A backfill boundary
-- looks like normal trading from day one. Read the shape, not just the date.
select dt,
       round(product_sales::numeric, 0) as sales,
       transactions                     as guests,
       ly_transactions                  as ly_guests
from qsr_daily_activity_rollup
where loc = '0043380'
order by dt
limit 30;


-- ── A3 · does Tishomingo have an LY twin for the McValue pre-window? ────────
-- This is what actually decides how the document should describe the exclusion.
--   ly_days > 0 across Jan–Apr  -> exclusion reason is "opening ramp" (current wording)
--   ly_days = 0                 -> exclusion reason is "no LY twin", same as Ponce de Leon,
--                                  and the document's rationale must change
select
  count(*)                                        as days_in_pre_window,
  count(*) filter (where ly_transactions > 0)     as days_with_an_ly_twin,
  min(dt)                                         as first_dt,
  max(dt)                                         as last_dt
from qsr_daily_activity_rollup
where loc = '0043380' and dt between '2026-01-01' and '2026-04-21';


-- ── B · PRICE-CHANGE EFFECTIVE DATE, PER RESTAURANT ─────────────────────────
-- ❌ RAN 2026-08-18 AND FAILED. Returns 50–130 "repriced" items at EVERY store on
--    EVERY day. The >=20 floor is far too low for a 400+ item menu, and comparing
--    tier SETS day-over-day catches promotional variation, not base menu price.
--    Kept only as the record of what does not work. USE B2 BELOW.
-- Upgrades the check paragraph from "aligns with the June window" to "begins the
-- week price actually moved". A price ROUND changes many items at once, so the
-- signal is a DATE WITH A BIG CLUSTER of changed items, not any single change.
--
-- ⚠ (loc, date, item) can carry MULTIPLE price rows — price is part of the
-- conflict key, so an item holds a tier SET. Comparing a single price would
-- produce noise. This compares the whole SET per item per day.
with tiers as (
  select loc, item, date,
         string_agg(distinct price::text, ',' order by price::text) as price_set
  from qsr_product_mix
  where date >= '2026-01-01' and price is not null
  group by 1, 2, 3
),
chg as (
  select loc, item, date, price_set,
         lag(price_set) over (partition by loc, item order by date) as prev_set
  from tiers
)
select loc,
       date                       as change_date,
       count(*)                   as items_repriced
from chg
where prev_set is not null
  and price_set <> prev_set
group by 1, 2
having count(*) >= 20              -- a round, not a one-item tweak
order by loc, change_date;

-- Expect ONE dominant cluster per Oklahoma restaurant in June if the owner's
-- account holds (all OK took the recommended change). Restaurants with no
-- cluster, or a cluster in a different month, are the interesting rows.


-- ── C · PER-RESTAURANT TRAFFIC DiD — the positive-restaurant re-check ───────
-- The document says Tishomingo was "one of the restaurants with positive traffic
-- movement". That came from the RETIRED figure set and must be restated against
-- the current measurement before it goes in front of anyone.
-- Matched-day, ratio of summed counts, same windows as the headline.
with d as (
  select loc,
    sum(transactions)    filter (where dt between '2026-01-01' and '2026-04-21') as pre,
    sum(ly_transactions) filter (where dt between '2026-01-01' and '2026-04-21') as pre_ly,
    sum(transactions)    filter (where dt between '2026-04-22' and '2026-08-11') as post,
    sum(ly_transactions) filter (where dt between '2026-04-22' and '2026-08-11') as post_ly
  from qsr_daily_activity_rollup
  where dt between '2026-01-01' and '2026-08-11'
  group by 1
)
select loc,
       round((100.0 * pre  / nullif(pre_ly, 0)  - 100)::numeric, 2) as pre_vs_ly_pct,
       round((100.0 * post / nullif(post_ly, 0) - 100)::numeric, 2) as post_vs_ly_pct,
       round(((100.0 * post / nullif(post_ly, 0))
            - (100.0 * pre  / nullif(pre_ly, 0)))::numeric, 2)      as traffic_did_pp
from d
where pre_ly > 0 and post_ly > 0
order by traffic_did_pp desc;

-- Read the TOP of this list. The measured set says exactly one restaurant is
-- positive, in Oklahoma, at about +6.34pp — and that Florida's best is −1.88pp,
-- which contradicts a "Mossy Head +0.63pp" outlier still sitting in older notes.
-- Whatever this returns is what the document should say.


-- ── B2 · PERSISTENT STEP CHANGE IN BASE PRICE — the query that works ────────
-- ✅ RAN 2026-08-18. Located all three price rounds. See
--    memory/analysis-mcvalue-price-waves-2026-08-18.md
--
-- Takes max(price) per item per day as the base menu price (promos are always
-- BELOW menu), then counts a change only where the price was flat for 14 observed
-- days BEFORE and flat at the new value for 14 days AFTER. A one-day promo cannot
-- survive that; a price round can. Output capped at the top 2 dates per store.
--
-- RESULT: 52 of 54 rows land on 2026-02-25 (all 27 restaurants) and then either
-- 2026-06-13 (14 restaurants) or 2026-06-26 (13) — every restaurant exactly once,
-- in one of two waves. Strays: 2026-03-28 at 10034/37566 (FL-only pre-window
-- round) and 2026-04-15 at 43701 (menu setup, opened 03-13).
with b as (
  select loc, item, date, max(price) as base
  from qsr_product_mix
  where date >= '2026-01-01' and price > 0
  group by 1,2,3
), s as (
  select loc, item, date, base,
    lag(base) over w as prev,
    min(base) over (partition by loc,item order by date
      rows between 14 preceding and 1 preceding) as pmin,
    max(base) over (partition by loc,item order by date
      rows between 14 preceding and 1 preceding) as pmax,
    count(*) over (partition by loc,item order by date
      rows between 14 preceding and 1 preceding) as pn,
    min(base) over (partition by loc,item order by date
      rows between current row and 13 following) as fmin,
    max(base) over (partition by loc,item order by date
      rows between current row and 13 following) as fmax,
    count(*) over (partition by loc,item order by date
      rows between current row and 13 following) as fn
  from b
  window w as (partition by loc,item order by date)
), hits as (
  select loc, date, count(*) as items_repriced
  from s
  where prev is not null and base <> prev
    and pn = 14 and fn = 14
    and pmin = pmax and fmin = fmax
    and prev = pmax and base = fmin
  group by 1,2
)
select loc, date as change_date, items_repriced
from (select *, row_number() over (partition by loc
        order by items_repriced desc, date) as rn from hits) t
where rn <= 2
order by loc, rn;


-- ── D · THE STAGGER AS A NATURAL EXPERIMENT — price effect vs McValue effect ─
-- NOT YET RUN. This is the payoff of B2's finding and the cleanest causal read
-- available in the dataset.
--
-- Between 2026-06-13 and 2026-06-25, WAVE 2 restaurants had the new prices and
-- WAVE 3 restaurants did not — and BOTH cohorts had McValue running the whole
-- time. So the gap between the cohorts over those 13 days is the PRICE effect
-- with McValue held constant.
--
-- The control period (2026-05-24 → 2026-06-12) is the 20 days before either wave,
-- when neither cohort had moved. did_pp is the change in the cohorts' vs-LY gap
-- from control to treatment — i.e. what taking price 13 days earlier cost in
-- guest counts.
--
-- ⚠ Read as DIRECTIONAL, not decisive: n=14 vs 13, only 13 days, and the cohorts
--   were not randomly assigned (whoever scheduled the waves may have picked by
--   volume, market, or supervisor — check that before leaning on it).
with cohort as (
  select unnest(array[
    '0005183','0005985','0006178','0006838','0010422','0011657','0013113',
    '0018213','0020475','0033109','0033704','0034222','0035242','0038609'
  ]) as loc, 'wave2_early' as grp
  union all
  select unnest(array[
    '0003708','0006972','0010034','0010915','0024471','0029760','0031357',
    '0032525','0033222','0035064','0037566','0043380'
  ]), 'wave3_later'
  -- 43701 Ponce de Leon deliberately omitted: no LY twin (opened 2026-03-13)
), d as (
  select c.grp,
    sum(r.transactions)    filter (where r.dt between '2026-05-24' and '2026-06-12') as ctl,
    sum(r.ly_transactions) filter (where r.dt between '2026-05-24' and '2026-06-12') as ctl_ly,
    sum(r.transactions)    filter (where r.dt between '2026-06-13' and '2026-06-25') as trt,
    sum(r.ly_transactions) filter (where r.dt between '2026-06-13' and '2026-06-25') as trt_ly
  from qsr_daily_activity_rollup r
  join cohort c on c.loc = r.loc
  where r.dt between '2026-05-24' and '2026-06-25'
  group by 1
)
select grp,
  round((100.0*ctl/nullif(ctl_ly,0) - 100)::numeric, 2) as control_vs_ly_pct,
  round((100.0*trt/nullif(trt_ly,0) - 100)::numeric, 2) as treated_vs_ly_pct,
  round(((100.0*trt/nullif(trt_ly,0))
       - (100.0*ctl/nullif(ctl_ly,0)))::numeric, 2)     as did_pp
from d
order by grp;

-- If wave2_early's did_pp is materially WORSE than wave3_later's, the June price
-- round is costing guest counts and part of the post-window decline the FBP
-- attributes to McValue is in fact price. If the two are close, price is not the
-- driver and the McValue attribution stands.
