-- ============================================================================
-- PROBE G-1 — is there headroom inside a store's own week?
-- Workstream G, memory/plan-normalization-2026-08-17.md
-- Written 2026-08-17. Run in the Supabase SQL Editor (RLS scopes it to you;
-- the anon key returns zero rows, so this cannot run from an agent session).
--
-- QUESTION -------------------------------------------------------------------
-- Does drive-thru speed vary as much WITHIN one store (across its own dayparts
-- and days of week) as it does BETWEEN stores?
--
-- This is a SCREEN, not the answer. It tests whether the "who was on shift"
-- dimension has anything to explain. It does NOT show that people cause the
-- variation — dayparts differ for volume, staffing and menu-mix reasons too.
-- If within-store spread is small, stop: G is dead and costs nothing further.
--
-- VERDICT RULE ---------------------------------------------------------------
--   median_within_store_spread >= between_store_spread  -> dimension is real, build G
--   within < ~half of between                           -> drop G
--
-- SANITY GATE (read this FIRST in the output) ---------------------------------
--   median_sec_per_car should land roughly 150-300s for DT total experience.
--   If it is ~0.2 or ~200000, the unit assumption below is wrong — STOP and say so.
--
-- FACTS THIS QUERY DEPENDS ON (all verified 2026-08-17, do not "fix" them) ----
--  * qsr_daily_activity PK = (loc, dt, hour_slot); loc = NSN zero-padded to 7.
--  * dt is ALREADY the 4am-4am business day. hour_slot runs '05:00' -> '28:00',
--    24 slots covering 04:00->04:00 (memory/dar-vs-ops-reconciliation.md).
--    => extract(dow from dt) is the correct business day-of-week.
--    => DO NOT apply a cutover shift here. It is already applied upstream.
--  * dt_untilserve is cumulative MILLISECONDS (not microseconds — constants.js
--    said µs until this probe corrected it). Per-car seconds = Sum(ms)/Sum(cars)/1000.
--  * Ratio of sums, never an average of averages (standing rule).
--  * Incomplete DAR days understate denominators and silently inflate any ratio
--    above them — hence the 24-slot completeness guard.
-- ============================================================================


-- ── QUERY 1 — THE VERDICT (one row) ─────────────────────────────────────────
with complete_days as (            -- guard: only days with a full 24 slots
  select loc, dt
  from qsr_daily_activity
  where dt >= current_date - interval '90 days'
  group by loc, dt
  having count(distinct hour_slot) = 24
),
cells as (                         -- store x daypart x day-of-week
  select
    a.loc,
    case
      when substring(a.hour_slot,1,2)::int between  5 and 11 then 'Breakfast'
      when substring(a.hour_slot,1,2)::int between 12 and 14 then 'Lunch'
      when substring(a.hour_slot,1,2)::int between 15 and 17 then 'Afternoon'
      when substring(a.hour_slot,1,2)::int between 18 and 20 then 'Dinner'
      else                                                        'Late'
    end                     as daypart,
    to_char(a.dt,'Dy')      as dow,
    sum(a.dt_untilserve)    as ms,
    sum(a.dt_trans_cnt)     as cars
  from qsr_daily_activity a
  join complete_days c on c.loc = a.loc and c.dt = a.dt
  group by 1,2,3
),
cell_rate as (
  select loc, daypart, dow, ms, cars,
         (ms::numeric / nullif(cars,0)) / 1000 as sec_per_car
  from cells
  where cars >= 200                -- noise floor: skip thin cells
),
per_store as (
  select
    loc,
    count(*)                                              as n_cells,
    (sum(ms)::numeric / nullif(sum(cars),0)) / 1000       as store_sec_per_car,
    percentile_cont(0.9) within group (order by sec_per_car)
      - percentile_cont(0.1) within group (order by sec_per_car) as within_spread
  from cell_rate
  group by loc
  having count(*) >= 20            -- need enough cells for a p10/p90 to mean anything
)
select
  count(*)                                                                   as stores,
  round(avg(n_cells), 1)                                                     as avg_cells_per_store,
  round(percentile_cont(0.5) within group (order by store_sec_per_car)::numeric, 1)
                                                                             as median_sec_per_car,
  round(percentile_cont(0.5) within group (order by within_spread)::numeric, 1)
                                                                             as median_within_store_spread,
  round((percentile_cont(0.9) within group (order by store_sec_per_car)
       - percentile_cont(0.1) within group (order by store_sec_per_car))::numeric, 1)
                                                                             as between_store_spread
