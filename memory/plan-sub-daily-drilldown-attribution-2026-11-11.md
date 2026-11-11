---
name: plan-sub-daily-drilldown-attribution-2026-11-11
description: Scoping + Phase 1 build for the owner's "dial in the messaging" request (2026-11-11) — when a metric fires as an opportunity or a praise-worthy result, name which hour/quarter-hour drove it, and (when possible) attribute it to a person. Phase 1 (hour-level OEPE drill-down, no name attribution) is built and tested. Name attribution is researched and buildable but deliberately NOT built this pass — flagged as its own decision given the sensitivity of naming a person in a negative automated finding.
metadata:
  type: project
---

# Sub-daily drill-down + name attribution (owner request, 2026-11-11)

## The ask

Owner, verbatim: *"on our communication we are developing across the app, let's dial in the
messaging as well. For example if OEPE is an opportunity, let's identify it as we are now by
daily signal, but also point out what hours or even quarter hours had the biggest opportunity.
The opposite can be true for giving praise or shout outs for good results. You can do this with
most of the metrics. It will make it more personal and effective to users. When and if possible,
you can attribute shout outs, good or bad, to names of people associated to the results for even
more clarity."*

Two distinct asks: (1) drill a daily opportunity/praise signal down to the specific hour/
quarter-hour that drove it, across most metrics; (2) attribute that result to a named person,
when possible.

## A. Which metrics actually have sub-daily data (measured, not assumed)

| Metric | Sub-daily (`hour_slot`) data? | Source |
|---|---|---|
| OEPE, DT/FC/Kitchen(MFY)/Beverage timing, R2P, KVS Healthy Usage, Park% | **Yes** | `qsr_daily_activity`, PK `(loc,dt,hour_slot)` — raw per-slot `dt_untilserve/untilstore/heldtime`, `fc_untilserve/untilclosedrawer`, `mfy1/mfy2_untilserve`, `bev_*`, healthy/unhealthy counts |
| Sales, GC, channel mix | Yes | same table, per-slot `sales`/`gc`/mix fields |
| Labor %, Act vs Need | No — daily/weekly totals only | Glimpse/Controls/manual |
| FOB %, Cash O/S, T-Reds | No — daily/period aggregates only | Controls/FOB streams |

**Important finding:** `metric-source.js`'s `oepe` chain reads `qsrActSummaryRows`
(`qsr_daily_activity_rollup`), an already **daily-summed** rollup — every finding/brief in the
app reads OEPE pre-aggregated. The raw hour-level detail exists in the DB but nothing downstream
used it before this pass. `src/views/dt-speedofservice.js`'s `hourData`/`daypartData` is the one
place that already groups raw `qsr_daily_activity` by `hour_slot` — a real, shipped pattern, just
local to that component and never reused.

## B. Where opportunity/praise findings actually live

`src/features/morning-brief.js`'s `MORNING_RULES` (12 rules) is Daily Brief's real per-day
findings engine — genuinely single-day grain (via `metricDaily()`), unlike the separate 6-week
trailing-average findings `src/engine/pipeline.js` computes for the district-wide tiering used
elsewhere. Daily Brief is therefore the correct home for "OEPE was an opportunity **today**, and
here's the specific hour" — it already operates at the right grain; pipeline.js's trailing-average
findings do not (there is no single "today" to drill into).

The one existing rule that even gestures at sub-daily detail, `DAYPART_OEPE`, compares morning
vs. evening using `ds.peaksSvcRows` (the **manual** 3-Peaks upload) — a manual-only dependency,
which this app's standing "auto/emailed-first" rule means should never be a NEW finding's primary
source. Phase 1 below deliberately reads the auto-pulled `qsr_daily_activity` instead, never the
manual peaks upload.

## C. Name-attribution feasibility — verdict: buildable, but inferred, not automatic

`qsr_daily_activity` (the DAR) carries **no employee identifier** — register/station-aggregate
only. `lifelenz_shift_assignments` DOES carry `employee_name` and `business_role_id`/`role_name`
(real stations including "Drive Thru"/"Window") plus `shift_start`/`shift_end`. So a flagged
quarter-hour COULD join to shift_assignments by `(loc, date, business_role_id, time-overlap)` to
get a name — a real, buildable join. But it says who was **scheduled** on that station, not
confirmed to be physically on it that exact minute. Any such attribution must be worded as
inferred ("scheduled on Drive Thru during the 6pm block") never as settled fact.

