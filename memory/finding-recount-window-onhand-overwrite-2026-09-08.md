---
description: Real production bug — Madill (loc 13113) recounted a bad weekly count the next day and the At A Glance Items Recounted tile never showed it. Root cause, live measurements, the first fix (inv_count_sessions wired in), and the SIMPLER final fix the owner pushed for (derive the window purely from qsr_raw_item_detail — see "Simplified" section at the bottom).
---

# Items Recounted tile missed a same-item next-day recount (Madill, loc 13113, 2026-09-08)

## The report

Owner: *"Madill (13113) counted weekly inventory yesterday and it was horrible (~7.00% FOB),
they were made to recount today. That should show up as a recount for weekly in app. It does
not. Even if on another day. As lines in same period, items counted again should be reviewed
as recounted."*

## Root cause, measured live

`qsr_onhand` upserts on `(loc, period, wrin)` — one row per item, **overwritten on every pull**.
`last_counted` is rolling-latest state, not an event log. Queried Madill's live snapshot
2026-09-08: **every Food/Condiment item showed `last_counted: 2026-09-08`** — there was no
`2026-09-07` anywhere in the table for those items. The bad 09-07 session wasn't stored as
"09-07" anymore; recounting the same items on 09-08 overwrote the date in place.

That broke recount detection two ways:
1. `weeklyRecountWindows()` (`src/engine/count-cycle.js`) derives a store's `lastWeekly` date
   from `cycleCompliance()`, which reconstructs sessions from `qsr_onhand`'s live snapshot —
   so it now read 09-08, never 09-07.
2. Even the finer per-item event history that DOES survive (`qsr_raw_item_detail.history` —
   confirmed live: wrin 00005-086 has 5 real count events, two on 09-07, three on 09-08)
   couldn't help, because the window only ever looked FORWARD from `lastWeekly.date`. Anchored
   at 09-08 (the day of the recount itself), there was no earlier day inside the window to
   diff against.

## What was already there, unused

`inv_count_sessions` (`supabase/schema-inv-count-sessions.sql`) is an **append-only** log, one
row per `(store, count_date, class)`, written daily by
`scripts/qsrsoft-onhand-pull.mjs`'s `deriveSessionRows()` — built specifically to fix this
class of problem ("Notes 58 #1"). Queried live: it correctly holds BOTH dates as distinct rows
— `2026-09-07` (Food 59/114, Condiment 8/37, `covered:false`, the real Partial/~7% FOB count)
and `2026-09-08` (Food 114/114, Condiment 37/38, `covered:true`, the real Weekly redo). **But
nothing in `src/` ever read this table** — `detectSessions`/`cycleCompliance`/
`weeklyRecountWindows` still reconstructed sessions from the live `qsr_onhand` snapshot alone.
It was a write-only orphan.

## The fix (v5.405)

1. `count-cycle.js`: added `sessionsFromLog()` (converts `inv_count_sessions` rows into the
   same session shape `detectSessions()` produces), `cycleComplianceFromLog()`, and
   `weeklyRecountWindowsFromLog()`.
2. `weeklyRecountWindows`'/`weeklyRecountWindowsFromLog`'s shared window logic
   (`windowsFromCompliance`) now walks the window start **backward** through any
   immediately-preceding session within `windowDays` of the qualifying one — a tight cluster
   of close-together counts (bad count + quick redo) is treated as one cycle, whatever each
   individual session's own coverage. Does NOT reopen the problem `windowDays` exists to
   prevent: two genuinely-weekly counts ~7 days apart have a gap far outside `windowDays`, so
   the earlier one is never absorbed and the following week still gets its own fresh window.
3. `src/lib/supabase.js`: added `loadInvCountSessions({ period })`.
4. `at-a-glance.js`'s `ItemsRecountedTile` now merges `weeklyRecountWindowsFromLog` (preferred)
   over `weeklyRecountWindows` (onhand-based fallback, for a store/period the log hasn't
   accumulated history for yet).

## Why the onhand-based clustering fix alone couldn't close Madill's exact case

Tested this directly: when a LATER full weekly count touches literally every item (100%
coverage, by definition), it necessarily re-touches — and overwrites — every item any EARLIER
partial count on the SAME classes touched too. There is no window-anchor trick that recovers a
date `qsr_onhand`'s snapshot has already lost. Only the durable log (dates independent of
per-item overwrite) can solve the same-item-recount case; the window-backward-extension fix is
real and correct, but it only helps the onhand path for a *different* pattern (disjoint classes
counted close together, e.g. Paper one day + Food/Condiment the next).