from per_store;


-- ── QUERY 2 — THE COACHABLE ARTIFACT (run only if Query 1 says build it) ─────
-- Per store: its best and worst shift-cell, and the gap between them.
-- This is the shape a DO would actually use — it names a daypart and a day,
-- which is a conversation, where a store-level average is not.
with complete_days as (
  select loc, dt
  from qsr_daily_activity
  where dt >= current_date - interval '90 days'
  group by loc, dt
  having count(distinct hour_slot) = 24
),
cells as (
  select
    a.loc,
    case
      when substring(a.hour_slot,1,2)::int between  5 and 11 then 'Breakfast'
      when substring(a.hour_slot,1,2)::int between 12 and 14 then 'Lunch'
      when substring(a.hour_slot,1,2)::int between 15 and 17 then 'Afternoon'
      when substring(a.hour_slot,1,2)::int between 18 and 20 then 'Dinner'
      else                                                        'Late'
    end                  as daypart,
    to_char(a.dt,'Dy')   as dow,
    sum(a.dt_untilserve) as ms,
    sum(a.dt_trans_cnt)  as cars
  from qsr_daily_activity a
  join complete_days c on c.loc = a.loc and c.dt = a.dt
  group by 1,2,3
),
cell_rate as (
  select loc, daypart, dow, cars,
         round(((ms::numeric / nullif(cars,0)) / 1000)::numeric, 1) as sec_per_car
  from cells
  where cars >= 200
),
ranked as (
  select *,
         row_number() over (partition by loc order by sec_per_car desc) as worst_rk,
         row_number() over (partition by loc order by sec_per_car asc)  as best_rk
  from cell_rate
)
select
  w.loc,
  w.daypart || ' ' || w.dow  as worst_shift,
  w.sec_per_car              as worst_sec,
  b.daypart || ' ' || b.dow  as best_shift,
  b.sec_per_car              as best_sec,
  round((w.sec_per_car - b.sec_per_car)::numeric, 1) as gap_sec
from ranked w
join ranked b on b.loc = w.loc and b.best_rk = 1
where w.worst_rk = 1
order by gap_sec desc;


-- ── QUERY 3 — COVERAGE CHECK (run FIRST if either result looks odd) ─────────
-- How much data survived the completeness guard, per store. A store with far
-- fewer complete days than its peers has a DAR gap, not a speed problem —
-- and per the standing backfill rule that is a work item, not a finding.
select
  loc,
  count(*)                                     as complete_days,
  min(dt)                                      as first_dt,
  max(dt)                                      as last_dt
from (
  select loc, dt
  from qsr_daily_activity
  where dt >= current_date - interval '90 days'
  group by loc, dt
  having count(distinct hour_slot) = 24
) d
group by loc
order by complete_days asc;

