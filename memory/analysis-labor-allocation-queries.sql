-- ============================================================================
-- LABOR ALLOCATION — the queries behind memory/analysis-labor-allocation-2026-08-18.md
-- All use the VLH guide's OWN daypart boundaries. Do not re-derive them:
--   Breakfast 5a-11a | Lunch 11a-2p | Afternoon 2p-5p | Dinner 5p-11p | Late Night 11p-5a
-- hour_slot is the END of the block, running 05:00 -> 28:00 across the 4am business day,
-- so '05:00' (4-5am) is Late Night at the START of the day and the else branch catches it.
-- 6+3+3+6+6 = 24 slots, reconciling exactly with the DAR's 24.
--
-- Every ratio is a RATIO OF SUMS. Never average the per-row ratios.
-- The 24-slot completeness guard is mandatory: a short day understates any denominator
-- and silently inflates the ratio above it.
--
-- Cannot be run from an agent session — tenant RLS returns zero rows to the anon key.
-- Owner runs these in the Supabase SQL Editor.
-- ============================================================================


-- ── QUERY 1 — the district picture (this produced the proof) ────────────────
-- Read punched_hrs vs needed_hrs: the surplus dayparts pay for the deficit ones.
-- Measured 2026-08-18: deficit -20,485 hrs, surplus +32,701 hrs, net +12,216 over guide.
with complete_days as (
  select loc, dt
  from qsr_daily_activity
  where dt >= current_date - interval '90 days'
  group by loc, dt
  having count(distinct hour_slot) = 24
)
select
  case
    when substring(a.hour_slot,1,2)::int between  6 and 11 then '1 Breakfast'
    when substring(a.hour_slot,1,2)::int between 12 and 14 then '2 Lunch'
    when substring(a.hour_slot,1,2)::int between 15 and 17 then '3 Afternoon'
    when substring(a.hour_slot,1,2)::int between 18 and 23 then '4 Dinner'
    else                                                        '5 Late Night'
  end as daypart,
  round(((sum(a.dt_untilserve)::numeric / nullif(sum(a.dt_trans_cnt),0)) / 1000)::numeric, 1) as sec_per_car,
  round((sum(a.transactions)          / nullif(sum(a.actual_punched_hours),0))::numeric, 2)   as tpph,
  round((sum(a.actual_punched_hours)  / nullif(sum(a.total_needed_hours),0))::numeric, 3)     as punched_vs_guide,
  round((sum(a.total_scheduled_hours) / nullif(sum(a.total_needed_hours),0))::numeric, 3)     as scheduled_vs_guide,
  round((sum(a.actual_punched_hours)  / nullif(sum(a.total_scheduled_hours),0))::numeric, 3)  as punched_vs_scheduled,
  sum(a.dt_trans_cnt)                            as cars,
  round(sum(a.actual_punched_hours)::numeric, 0) as punched_hrs,
  round(sum(a.total_needed_hours)::numeric, 0)   as needed_hrs
from qsr_daily_activity a
join complete_days c on c.loc = a.loc and c.dt = a.dt
group by 1
order by 1;


-- ── QUERY 2 — CONCENTRATION CHECK. Run this BEFORE acting on anything. ──────
-- Five stores is five conversations; twenty-seven is a broken standard.
--   * PM rows: read scheduled_vs_guide -> who is PADDING the schedule.
--   * Breakfast rows: read punched_vs_scheduled -> who LOSES people at the punch.
-- Those are two different name lists and two different conversations.
with complete_days as (
  select loc, dt
  from qsr_daily_activity
  where dt >= current_date - interval '90 days'
  group by loc, dt
  having count(distinct hour_slot) = 24
)
select
  a.loc,
  case
    when substring(a.hour_slot,1,2)::int between  6 and 11 then '1 Breakfast'
    when substring(a.hour_slot,1,2)::int between 12 and 14 then '2 Lunch'
    when substring(a.hour_slot,1,2)::int between 15 and 17 then '3 Afternoon'
    when substring(a.hour_slot,1,2)::int between 18 and 23 then '4 Dinner'
    else                                                        '5 Late Night'
  end as daypart,
  round((sum(a.actual_punched_hours) - sum(a.total_needed_hours))::numeric, 0)               as gap_hrs,
  round((sum(a.actual_punched_hours)  / nullif(sum(a.total_needed_hours),0))::numeric, 3)    as punched_vs_guide,
  round((sum(a.total_scheduled_hours) / nullif(sum(a.total_needed_hours),0))::numeric, 3)    as scheduled_vs_guide,
  round((sum(a.actual_punched_hours)  / nullif(sum(a.total_scheduled_hours),0))::numeric, 3) as punched_vs_scheduled
