---
name: finding-overscheduling-is-chaos-not-cost
description: Measured 2026-08-11 — stores grossly over-schedule against need, shift managers absorb it in-week, and labor % nets out so the P&L never surfaces it. The owner's long-standing claim, now with numbers. Read before building anything that ranks labor findings by dollars.
metadata:
  type: finding
  status: measured, owner-confirmed
---

# Over-scheduling is a chaos problem, not a labor-cost problem

**First finding produced by Push 3.** Surfaced within minutes of the Planning/Execution split
(#210) going live, 2026-08-11.

The owner, on seeing it: *"The stores are grossly and I mean grossly overscheduling by a lot,
with a few exceptions."* And: *"I have been screaming this at the top of my lungs since I
started here."*

**This is the point of the file.** He has believed this for years. Nothing in Meridian — or in
QSRSoft, or in the P&L — could show it, because the number that would have shown it nets to
zero. The split is what made an invisible problem measurable.

---

## The measurement

Labor Analytics → Planning/Execution, week of **2026-07-29**, all 27 stores. Header:

```
27 stores · 21 over-scheduled vs plan · 0 ran over their own schedule
```

Representative rows (hours):

| Store | Needed | Scheduled | Actual | Planning | Execution | **Combined** |
|---|---|---|---|---|---|---|
| Ada-Country Club | 1741 | 2883 | 2157 | **+1142** | −726 | **+417** |
| Madill-Hwy 70 | 1043 | 1527 | 1294 | +484 | −233 | +251 |
| Atoka-Mississippi | 1362 | 1831 | 1477 | +469 | −353 | +116 |
| Durant-US Hwy 70/22 | 2139 | 2573 | 2257 | +434 | −316 | +118 |
| Cottondale | 985 | 1335 | 1060 | +349 | −275 | +74 |
| Seminole-Milt Phillips | 2007 | 2131 | 1576 | +124 | −555 | −431 |
| Sulphur | 1344 | 1061 | 1000 | −283 | −61 | −343 |

Ada scheduled **66% above need**.

## The three numbers, and which one costs money

```
planning  = scheduled − needed     the plan is wrong
execution = actual − scheduled     the manager corrected it mid-week
combined  = actual − needed        what you actually paid
```

**Ada's +1142 costs nothing directly.** The shift manager cut 726 of it during the week. The
spend is the combined **+417**.

Summing combined across the 19 visible stores: **≈ +1,980 hrs over need** at some,
**≈ −1,920 under** at others. Net **≈ +64 hrs**.

Which matches the Labor Analytics Overview tile independently: **ACT VS NEED +9 hrs**
district-wide.

## Why nothing ever surfaced it

**The district lands on plan by accident, every week, at 27 stores.**

Labor % looks fine. Act-vs-Need looks fine. Every aggregate that has ever been looked at
reports "on plan," because the over-scheduling and the mid-week cutting cancel. The P&L
structurally cannot show this — the only place it appears is in the *gap between* two numbers
nobody was computing separately until #210.

**`0 of 27 ran over their own schedule` is not an anomaly.** It is the arithmetic consequence
of over-scheduling: schedule 66% above need and finishing under schedule is guaranteed. Both
columns describe one phenomenon. *(The PM initially flagged this as a possible definitional
artifact and was wrong — the owner's domain knowledge resolved it.)*

## What it actually costs — none of it in dollars

- **Crew get scheduled, then sent home.** Unpredictable hours, unpredictable paychecks.
- **Every manager spends their shift doing arithmetic** instead of running the restaurant.
- **The schedule stops being something anyone trusts** — for crew or for managers.
- **Labor % looks fine, so nothing in the P&L ever surfaces it.**

Those four lines are the owner's, verbatim-adjacent, and they are the finding. Turnover,
morale and execution quality all plausibly hang off them, and none of it is legible in a cost
report.

## ⚠ Product implications — read before ranking labor findings

1. **Rank by COMBINED, not planning.** Planning is the diagnosis; combined is the dollars. A
   store at +1142 planning / −726 execution costs less than one at +500 / 0.
2. **But a purely dollar-ranked view HIDES this finding entirely** — the whole point is that it
   costs ~nothing and damages the operation anyway. **This is the one case so far where the
   otherwise-correct "dollarize everything and sort by dollars" instinct is wrong.** The
   planning gap needs to surface on its own terms, not as an opportunity-dollar figure.
3. **The Coach column's logic is validated.** It tags Ada as *Scheduler*, not Shift Manager.
   Correct — coaching the manager who cut 726 hours off a bad schedule would punish the person
   fixing the problem. Do not change that gate.
4. **The scheduler/forecast is the intervention point**, not the store. Twenty-one of 27 over
   plan is a systemic input problem, not 21 independent behaviours.

## Open questions

- **Why is the schedule so far above need?** Guard-railing against call-outs? A stale labor
  guide? LifeLenz defaults? Unknown, and it is the actual root cause.
- Does the pattern hold across weeks, or is 2026-07-29 unusual? One week measured so far.
- Is `total_scheduled_hours` the posted schedule or a plan-of-record? Worth one validation
  against LifeLenz for a single store-week before coaching on the absolute magnitude — the
  *direction* is confirmed by the owner regardless.
- Does chaos correlate with turnover? `turnover_monthly` is already pulled. If stores with the
  largest planning gaps also churn hardest, that converts this from a qualitative argument into
  a measured one — and it is the strongest available test of the claim.

## Related

- #210 — the split that produced this
- `memory/project-coaching-feedback-loop.md` — this is exactly the shape of thing the loop
  should verify: change the schedule, measure whether the gap closes
- `memory/project-food-cost-labor-enhancements.md` §4 — where the split was specified
