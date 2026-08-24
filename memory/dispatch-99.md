---
name: dispatch-99
description: Inventory Control's date control is a single-month <select> (src/views/eom-dashboard.js's dateControlSlot) -- no way to pick a specific past day or a range, so the owner can't pull up a previous completed week or day to check its count-cadence history. cycleCompliance()/analyzeCountCadence() already accept an arbitrary asOf date, so this is primarily a UI gap plus a data-loading scope gap (only one month's rows are ever fetched), not a new engine. Sequenced AFTER dispatch #97 and #98 -- same file, same date/period plumbing all three touch.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #99 — let Inventory Control's date control pick a specific day or range, not just a month

**Read first:** `memory/dispatch-97.md` and `memory/dispatch-98.md` (both Resolution sections, once
shipped) — this is the third piece of the same conversation about this panel, and touches the same
`period`/`asOf`/mode plumbing both of those do.

**This dispatch must not start until #97 AND #98 are both merged.** Three separate engineers
touching `src/views/eom-dashboard.js`'s date/mode wiring at once is a guaranteed collision; running
them in sequence (97 → 98 → 99) keeps each one small enough to verify cleanly.

**Status:** ready to hand off once #97 and #98 land. Scope is clear; exact UI shape (single date vs.
true range) needs a quick owner confirmation before implementation — see "Open question" below.

---

## What the owner asked

*"For the date picker, allow range as well in the event I want to pull up previous completed weeks
or days."*

## Current state, located

`dateControlSlot` (~line 2143-2146) is a plain `<select>` bound to `period` — a single whole month
(e.g. `"2026-08"`), populated from a `periods` list. There is no day-level or range selection
anywhere in this panel today. `period` drives every data load in the file at month granularity
(`loadQsrOnHand({period})`, `loadQsrRawItemDetail({period})`, etc. — grep `{ period` in this file
for the full list before changing the loading shape).

**The underlying engines already support finer granularity — this is mostly a UI + data-scope gap,
not a new engine.** `cycleCompliance(rows, { asOf })` (`count-cycle.js`, dispatch #97's basis) and
`analyzeCountCadence(rawItems, { asOf })` both already accept an arbitrary `asOf` day and compute
correctly relative to it — `period` currently controls only which month's rows get *fetched*, not
what date the compliance math is evaluated as-of. The gap is: (1) no UI to pick a day within (or
before) the current month, and (2) `qsr_onhand`/`qsr_raw_item_detail` are only ever fetched for the
one selected `period`, so looking back further than the current month's data currently loads nothing
older.

## Open question — resolve with the owner before building, don't guess

"Allow range as well" could mean two different things:
1. **Pick a single past date** ("show me as of two Fridays ago") — reuses `asOf` almost as-is, just
   needs a day-level control instead of a month dropdown, plus fetching the relevant prior month(s)
   of `qsr_onhand`/`qsr_raw_item_detail` when the picked date falls outside the current one.
2. **Pick a start/end range** ("show me everything between these two dates") — meaningfully bigger:
   Count Cycle's session-list view already shows a timeline per store, so a range might mean
   "filter that timeline to this window" rather than a single as-of snapshot; EOM's per-period
   model doesn't have an obvious range-based read at all (EOM is inherently a single period's
   completion, not a span).

Ask which one solves the owner's actual need ("pull up previous completed weeks or days" reads more
like #1 — a past point in time — but "range" is explicit) before scoping the implementation size.

## Verification bar

- Whatever shape is chosen, verify it against real past data: pick a date/range from at least two
  weeks back and confirm Count Cycle's `cycleCompliance` output for that `asOf` matches what a
  direct live pull computes for the same date (same discipline dispatch #96/#97's own verification
  used).
- Confirm EOM mode's existing month-based behavior is unaffected if the date control's shape changes
  — EOM's `period` selection should keep working exactly as it does today.
- Loading data for a past date/range must not silently balloon the initial page load for the common
  case (viewing the current period) — confirm the extra fetch only happens when a past date is
  actually selected, not eagerly on every load.

## Do NOT

- **Do not start before #97 and #98 are both merged.**
- **Do not guess between "single past date" and "true range"** — confirm with the owner first, per
  the open question above.
- **Do not change EOM mode's fundamentally month-based model** — EOM is a period-completion
  concept; only Count Cycle (and possibly Scoreboard) obviously benefit from a finer-grained or
  ranged view.