**Precedent check:** this would NOT be the first time Meridian names a real employee against a
measured result — `src/engine/compliance-audit.js` and `src/engine/employee-performance.js`
already roll up named employees against violation counts, attendance, and lateness, as tabular
reports. It WOULD be the first time a *generated narrative sentence* (a Daily Brief finding, a
Huddle note, etc.) names someone in connection with a specific good/bad result. No CLAUDE.md PII
rule blocks this outright (the standing rules are about raw SSN/DOB fields, not generated text),
but naming someone in an automated, possibly-wrong, possibly-negative sentence is a real product/
tone decision — not purely a technical one.

**Deliberately NOT built this pass.** Flagged here as a real, scoped follow-on (join
`qsr_daily_activity`'s flagged slot to `lifelenz_shift_assignments` by loc/date/station/time-
overlap, word every result as "scheduled on," gate visibility to roles that already see
per-employee performance data today) — not attempted blind, and not silently shipped, given it's
the one piece of this ask with real exposure if worded wrong. Owner said "trust your judgement"
for Phase 1's open questions; this piece is called out on its own rather than folded in under
that same latitude, since a negative automated callout naming a real crew member is a different
order of consequence than a reworded sentence.

## Phase 1 — built (this pass)

**`worstOepeSlot(dar, {minTrans, worst})`** (`src/features/morning-brief.js`, exported) — finds
the real `hour_slot` that drove a store's daily OEPE hardest (or, with `worst:false`, the
strongest slot — the praise/shout-out mirror case), using the SAME reconciled `oepeSeconds()`
formula (`src/utils/oepe.js`) every other OEPE figure in the app is held to, not a new,
separately-calibrated one. `minTrans` (default 3) guards against naming a near-empty slot (one
car at open/close) as "the worst hour."

**`hourSlotLabel(slot)`** (`src/utils/oepe.js`, new, shared) — turns a real `hour_slot` ("17:00",
or a post-midnight wrap like "25:00") into a readable wall-clock label ("5pm", "1am"), folding the
business-day wrap via `%24` rather than re-deriving it per caller.

**Data plumbing:** `useBriefDarByLoc`'s per-store map gained a `.slots` array (additive — every
existing field/consumer is unchanged, confirmed by running the full suite + the existing
curated-home/morning-brief test files unchanged). `App.js`'s shared DAR fetch and the hook's own
fallback fetch both now also select `dt_untilstore`/`dt_heldtime` (needed for the reconciled
formula; `hour_slot` was already selected in App.js's fetch, added in the hook's own fallback
fetch).

**Wired into `STAFFED_SLOW`** (Daily Brief's "Manager Not Actively Managing Floor" rule — the
clearest existing "OEPE is an opportunity" finding): when a qualifying DAR slot exists, its
`action` text gains one sentence naming the real worst hour and its own OEPE/car-count, e.g.
*"Hardest hit: the 6pm hour (190s over 4 cars) — start coaching there."* Purely additive — the
existing headline/detail are untouched, and a store with no DAR slot coverage still gets exactly
the pre-existing daily-only finding (confirmed by a dedicated test case).

Covered by `src/__tests__/dispatch-oepe-hourly-drilldown-2026-11-11.test.js` (6 tests): pure
`worstOepeSlot()` behavior (worst-slot selection, `worst:false` mirror case, minTrans guard,
no-data null) plus a full `computeMorningBrief()` integration test proving the real finding gains
the real sentence, and a second proving it's silently absent without DAR coverage.

## Explicitly NOT done this pass (real follow-ons, not forgotten)

- **Other sub-daily-capable metrics** (sales, GC, channel mix, the other DT/FC/MFY/Bev timing
  metrics) — `worstOepeSlot`'s shape generalizes directly (same `.slots` data, different field),
  but only OEPE was wired into a real finding this pass, matching the owner's own worked example.
- **A "praise" rule.** `worst:false` already exists and is tested, but no MORNING_RULES entry
  currently fires a *positive* finding for excellent OEPE to attach it to — Daily Brief's rule set
  is watch/critical-only today. Adding a genuine praise rule is a real, separate product decision
  (what counts as praise-worthy, what severity tier it gets) — the plumbing is ready whenever
  that's built.
- **Extending beyond `STAFFED_SLOW`** to the other 3 existing OEPE-adjacent rules
  (`DT_PARK_LOW`-style, `KVS_OEPE_MISMATCH`, `KVS_SINGLE_SIDE`) — each would need its own judgment
  call about whether the slot detail adds value for that specific finding's framing.
- **Name attribution** (see §C above) — real, scoped, deliberately deferred.
