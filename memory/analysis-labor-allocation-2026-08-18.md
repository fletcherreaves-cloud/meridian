---
name: analysis-labor-allocation-2026-08-18
description: Measured finding — labor hours sit in the wrong dayparts. The two highest-volume dayparts run UNDER guide while the three softest run OVER it. Owner-requested write-up, 2026-08-18.
metadata:
  node_type: memory
  type: analysis
---

# Hours are in the wrong dayparts

**Owner-requested 2026-08-18.** Surfaced by PROBE G-3/G-4 while investigating something
else entirely (drive-thru speed variance). **Nobody hypothesised this** — it fell out of a
cut built for a different question, which is the main reason it is worth writing down.

---

## The finding in one line

**58% of your drive-thru volume is served UNDER the VLH guide. 42% is served OVER it.
The hours already exist — they are in the wrong dayparts.**

---

## The evidence

Measured across 27 stores, 90 days, ~1.7M cars (PROBE G-3):

| daypart | cars | share | punched vs guide | |
|---|---:|---:|---:|---|
| Breakfast | 620,752 | 36% | **0.928** | under |
| Lunch | 369,709 | 22% | **0.922** | under |
| Afternoon | 267,769 | 16% | 1.171 | over |
| Dinner | 248,625 | 15% | 1.085 | over |
| Late | 204,292 | 12% | 1.207 | over |

**The two busiest dayparts are the two run leanest.** Breakfast alone carries more cars
than Afternoon + Dinner combined and is staffed at 93% of guide.

### It is not noise, and it is not a few stores

Store-day counts from PROBE G-4, split by whether the shift actually earned its volume:

| | busy days UNDER guide | soft days OVER guide |
|---|---:|---:|
| Breakfast | **826** | — |
| Afternoon | — | **1,324** |
| Dinner | — | **1,245** |

826 breakfasts where sales **met or beat** projection were staffed below guide. In the same
window, **2,569** afternoon and dinner store-days where sales **missed** projection were
staffed above it.

The pattern is exactly inverted: **lean when busy, fat when slow.**

---

## What it costs

From PROBE G-4, holding daypart and volume constant, going from **under guide** to
**over guide** at Breakfast is worth **19.4 seconds per car** (162.8s → 143.4s).

That is the speed cost alone. It does not price the sales effect of a slow breakfast
drive-thru, the labour-hour waste on the soft afternoons, or the CSAT consequence.

**Do not quote a dollar figure yet.** The exact hour transfer needs one more query, since
G-3 gives ratios rather than absolute hours per daypart:

```sql
-- Absolute punched vs needed hours by daypart. Run with the CORRECTED boundaries
-- (memory/probe-g1-shift-dimension.sql header).
with complete_days as (
  select loc, dt from qsr_daily_activity
  where dt >= current_date - interval '90 days'
  group by loc, dt having count(distinct hour_slot) = 24
)
select
  case
    when substring(a.hour_slot,1,2)::int between  6 and 11 then '1 Breakfast'
    when substring(a.hour_slot,1,2)::int between 12 and 14 then '2 Lunch'
    when substring(a.hour_slot,1,2)::int between 15 and 17 then '3 Afternoon'
    when substring(a.hour_slot,1,2)::int between 18 and 23 then '4 Dinner'
    else                                                        '5 Late Night'
  end                                                        as daypart,
  round(sum(a.actual_punched_hours)::numeric, 0)             as punched_hrs,
  round(sum(a.total_needed_hours)::numeric, 0)               as needed_hrs,
  round((sum(a.actual_punched_hours) - sum(a.total_needed_hours))::numeric, 0) as gap_hrs
from qsr_daily_activity a
join complete_days c on c.loc = a.loc and c.dt = a.dt
group by 1 order by 1;
```

`gap_hrs` summed across the over-guide dayparts is the pool available to move. If it
roughly covers the under-guide deficit, this is **cost-neutral** — a reallocation, not a
labour increase. That is what makes it worth doing.

---

## Why this is probably the biggest item on the board

1. **It is cost-neutral if the hours net out.** Every other speed lever costs money or
   headcount. This one is a transfer.
2. **It hits the largest volume.** Breakfast is 36% of cars, more than Afternoon and
   Dinner combined.
3. **The guide already says so.** VLH is a guest-count step function — the guide is
   *telling* each store the hours breakfast needs. This is not a modelling question; it is
   an adherence question.
4. **It is a scheduling decision, not a coaching one.** It changes when hours are placed,
   which is a weekly action with a named owner, not a behaviour change across 27 crews.

---

## ⚠️ Caveats — read before acting

1. **Daypart boundaries were wrong when this was measured.** G-3/G-4 ran on invented
   boundaries (Breakfast 4a–11a, Dinner 5p–8p, Late 8p–4a) rather than the VLH guide's
   (5a–11a, 5p–11p, 11p–5a). The arithmetic is sound — Σ/Σ over the same hour set is valid
   whatever the buckets — but **every number here must be re-run on corrected boundaries
   before it drives a schedule change.** Direction is unlikely to flip (breakfast under,
   afternoon/dinner over is a wide margin) but magnitudes will move.
2. **The staffing buckets contain different stores.** A chronically-under-guide restaurant
   may also be a slow restaurant, so part of the 19.4s is store identity rather than
   staffing. Needs a within-store comparison before any number reaches a GM.
3. **`total_needed_hours` is assumed to be the VLH guide.** Strong supporting evidence:
   `scheduled_vs_guide` runs 1.056–1.376, systematically ≠ 1.0, so it is demonstrably not
   a copy of `total_scheduled_hours`. Not yet confirmed against the workbook tables.
4. **Guides are per-configuration.** 48 variants × 2 workbooks. Per-store work must join
   `store_vlh_config` (see below).

---

## Related: the schedule-to-punch gap

Separate but adjacent, from the same cut. **`punched_vs_scheduled` is below 1.0 in every
daypart** — 0.879 / 0.858 / 0.851 / **0.808** / 0.935. Managers schedule *above* guide
(1.056 → 1.376), then lose **12–19% at the punch**, landing at or below guide.

**This is not automatically a defect** — cutting early when the rush does not materialise
is correct management. But it means the schedule is not the plan of record; the punch is.
Any allocation fix that changes only the schedule will lose 12–19% of its intended effect
on the way to the floor.

---

## Where the store configuration lives

**`store_vlh_config` (Supabase), edited in Data Manager → VLH Settings**
(`src/views/analytics.js:1983-2075`). Per-store: `aot`, `dt_type`, `in_store`, `kitchen`,
`vlh_guide` (standard | high productivity), `coffee`. The code comment states its purpose
outright: *"used to select correct VLH guide page."*

Recorded here because a PM claim that this mapping did not exist was wrong — it exists,
and it exists for exactly this purpose.