## Verification

- 3 live Supabase measurements: `qsr_onhand` (confirms the overwrite), `inv_count_sessions`
  (confirms both dates survive there), `qsr_raw_item_detail.history` (confirms the per-item
  event trail also survives, but couldn't help without a window that reaches it).
- 7 new/changed regression tests (`count-cycle.test.js`, `at-a-glance-weekly-recount-tile.test.js`)
  using the real captured Madill numbers.
- Full suite 4639/4639, build clean, 538.08 KB / 850 KB budget.

## What's still not fully closed (as of the FIRST fix, superseded below)

`inv_count_sessions` only accumulates from whenever the pull first ran (its own schema
comment: "cannot recover sessions qsr_onhand has already overwritten") — history builds
forward, same honest limitation as the table's own design doc states. Not a defect in this fix;
self-resolving as the log accumulates. The onhand-based path stays as the fallback for any gap.

---

## Simplified (same day, owner follow-up): "should be easy to get from the raw item detail"

Owner, immediately after the first fix above shipped: *"The different count data should be
easy to get from the raw item detail. We need to make this happen. Thought we already were."*

Right call. `qsr_raw_item_detail.history` is a genuine per-transaction EVENT LOG — never
overwritten, unlike `qsr_onhand`'s rolling-latest snapshot — and `ledgerScopeDiff`/
`itemCloseWindowRecount` (`eom-ledger-baseline.js`) already read it for the actual $ diffing.
The ONLY thing the qsr_onhand/inv_count_sessions machinery above was for was supplying the
window BOUNDS (`closeWindowStart`/`closeWindowEnd`) — and that's derivable straight from the
item's own count-day history, with no store-level "session" or "coverage" concept needed at
all.

**Final design:** `itemCloseWindowRecount` gained an `autoWindowDays` option. When no explicit
`closeWindowStart` is supplied, it derives one INTRINSICALLY per item: walk backward from the
item's most recent count-day through any immediately-preceding day within `autoWindowDays` —
a tight cluster of close-together counts (bad count + quick redo, any number of days apart) is
one cycle; a gap wider than `autoWindowDays` (ordinary weekly cadence, ~7 days) is not, so a
routine week-over-week count is never misread as a recount of the one before it. Same
protection the original `windowDays` design carried, now computed with ZERO external inputs
beyond the item's own history.

`ItemsRecountedTile` (`at-a-glance.js`) now calls `ledgerScopeDiff(rawByLoc, perLoc,
{ autoWindowDays: 3 })` directly off `qsr_raw_item_detail` + `qsr_variance_stat` — no
`loadQsrOnHand`, no `loadInvCountSessions`, no `weeklyRecountWindows`/
`weeklyRecountWindowsFromLog`, no per-store gating at all. Every store with raw item-detail
rows participates; a store/item that doesn't cluster simply contributes zero recount activity,
rather than being excluded up front by a separate "does this store have a qualifying weekly
session" check.

**What stays from the first fix:** `count-cycle.js`'s `sessionsFromLog`/
`cycleComplianceFromLog`/`weeklyRecountWindowsFromLog` and the `inv_count_sessions` table
itself are NOT reverted — they're real, tested, working infrastructure that answers a
genuinely different question (whole-CLASS coverage completeness, e.g. "did this store count
95%+ of Food AND Condiment this week" — a question `qsr_raw_item_detail` structurally cannot
answer, since it's dollar-filtered to the top-50 actionable WRINs and would never see
low-dollar Condiment items at all, per this file's own original header comment). They remain
available for the Count Cycle compliance panel or any future consumer that needs the full
item-universe coverage question; only the recount TILE's dependency on them was the
overcomplication, and that's what got removed.

**Verification:** 6 new/changed regression tests (`eom-ledger-baseline.test.js`,
`at-a-glance-weekly-recount-tile.test.js`) using the real captured Madill numbers, including a
genuine 3-count cluster and the explicit-window-still-wins case. Full suite 4643/4643, build
clean, 538.03 KB / 850 KB budget (slightly smaller — two fewer loader dependencies in the
tile's bundle).
