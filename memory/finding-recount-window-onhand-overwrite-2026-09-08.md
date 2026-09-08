---
description: Real production bug — Madill (loc 13113) recounted a bad weekly count the next day and the At A Glance Items Recounted tile never showed it. Root cause, live measurements, and the fix (inv_count_sessions wired in, window anchor extended backward).
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

## What's still not fully closed

`inv_count_sessions` only accumulates from whenever the pull first ran (its own schema
comment: "cannot recover sessions qsr_onhand has already overwritten") — history builds
forward, same honest limitation as the table's own design doc states. Not a defect in this fix;
self-resolving as the log accumulates. The onhand-based path stays as the fallback for any gap.
