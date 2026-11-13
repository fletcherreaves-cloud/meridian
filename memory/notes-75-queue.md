---
name: notes-75-queue
description: Field notes batch 75 (owner, 2026-11-12 night) — GM daily-routine data model spec,
  first of three roles (Supervisor/OM to follow). Feeds the new "answer the questions up front
  each day" initiative — reusing/expanding existing panels rather than building a parallel
  system. Raw capture first per this repo's own "commit every memory file in the same commit as
  the work that cites it" rule.
metadata:
  type: project
---

# Notes 75 — GM daily-routine data model (owner, 2026-11-12 night)

Owner, verbatim, framing the ask: *"Ok, indulge me...I am going to present you a flow for GM,
Supervisor, then an Ops Manager on what their daily routine, data wise, generally consists of.
You challenge is to figure how to incorporate this into what we have already built to see if we
can answer the questions up front each day."*

Context: this follows up on an earlier same-night message describing a broader goal — bring GM/
Area Supervisor/OM routine-checklist items to the surface with real prominence on login, reusing/
expanding existing panels (Curated Home, Morning Brief, etc.) rather than building a parallel
system — and a promise to attach a routines reference guide per role. Three PDFs attached this
message: `General_Manager_Routines_2022.pdf`, `Operations_Mgr._Routines_2022.pdf`,
`Supervisor_Routines_2022.pdf` — same substance as the three uploaded earlier in this session
(1/20/2022-dated, originally logged in `memory/plan-role-based-panel-gating-2026-11-03.md`), not
new documents. Supervisor and OM's own data-flow notes are **explicitly not in this message** —
owner said "I'll list as a note" and numbered this batch 75, following the Notes-NN field-note
convention; Supervisor/OM equivalents are expected in a follow-up batch.

Also in this message, unrelated to routines: **HME Cloud + Squadle GitHub Secrets have been
added** (`HME_USERNAME`/`HME_PASSWORD`/`SQUADLE_USERNAME`/`SQUADLE_PASSWORD`) — task #105's two
pulls can now be dispatched to confirm their first real write.

## GM — daily routine, data-wise (owner's own words, verbatim)

> Read attachment and take any relevant data to build out a model. Don't get hung up on specific
> days of the week, unless you feel like they matter.
>
> My Take from memory of being a GM many years ago >
> - Verify Cash Controls
>   - Safe Contents
>   - Cash Drawers
> - Review Previous Days Results - Maybe after doing all the below, lets also analyze it by
>   depart and report on that as well.
>   - Check Operations Report for the following
>     - Sales - Vs targets while identifying problem time frames and making them stand out.
>       - Product Sales (Actual, +/- vs LY)
>       - Guest Count (GC) (Actual, +/- vs LY)
>       - DT % of Sales
>       - Breakfast % of Sales
>       - Eat In % of Sales
>       - McDelivery % of Sales
>       - MOP % of Sales
>       - Kiosk % of Sales
>     - Service - Looking for vs Targets (Daily and Day Part) > Provide deeper level detail when
>       something is out of acceptable range by literally pointing out the times of day that were
>       the issue. Equally call out the positives along with times of day.
>       - OEPE W/O Parked
>       - DT Parked %
>       - R2P
>       - KVS Time
>       - 2nd Side Healthy Usage %
>     - Controls - Same logic, compare vs targets and dive in and present findings so manager
>       does not have to go looking
>       - Labor
>         - Punched Labor %
>         - Act Hours
>         - TPPH
>         - OT Hours
>         - Act vs Scheduled
>         - Act vs Needed
>       - Cash
>         - Cash +/-
>         - Promos
>         - T-Red Before
>         - T-Red After
>         - Refund
>         - Overirng [sic — Overring]
>         - Empl/Mgr Meal
>     - FOB - Same logic, compare vs targets and dive in and present findings so manager does not
>       have to go looking
>       - FOB %
>       - Comp Waste %
>       - Raw Waste %
>       - Condiment %
>       - Empl Meal %
>       - Stat Var %
>       - Unexplained %
>       - Disc Coupon %
>       - Paper Cost %
> - Review Tickets and make sure any pending maintenance and repair items are logged (Maintenance
>   and Technology)
> - Review Calendar
>   - Current and upcoming Promotions (Expected impact)
>   - Current and upcoming events
>   - Payroll Released as needed (You can use every other Wednesday starting on 11/18/26)
>   - Truck Orders (Martin Brower) - Store specific order days
>   - Other calendar events (Games, concerts, community events, impacts, etc.) - List expected
>     impacts

## Status

**✅ Phase 2 SHIPPED (v5.765, 2026-11-13) — Supervisor/OM patch rollup, per the owner's own
routine notes in `memory/plan-role-based-panel-gating-2026-11-03.md` §6.** `DailyReviewPanel` now
has a Store/Patch toggle; Patch mode picks a real supervisor patch (`supervisorGroups()`, filtered
to the stores actually in scope), adds Today/WTD/MTD window tabs (the owner's own ask — "Supervisor
and OM levels especially should also see WTD and MTD"), and reuses the SAME section/line
definitions as the GM view so every existing render component works unchanged. New engine
functions `buildPatchDailyReview`/`buildPatchHotspots` (`src/engine/daily-review.js`) are additive
— the GM store-grain path is untouched, proven byte-for-byte identical by the existing test suite.
Dollar/hours/count lines are a true sum across stores and days; rate/% lines go through
metric-source.js's `metricRate` (real Σ/Σ, never a mean of store percentages); Sales/GC vs LY goes
through vs-ly.js's `matchedVsLY`. A worst-first hotspot list (reusing `buildDailyReview` per store)
surfaces which stores need attention, clicking one jumps straight to its Store view. Not built this
pass: the Tickets/Calendar section (still flagged below as a cheap follow-on) and the "break out by
daypart" idea the owner offered as a maybe, not a firm requirement.

**Phase 1 shipped same night (v5.751, task #105-adjacent new build), owner explicitly authorized
going bigger than a mockup: "if you determine a parallel system is a better fit, by all means
proceed that direction... have fun with this one."** New engine `src/engine/daily-review.js` +
panel `src/views/daily-review.js` (registry id `daily-review`, Test Kitchen, section
`operations`) assemble yesterday's Sales/Service/Controls/FOB vs target for one store, reusing
`metric-source.js`/`vs-ly.js`/`getTargetsForDate` — no new data source. Feasibility crosswalk
against the GM list above: **every metric already had a real source and a real target except
Paper Cost %** (target exists in `DEFAULT_TARGETS.tPaperCost`, no `metric-source.js` actual-value
key yet — flagged in the engine's own comment, not silently dropped). "Eat-In % of Sales" also
has no direct source (implicitly a remainder of the other channel %s, not independently
measured) — left uncomputed rather than guessed. Service section calls out the worst/best
DAYPART per OEPE/R2P/KVS Time from the raw hourly DAR rows (same source DT Speed of Service
already uses), both directions as the owner asked. "Verify Cash Controls" (Safe Contents/Cash
Drawers) has no digital source (physical count) — not attempted this pass. Tickets/Calendar
(maintenance, promotions/events/payroll-release/truck-orders) deliberately NOT built this pass —
cheap, well-scoped follow-on once Supervisor/OM notes land, to avoid shipping four rich sections
plus two shallow ones in one pass. GM-only; Supervisor/OM data flows still pending from the
owner — this engine is designed so a patch/district rollup extends it, not a rewrite.
