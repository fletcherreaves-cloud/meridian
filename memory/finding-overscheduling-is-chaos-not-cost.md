---
name: finding-overscheduling-is-chaos-not-cost
description: Measured 2026-08-11 — stores grossly over-schedule against need, shift managers absorb it in-week, and labor % nets out so the P&L never surfaces it. The owner's long-standing claim, now with numbers. Read before building anything that ranks labor findings by dollars.
sensitivity: open
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

## LifeLenz vs Controls need baseline — measured ratio (dispatch #90, 2026-08-24)

Partially answers the open question above ("worth one validation against LifeLenz for a single
store-week") — a real number now exists, though it raises the stakes on the question rather than
closing it.

**SAGE was asked about staffing gaps and answered from two different sources on two different
occasions, for the same store (Ada-Country Club) and roughly the same window:** the LifeLenz
`sch_vlh − need_vlh` gap (SAGE's `query_lifelenz_labor` tool) said **+151.9 h/day** over-staffed;
the owner's Controls export's `Act vs Need` figure for the same store/window said **+57.2 h/day**.
Ratio ≈ **2.7×**.

Independently reproduced live against Supabase during this dispatch, 2026-07-25 → 2026-08-23 (the
export's own window): Ada's LifeLenz-basis avg gap = **+152.8 h/day**; the Controls/DAR-basis
`actual_punched_hours − total_needed_hours` (`qsr_daily_activity_rollup`) = **+56.6 h/day**. Ratio
= **2.70**. Consistent with the SAGE-quoted figures above — this is not a one-off measurement
artifact.

**The disagreement is not uniform across stores, and is not even consistently a *scaling*
disagreement.** Seminole-Milt Phillips, checked the same way over the same window: LifeLenz says
**+1.3 h/day** (essentially on target); the Controls/DAR basis says **−58.2 h/day** — the single
most under-staffed store in the district. LifeLenz and Controls disagree in **direction**, not
just magnitude, for this store. (This is why SAGE's under-staffed answer named Bonifay and Sulphur
but missed Seminole entirely — its only staffing-gap tool was the LifeLenz-basis one, on which
Seminole doesn't read as understaffed at all. See `memory/dispatch-90.md` item 2.)

**Do NOT use 2.7 as a correction factor anywhere.** One store, one window, and per the Seminole
counter-example the two baselines are not even reliably measuring the same shape of thing — a
fixed multiplier would be actively wrong on a store like Seminole where the direction itself
flips. What this closes: the open question is no longer "unknown, worth checking" — it's
"confirmed materially different, on both axes, needs its own investigation into WHY (a stale
LifeLenz labor guide, a different needed-hours methodology entirely, or something else)." That
investigation is not done here.

## Resolution (dispatch #93, 2026-08-24) — root cause found, on two independent axes

Reproduced live against Supabase (service-role read), all 27 stores, dispatch #93's exact window
(2026-07-20 → 2026-08-18), pulling `lifelenz_schedule` and `qsr_daily_activity_rollup` directly.
Confirmed the district figures in dispatch #93 first (Controls avg **+2.9 h/day**, LifeLenz avg
**+43.7 h/day**, same 8 flip stores) before investigating further — this is not a re-derivation,
it's the same measurement extended.

**Two candidates ruled out, as instructed, not re-tested. Three more ruled out here:**

- **Store volume.** Correlation between avg daily sales and the size of the need-baseline gap
  (see below) is weak: r ≈ 0.33–0.40. Volume is not the driver — Ada (district's largest ratio) and
  Madill (smallest need-baseline gap, 37 h/day) are both mid-to-high volume stores.
- **`store_vlh_config`'s other fields** (`aot`, `dt_type`, `in_store`, `kitchen`, `coffee`), checked
  individually and by eyeball combination across all 27 rows. `aot` is `false` for every store
  (non-discriminating). The other four fields show no pattern that separates the 8 flip stores from
  the 19 non-flip stores — flip stores span `side_tandem`/`single_1booth`/`single_2booth`,
  `self_serve`/`crew_pour`, and both coffee configs, in roughly the same proportions as the
  non-flip stores.
- **`store_vlh_config.updated_at` staleness.** Confirmed district-wide, not just the 3-row sample:
  all 27 rows share the exact same timestamp, `2026-07-30T20:02:15.631+00:00`. The config was set
  once (bulk seed/migration) and never touched per-store since. This is real, but it's a dead end
  for explaining the flips — the config fields it touches (`vlh_guide` and the four above) already
  don't correlate with which stores flip, so a stale config isn't the mechanism even though the
  staleness itself is confirmed.

**The root cause: `need_vlh`/`sch_vlh` and `total_needed_hours`/`total_scheduled_hours` are not
two calibrations of the same quantity. They differ on two independent axes, and either one alone
is large enough to flip sign on most of the 8 flip stores.**

### Axis 1 — scope: LifeLenz's VLH fields are structurally smaller than the Controls "total" fields

Across every one of the 27 stores, no exceptions:

- `need_vlh` sums to **61% of `total_needed_hours`** on average (range 44%–74%, σ = 8 points — a
  tight, systematic ratio, not noise).
- `sch_vlh` sums to **71% of `total_scheduled_hours`** on average (range 43%–96%).

Both LifeLenz fields run consistently under their Controls/DAR counterparts, on both the need side
and the scheduled side, at every single store. That rules out a data-entry fluke at a handful of
stores — this is a scope difference baked into what the two systems count. The field name itself
is the strongest clue: **VLH = Variable Labor Hours**, i.e. hourly/variable crew labor. If LifeLenz's
`need_vlh`/`sch_vlh` structurally exclude fixed/salaried hours (management, MOD coverage) that
`total_needed_hours`/`total_scheduled_hours` include, a ~30–40% shortfall is exactly the shape
you'd expect from a McDonald's running near-continuous manager-on-duty coverage that doesn't scale
down at low volume. I could not verify this mechanism directly against LifeLenz's own UI/docs (no
LifeLenz access from this environment) — `need_floor` (a much smaller, separate field, ~30h/day at
Ada vs `need_vlh`'s ~200h/day) didn't cleanly close the gap when added in, so I didn't chase it
further. What's measured and solid is the ratio itself, not the specific mechanism behind it.

**Isolating this axis alone:** holding the numerator fixed at Controls' own `actual_punched_hours`
and swapping only the need baseline (`total_needed_hours` → `need_vlh`) flips the sign for
**8 of 8** flip-direction stores. Example — Holdenville: Controls says −25.8 h/day (under-staffed);
`actual_punched_hours − need_vlh` for the same days says **+73.3 h/day**. Same numerator, only the
need baseline changed.

### Axis 2 — timing: LifeLenz compares the posted schedule, Controls compares actual punched hours

`qsr_daily_activity_rollup.total_scheduled_hours` (Controls' own scheduled-hours field, same table
as `total_needed_hours`) is populated for the full window (810/810 rows) but wasn't used in
dispatch #93's Controls figure, which used `actual_punched_hours` (what got punched, i.e. after the
shift manager's in-week correction — this file's own PLANNING/EXECUTION split). Recomputing the
Controls-basis gap with its own scheduled field instead:

- `total_scheduled_hours − total_needed_hours` (Controls' own planning gap): district avg
  **+30.6 h/day** — far closer to LifeLenz's **+43.7 h/day** than to the **+2.9 h/day**
  actual-vs-need figure the dispatch table used.
- The gap between the two (+2.9 vs +30.6, i.e. ≈ −27.7 h/day) is this file's own EXECUTION number
  in miniature — shift managers cut the district's average schedule down by close to that amount
  in-week, same phenomenon as Ada's original +1142/−726 planning/execution split, now shown to hold
  district-wide across both data sources.

**Isolating this axis alone:** holding the need baseline fixed at Controls' own `total_needed_hours`
and swapping only the numerator (`actual_punched_hours` → `total_scheduled_hours`) flips the sign
for **7 of 8** flip-direction stores (all except Holdenville, which moves from −25.8 to −8.0 — much
closer to zero, but doesn't cross). Chipley: Controls actual-basis −4.4 h/day, Controls
scheduled-basis **+5.6 h/day** — same table, same need baseline, only the numerator changed, and it
already agrees with LifeLenz's sign (+14.1).

### Why this also explains the 0.02×–12.6× ratio instability, without a third explanation

Both axes shift the two bases by a roughly *additive*, not *multiplicative*, offset (scope cuts the
need baseline by ~40%; timing adds ~28h/day back on average by using the pre-correction schedule).
A gap is a *difference* of two numbers each already shifted by a stable systematic offset — dividing
two such differences produces a ratio that swings wildly store to store even though the underlying
offsets are themselves consistent, because each store's chaos (this file's whole point: scheduling
is noisy, mid-week correction is noisy) sits directly in the numerator of that ratio. This is
consistent with, not contradictory to, dispatch #93's finding that no fixed multiplier works — it
explains *why* no fixed multiplier could work, structurally, rather than just re-confirming that one
doesn't.

### Conclusion

**These are different quantities, not a calibration problem — with the mechanism identified, not
just asserted.** LifeLenz's `need_vlh`/`sch_vlh` gap answers "is the posted schedule over-built
against a variable-crew-hours guide?" (a pre-week planning question, VLH-scoped). The Controls/DAR
`actual_punched_hours − total_needed_hours` gap answers "did we end up overstaffed against a total
labor-need estimate, after the week actually happened?" (a post-week execution question, total-labor
scoped). Both are real, both are internally consistent, and neither is "wrong" — they are answering
two different questions that happen to share the word "staffing gap." Per the dispatch's explicit
instruction, no correction factor is proposed, and no claim is made about which basis should drive
staffing decisions — that stays a product question. `query_labor_summary`'s existing default to the
Controls basis for staffing-gap questions (dispatch #90/#647) is unaffected and unchanged by this.

## Related

- #210 — the split that produced this
- `memory/project-coaching-feedback-loop.md` — this is exactly the shape of thing the loop
  should verify: change the schedule, measure whether the gap closes
- `memory/project-food-cost-labor-enhancements.md` §4 — where the split was specified
