---
name: finding-overscheduling-is-chaos-not-cost
description: Field finding from #210's labor gap split, live against real production data — the district over-schedules on 21 of 27 stores, but nets to only +9 hrs vs need district-wide because over-scheduling and mid-week cutting cancel out. Changes what #210's follow-up work should look like. Read before building anything that ranks or dollarizes the planning/execution split.
metadata:
  type: finding
  status: confirmed by owner against live data
---

# Overscheduling is chaos, not cost

## The finding

Once #210's planning/execution split ran against real production data, the owner confirmed:
**21 of 27 stores are grossly over-scheduling** — real, not an artifact of the split's math.

But the district-wide combined labor gap nets to only **+9 hours vs need** across the whole
district, every week. That's not a coincidence and it's not the system working: it's
over-scheduling (a large positive planning gap) and mid-week cutting (a large negative
execution gap) **cancelling each other out**, store by store, week after week. Labor % looks
fine on the P&L because the two errors mostly offset in the total — which is exactly why this
never surfaced before #210 split the number in two. A district that is +9 hrs on net looks
calm. A district where 21 stores swing wildly in both directions to land there is not calm at
all — it's chaotic, and every one of those swings is a real scheduling decision someone made
and then had to walk back.

## A correction to an earlier assumption

An earlier read of this data treated "0 stores ran over their own schedule" (i.e., every
store's `executionGapHrs` came in at or under the schedule it was actually given) as a possible
concern or artifact worth double-checking. It was wrong to treat that as suspicious. **It's the
arithmetic consequence of over-scheduling, not a definitional artifact of the split.** If a
store schedules well above need and then gets cut back toward need mid-week, the actual hours
worked will naturally land AT OR BELOW the (inflated) schedule almost every time — there's
nowhere else for the number to go once the schedule itself was set too high. Don't chase this
as if it were a bug; it's the shape you'd expect once you know the schedules are inflated.

## Why this matters for what gets built next

**Rank by combined gap, not by planning gap alone — but do NOT dollarize and sort by dollars.**
The Labor Analytics "Planning/Execution" tab (`labor-tools.js`) already sorts by
`Math.abs(combinedGapHrs)` descending, which is validated as the right call by this finding.
A purely dollar-ranked view (converting hours to $ and sorting by $ impact, the pattern used
successfully elsewhere in this repo — e.g. the Root-Cause Priority Matrix in `analytics.js`'s
FOB panel) would be the **wrong instinct here**, because a store whose over-scheduling and
cutting cancel out costs the P&L almost nothing in dollars, while still damaging the
operation — inconsistent staffing, GM/scheduler whiplash, unpredictable labor cost week to
week for the people living it. This is the first case in this project where "dollarize and
sort by dollars" would actively hide the finding it's supposed to surface. Combined-magnitude
ranking (not signed, not dollarized) is what catches a store that's +40/-38 (chaotic, nets to
+2, would rank near the bottom of a dollar-sorted list) as urgently as a store that's flatly
+40 (genuinely under-executing, costs real money).

**The Coach column logic in the same tab is validated — do not change that gate.** It already
reuses the panel's own `avCol` combined-gap banding (30/60 hrs) to decide "On plan" vs
attributing to Scheduler or Shift Manager, and attributes to whichever HALF (planning or
execution) has the larger magnitude when the combined gap says coaching is warranted. That
gate is correct as built: it will surface a chaotic +40/-38 store as needing the Scheduler
coached (planning is the larger of the two magnitudes) even though the combined number alone
looks fine — which is exactly the behavior this finding says is needed.

## What this does NOT change

- #210's engine (`engine/labor-gap-split.js`) and its computation of `planningGapHrs`/
  `executionGapHrs`/`combinedGapHrs` are unaffected — the math was already correct; this
  finding is about how to READ and RANK the output, not a bug in producing it.
- No code changes required by this finding alone. It's recorded here so a future session
  doesn't "fix" the `0 ran over schedule` observation, and doesn't quietly switch the sort to
  dollars thinking that's an improvement.

## Related

- `memory/project-labor-gap-split-210.md` — the engine and UI this finding is about.
- `memory/project-coaching-feedback-loop.md` §5 — "an item coached and not improved should
  escalate or re-diagnose" — a chaotic over-schedule/cut pattern that recurs week after week
  at the same store is exactly the kind of structural (not behavioral) signal that section
  anticipates the coaching loop eventually needing to recognize.