-- ============================================================================
-- PROBE G-2 — is the within-store spread EXECUTION, or just dayparts being dayparts?
-- Added 2026-08-18 after G-1 returned 0.91. THIS is the query Workstream G now
-- hangs on; G-1 only established there is something worth decomposing.
--
-- G-1 measured raw within-store spread (86.7s median). That number mixes:
--   1. STRUCTURAL — dinner is slower than breakfast at every store. Real, not coachable.
--   2. EXECUTION  — THIS store's Tuesday dinner is slow FOR a Tuesday dinner. Coachable.
-- Only (2) is a target. Treating the whole 86.7s as opportunity is the overclaim.
--
-- This normalizes each cell against the district median for the SAME daypart+dow,
-- so structural daypart effects cancel, and measures what spread survives.
--
-- VERDICT:
--   median_execution_spread > ~40s  -> variance is execution; G has a real target.
--   collapses toward 0              -> it was structural; G shrinks to a smaller idea.
-- ============================================================================
with complete_days as (
  select loc, dt from qsr_daily_activity
  where dt >= current_date - interval '90 days'
  group by loc, dt having count(distinct hour_slot) = 24
),
cells as (
  select a.loc,
    case
      when substring(a.hour_slot,1,2)::int between  5 and 11 then 'Breakfast'
      when substring(a.hour_slot,1,2)::int between 12 and 14 then 'Lunch'
      when substring(a.hour_slot,1,2)::int between 15 and 17 then 'Afternoon'
      when substring(a.hour_slot,1,2)::int between 18 and 20 then 'Dinner'
      else                                                        'Late'
    end as daypart,
    to_char(a.dt,'Dy') as dow,
    sum(a.dt_untilserve) as ms, sum(a.dt_trans_cnt) as cars
  from qsr_daily_activity a
  join complete_days c on c.loc = a.loc and c.dt = a.dt
  group by 1,2,3
),
cell_rate as (
  select loc, daypart, dow, (ms::numeric / nullif(cars,0)) / 1000 as spc
  from cells where cars >= 200
),
district as (            -- what a typical store does in THIS daypart+dow
  select daypart, dow, percentile_cont(0.5) within group (order by spc) as district_spc
  from cell_rate group by 1,2
),
resid as (               -- how far this store sits from that, same slot
  select r.loc, r.daypart, r.dow, r.spc, d.district_spc,
         r.spc - d.district_spc as resid_sec
  from cell_rate r join district d on d.daypart = r.daypart and d.dow = r.dow
),
per_store as (
  select loc,
         percentile_cont(0.9) within group (order by resid_sec)
       - percentile_cont(0.1) within group (order by resid_sec) as exec_spread
  from resid group by loc having count(*) >= 20
)
select count(*)                                                                as stores,
       round(percentile_cont(0.5) within group (order by exec_spread)::numeric,1)
                                                                               as median_execution_spread
from per_store;


-- ── G-2b — the coachable list, if G-2 clears. The 25 worst slot-vs-peers gaps. ──
-- This is the artifact a DO would actually use: it names a store, a daypart and a
-- day, benchmarked against what every other store does in that same slot — which
-- is a conversation, where a store-level average is not.
with complete_days as (
  select loc, dt from qsr_daily_activity
  where dt >= current_date - interval '90 days'
  group by loc, dt having count(distinct hour_slot) = 24
),
cells as (
  select a.loc,
    case
      when substring(a.hour_slot,1,2)::int between  5 and 11 then 'Breakfast'
      when substring(a.hour_slot,1,2)::int between 12 and 14 then 'Lunch'
      when substring(a.hour_slot,1,2)::int between 15 and 17 then 'Afternoon'
      when substring(a.hour_slot,1,2)::int between 18 and 20 then 'Dinner'
      else                                                        'Late'
    end as daypart,
    to_char(a.dt,'Dy') as dow,
    sum(a.dt_untilserve) as ms, sum(a.dt_trans_cnt) as cars
  from qsr_daily_activity a
  join complete_days c on c.loc = a.loc and c.dt = a.dt
  group by 1,2,3
),
cell_rate as (
  select loc, daypart, dow, cars, (ms::numeric / nullif(cars,0)) / 1000 as spc
  from cells where cars >= 200
),
district as (
  select daypart, dow, percentile_cont(0.5) within group (order by spc) as district_spc
  from cell_rate group by 1,2
)
select r.loc,
       r.daypart || ' ' || r.dow                        as slot,
       round(r.spc::numeric, 1)                         as this_store_sec,
       round(d.district_spc::numeric, 1)                as district_sec,
       round((r.spc - d.district_spc)::numeric, 1)      as gap_sec,
       r.cars
from cell_rate r
join district d on d.daypart = r.daypart and d.dow = r.dow
order by gap_sec desc
limit 25;