from qsr_daily_activity a
join complete_days c on c.loc = a.loc and c.dt = a.dt
group by 1,2
order by 2, gap_hrs desc;


-- ── QUERY 3 — price it at the REAL wage, not an assumed one ─────────────────
-- actual_punched_dollars sits on the same row, so the blended rate is measured rather
-- than guessed. excess_dollars is what the over-guide hours actually cost.
with complete_days as (
  select loc, dt
  from qsr_daily_activity
  where dt >= current_date - interval '90 days'
  group by loc, dt
  having count(distinct hour_slot) = 24
)
select
  case
    when substring(a.hour_slot,1,2)::int between  6 and 11 then '1 Breakfast'
    when substring(a.hour_slot,1,2)::int between 12 and 14 then '2 Lunch'
    when substring(a.hour_slot,1,2)::int between 15 and 17 then '3 Afternoon'
    when substring(a.hour_slot,1,2)::int between 18 and 23 then '4 Dinner'
    else                                                        '5 Late Night'
  end as daypart,
  round(sum(a.actual_punched_hours)::numeric, 0)                                        as punched_hrs,
  round(sum(a.total_needed_hours)::numeric, 0)                                          as needed_hrs,
  round((sum(a.actual_punched_hours) - sum(a.total_needed_hours))::numeric, 0)          as gap_hrs,
  round((sum(a.actual_punched_dollars) / nullif(sum(a.actual_punched_hours),0))::numeric, 2)
                                                                                        as blended_wage,
  round(((sum(a.actual_punched_hours) - sum(a.total_needed_hours))
         * (sum(a.actual_punched_dollars) / nullif(sum(a.actual_punched_hours),0)))::numeric, 0)
                                                                                        as gap_dollars_90d
from qsr_daily_activity a
join complete_days c on c.loc = a.loc and c.dt = a.dt
group by 1
order by 1;


-- ── QUERY 4 — RE-RUN OWED. The speed payoff, on correct boundaries. ─────────
-- The "+19.4s at breakfast" figure was measured on the WRONG daypart boundaries and must
-- NOT be quoted to a GM until this runs. Read the sales MET/BEAT rows: if 'under guide' is
-- materially slower than 'at guide' inside a daypart, understaffing a shift that earned
-- its volume is real. Matched pair confirmed in the pull script:
-- prod_sales_scrubbed (actual) <-> proj_prod_sales_scrubbed (projected).
with complete_days as (
  select loc, dt
  from qsr_daily_activity
  where dt >= current_date - interval '90 days'
  group by loc, dt
  having count(distinct hour_slot) = 24
),
cell as (
  select a.loc, a.dt,
    case
      when substring(a.hour_slot,1,2)::int between  6 and 11 then '1 Breakfast'
      when substring(a.hour_slot,1,2)::int between 12 and 14 then '2 Lunch'
      when substring(a.hour_slot,1,2)::int between 15 and 17 then '3 Afternoon'
      when substring(a.hour_slot,1,2)::int between 18 and 23 then '4 Dinner'
      else                                                        '5 Late Night'
    end as daypart,
    sum(a.dt_untilserve)            as ms,
    sum(a.dt_trans_cnt)             as cars,
    sum(a.actual_punched_hours)     as punched,
    sum(a.total_needed_hours)       as needed,
    sum(a.prod_sales_scrubbed)      as sales,
    sum(a.proj_prod_sales_scrubbed) as proj
  from qsr_daily_activity a
  join complete_days c on c.loc = a.loc and c.dt = a.dt
  group by 1,2,3
),
f as (
  select *,
         (ms::numeric / nullif(cars,0)) / 1000 as spc,
         punched / nullif(needed,0)            as pvg,
         sales   / nullif(proj,0)              as svp
  from cell
  where cars >= 30 and needed > 0 and proj > 0
)
select
  daypart,
  case when svp >= 1.0 then 'sales MET/BEAT' else 'sales MISSED' end as volume,
  case when pvg < 0.95 then 'under guide'
       when pvg > 1.05 then 'over guide'
       else                 'at guide' end                           as staffing,
  count(*)                                                           as store_days,
  round(percentile_cont(0.5) within group (order by spc)::numeric,1) as median_sec_per_car
from f
group by 1,2,3
order by 1,2,3;
