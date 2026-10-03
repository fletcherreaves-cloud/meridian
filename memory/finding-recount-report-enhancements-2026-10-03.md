---
name: finding-recount-report-enhancements-2026-10-03
description: Closed the 3 real gaps found when auditing the Recount-Impact Report against the owner's original ask (which locations recounted, dollar AND percent, weekly coverage) -- most of the report was already solid; this adds a per-location Y/N summary, item-level percent alongside the existing dollar figures, and an EOM/Weekly mode toggle.
metadata:
  node_type: memory
  type: finding
---

# Recount-Impact Report: closed 3 real gaps (2026-10-03)

## What was asked

Owner, verbatim (2026-10-02): *"I want to be able to go back and determine which locations
performed any recounts for weekly and eom inventory. Especially EOM. It would be nice to list
the items recounted along with a simple recounts performed or not. If we want to carry it
further diagnostically, let's also include whether the recount helped or hurt matters. If
possible show FOB at time of original count and then after recount occurred and assign a
dollar and percent to it."*

## What was already there (verified by reading the real code, not assumed)

`src/views/eom-recount-report.js` (`EOMRecountImpactPanel`) + `src/engine/eom-ledger-baseline.js`
already had: item list grouped by location, helped/hurt verdict with genuinely good nuance
(`recountVerdictText()` distinguishes "corrected an undercount" from "corrected an overcount" —
those move food cost in OPPOSITE directions), and item-level $ before→after (Baseline →
Post-Recount → Δ).

## The 3 real gaps, closed

1. **No per-location recount Y/N roll-up.** A store with zero recounted items simply never
   appeared in the report. Added `recountLocationSummary` (`eom-dashboard.js`) — every in-scope
   store, `recounted: true/false`, items/helped/hurt/net — rendered as a new table above the item
   list, in both the live panel and the Copy/Print exports.
2. **Dollar only, no percent.** Item `baseVar`/`curVar`/`dMag` are now also expressed as a percent
   of that store's period sales (`r.components.sales`, already loaded — no new data pull) —
   `basePct`/`curPct`/`dPct` on each row, shown via `moneyPct()` as `"$-300 (-0.30%)"` rather than
   doubling the column count with separate $ and % columns.
3. **EOM-only, no weekly.** The report was hardcoded to `closeWindowStartFor(period, 3)` (last 3
   calendar days of the month). Added a `mode` state (`eom` default / `weekly`) with a toggle in
   the report header — `weekly` passes `{ autoWindowDays: 3 }` to `ledgerBaselineDiff()` instead of
   `{ closeWindowStart }`, the SAME recount-clustering already proven live on the At-A-Glance
   "Items Recounted" tile (`ItemsRecountedTile`, `at-a-glance.js` v3) — not a new algorithm, just
   exposing the second windowing strategy the engine already supported on this specific report too.

   Owner's own framing on priority (2026-10-03): *"EOM actually matters, weekly would be nice but
   needs to begin mattering as well."* So EOM stays the default; Weekly is a real, one-click option
   now rather than a separate build.

## What was deliberately NOT built

**Store-level aggregate FOB % before/after** (the kind `ledgerScopeDiff()`'s `fob: {baseFobPct,
curFobPct, dFobPct}` already computes for the separate "Change Monitor" tab) was considered and
scoped out. That field requires an async `loadEomSnapshots({kind:'count-complete'})` fetch this
report doesn't otherwise need — Change Monitor only has it because it's fetched on-demand when a
user opens that tab. The owner's literal ask ("FOB at time of original count and then after
recount occurred... dollar and percent") reads as ITEM-level, not store-aggregate, and the
item-level percent (gap #2 above) answers it directly without the extra async complexity. If a
store-level FOB%-before/after is wanted later, it's a scoped follow-on (reuse `openMonitor`'s own
`ccFob`/`loadEomSnapshots` pattern), not bundled into this pass.

## Test coverage

Extended `src/__tests__/dispatch-227-eom-reports.test.js` (the file's own established pattern:
render the REAL `EOMDashboardPanel` → tab-click chain, not an isolated engine call) with 3 new
tests: percent renders alongside dollar for a real recounted item; the location summary lists
BOTH a recounted store (✓ Yes) and a zero-recount store (— No) in the same render; and the
EOM/Weekly toggle actually changes detection (a mid-month 2-day-apart recount pair, fixture item
RJ2, is invisible in EOM mode and appears only after clicking "Weekly" — proving the toggle isn't
cosmetic). Fixed one pre-existing test (`an unrecounted item... does not appear`) whose
`tbody tr` selector started also matching the new location-summary table's rows — scoped it with
`.eom-recount-location-summary` exclusion.

SAGE's `query_eom_recount_impact` tool (`sage-chat/index.ts`) calls `ledgerScopeDiff()` directly
and independently — confirmed unaffected, since only new OPTIONAL params were added to the shared
engine functions, nothing about their existing signature/behavior changed.

13/13 tests passing in the extended file, full suite 5261/5261, build clean.
