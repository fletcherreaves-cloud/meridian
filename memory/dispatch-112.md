---
name: dispatch-112
description: Weekly Count Cadence widget (CadenceMonitor, src/views/eom-dashboard.js, fed by cadenceFromOnHand in the same file) -- owner wants the "count day" column verified/fixed, a new "last count" column (even if incomplete), new per-class uncounted-item columns for Food/Condiment/Paper (Paper only meaningful mid-month), and the drilldown to list missed items by class. Investigation found cadenceFromOnHand (dispatch #97's engine) computes count-day and missing-items in a way that likely under-populates count-day and completely omits Paper -- and, critically, count-cycle.js's own cycleCompliance() function ALREADY computes most of what's being asked for (paperThisMonth/paperMissing mid-month tracking, per-class counted/active, a true most-recent-session concept) but cadenceFromOnHand never reuses it, a second/third reimplementation of the same domain concept this repo has hit before.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #112 — Weekly Count Cadence: count-day population, Last Count column, per-class F/C/P uncounted columns, full-class drilldown

## Owner's ask, in full

*"For the weekly count cadence > let's make sure the count day is populating. Also add a column for
last count (put the date of the last count even if incomplete) and a column each for how many items
uncounted for each of the classes (F/C/P(if mid month)). Inside the drop down, list all missed items
by class as well."*

## Where this lives

`CadenceMonitor` (`src/views/eom-dashboard.js`, the 🗓 Weekly Count Cadence table on the Count Cycle
tab of Inventory Control) is fed by `cadenceFromOnHand()` in the same file — the engine dispatch #97
built to replace the old `weekly-cadence.js`/`qsr_raw_item_detail`-basis cadence detection with a
`qsr_onhand`/`detectSessions()`-basis one. Current table columns: `['Store', 'Counts on', 'Last full
count', 'This window', 'Status']`.

## ⚠️ Found while investigating: `cycleCompliance()` (count-cycle.js) already computes most of this — reuse it, don't reimplement

`cadenceFromOnHand()` calls `detectSessions(rows)` directly and then re-derives its own weekly-
completion grading (`_classDoneAt98`, EOM's 98% bar — this is deliberate, see dispatch #97's own
comment, do not change it). But `count-cycle.js`'s `cycleCompliance(rows, {asOf})` — the function
that already powers the Count Cycle tab's own per-store compliance rows — calls the SAME
`detectSessions()` and already computes, per store, exactly three things this dispatch needs:

- **`paperThisMonth`/`paperMissing`** — real, tested, already-shipped mid-month-Paper tracking.
  `paperThisMonth = all.some(s => s.date.slice(0,7)===month && s.satisfiesMidPaper)`;
  `paperExpected = dayNum >= 12 && dayNum <= lastDay-4`; `paperMissing = paperExpected &&
  !paperThisMonth`. **This is exactly the "P (if mid month)" semantics the owner is asking for** —
  Paper has its own once-a-month-ish cadence, separate from the weekly Food+Condiment cadence, and
  only "counts as missing" once the month is far enough along to expect it and not yet so late that
  the EOM close-window count will cover it anyway. `satisfiesMidPaper` itself comes from
  `detectSessions()`'s own per-session `sessionQualities()` output — already computed on every
  session `cadenceFromOnHand` already has in hand, just never read.
- **`perClassCounted()`** — per store, per class (`Food`/`Condiment`/`Paper`/`Non-Product`):
  `{active, counted, date}` from the most recent session that touched that class at all. This is the
  per-class "how many items uncounted" building block (`active - counted` = uncounted count) for
  all three of F/C/P in one already-tested function.
- **`lastAny`** (`cycles[cycles.length-1]`, `cycles = all.filter(s => !s.isSpot)`) — a genuinely
  different "last count" concept than `cadenceFromOnHand`'s own `lastAttempt` (see below).

**Do not write a second implementation of mid-month-Paper detection or per-class counted/active
tallying.** Either call `cycleCompliance()` directly from wherever `cadenceByLoc` is built and merge
its relevant fields into the record `CadenceMonitor` reads, or extend `cadenceFromOnHand()` to read
the same already-computed per-session flags (`satisfiesMidPaper`, etc.) that `detectSessions()`
already attaches to every session — whichever integration is cleaner once you're in the code. Verify
first whether `cycleCompliance()`'s own weekly-completion bar (`COVER_FRAC=0.75`) leaking into
anything you reuse would contradict dispatch #97's deliberate 98%-bar decision for the *weekly F/C*
grading — it should not, since Paper mid-month/per-class-counted are independent of that specific bar,
but confirm rather than assume.

## Item 1 — verify (and likely fix) "count day" population

`detectedWeekday`/`detectedWeekdayName` in `cadenceFromOnHand()` are computed **only from sessions
where `weeklyDone === true`** (both Food AND Condiment ≥ 98%, dispatch #97's deliberately strict
bar) — `dayFreq` is built exclusively from `weeklyDays = graded.filter(s => s.weeklyDone)`. If a
store frequently attempts its weekly count on a consistent day but rarely lands both classes at a
full 98% simultaneously, `weeklyDays` will be sparse or empty and the "Counts on" column will read
"—" even though the store has an obvious, real pattern.

**Measure this live first** (this repo's own standing rule) — pull real `qsr_onhand` data, run
`cadenceFromOnHand()`, and check what fraction of stores show a populated vs. blank "Counts on"
value, and cross-check a few blank ones by hand against their actual session dates to see whether
they have a real day-of-week pattern in their `touchedWeekly` (any real Food/Condiment attempt,
regardless of completion) sessions that the current `weeklyDone`-only filter is missing. If the
population rate is genuinely low and a broader signal exists: **broaden day-detection to use
`touchedWeekly` sessions** (already computed, any real Food or Condiment attempt) instead of only
fully-`weeklyDone` ones, while leaving the separate `weeklyDone`-based Overdue/On-Track status grading
completely untouched — day-of-week pattern detection and completion-status grading are different
questions and dispatch #97 was explicit that the 98% bar for *status* is deliberate. If measurement
shows something else is actually wrong (e.g. a real display bug, not a population-rate issue), fix
that instead — don't assume the diagnosis above is correct without checking.

## Item 2 — new "Last Count" column (date of the last count, even incomplete)

Add a column showing the date of the store's most recent count activity, regardless of
completeness. **Two existing, different candidate definitions already exist in this codebase — pick
the one that actually means "the last count," don't silently default to whichever is easiest:**

- `cadenceFromOnHand()`'s own `lastAttempt` — picks the **largest** touched session (by combined
  Food+Condiment item count), tie-broken to more recent. This answers "what was the real count
  effort" (used today for the "still uncounted since" drilldown text), not strictly "when was the
  most recent activity" — a small stray touch yesterday would NOT become `lastAttempt` if a bigger
  session happened 3 days ago.
- `cycleCompliance()`'s `lastAny` — the chronologically last non-spot session.
- Neither may be exactly "the literal most recent date any count activity happened, however small"
  — if the owner's ask is that literal, a new field (simplest: the max date across all `graded`
  sessions, no size/quality filter at all) may be needed. **Verify which reading matches what the
  owner actually wants to see** by considering the use case (a manager glancing at the table to know
  "when did this store last touch inventory at all") — if genuinely ambiguous after investigating,
  default to the simplest literal reading (true most-recent date, any touch) since that's the most
  defensible interpretation of "even if incomplete," and note the alternative readings in your
  Resolution so it's easy to correct if wrong.

## Item 3 — new per-class uncounted-item columns: Food, Condiment, Paper (Paper mid-month-aware)

Add three columns (or a compact combined "F/C/P" cell, matching this table's existing dense style —
implementation choice) showing how many items are currently uncounted in each of Food, Condiment,
and Paper:
- **Food / Condiment**: `cadenceFromOnHand()` already computes a `missing` array via
  `diagnoseIncompleteCount()`, currently filtered to `cls === 'food' || cls === 'condiment'` — the
  per-class item COUNT is already sitting in `missing[i].count` for each. Surface it per class.
- **Paper**: not currently computed by `cadenceFromOnHand()` at all. Per the "reuse, don't
  reimplement" note above, source Paper's uncounted count from `cycleCompliance()`'s
  `perClassCounted()` (`active - counted` for `cls==='Paper'`) gated on `paperMissing` — **only show
  a Paper uncounted count when Paper is actually due** (i.e. `paperMissing` is true, the "if mid
  month" qualifier), not unconditionally; when Paper isn't yet expected or has already been
  satisfied this month, the Paper column should read as not-applicable/blank/dash, not a misleading
  0 or a stale count. Match the styling/interaction pattern the existing `ClassChips`/ `missingSummary`
  cells already use in this same file for consistency (color coding, hover detail) rather than
  inventing a new visual language for these three columns.

## Item 4 — dropdown lists missed items for ALL classes, not just Food/Condiment

Once item 3 broadens `missing`'s class filter to include Paper (removing the current `cls ===
'food' || cls === 'condiment'` restriction, or merging in a Paper-specific missing-items list
sourced the way item 3 describes), the existing dropdown rendering
(`c.missing.map((b,i) => ...)` inside `CadenceMonitor`'s expanded row) already generically renders
whatever classes are present in the array — verify this "just works" once item 3 lands rather than
assuming; the render loop has no class-specific logic today so it should, but confirm by actually
opening a store's dropdown with a real Paper-missing item and checking it renders correctly, with a
correct item list (not just a correct count).

## Verification bar

- Item 1: live-measure the "Counts on" population rate before and after any change, against real
  `qsr_onhand` data — don't just confirm the code runs.
- Item 2: render the actual `CadenceMonitor` table and confirm the new Last Count column shows a
  sensible date for a store with only incomplete/partial recent activity (construct or find a real
  example), and confirm it differs meaningfully from "Last full count" for at least one such store.
- Item 3: render the table and confirm Food/Condiment/Paper uncounted counts are correct against a
  hand-computed check for at least one real store with a genuine gap in each class (per this
  session's established discipline of hand-verifying against raw data, not just trusting the
  function). Confirm the Paper column correctly goes blank/N-A outside its mid-month-due window for
  a store that hasn't hit that window yet.
- Item 4: open a real store's dropdown with a genuine Paper gap and confirm the item list (not just
  a count) renders, matching the existing Food/Condiment item-list rendering style.
- Full suite green, `npm run build` clean, before/after entry-chunk gzip numbers in the commit body.

## Do NOT

- **Do not reimplement mid-month-Paper detection or per-class counted/active tallying** —
  `count-cycle.js`'s `cycleCompliance()`/`perClassCounted()`/`detectSessions()`'s own
  `satisfiesMidPaper` flag already do this; reuse them.
- **Do not change the 98%-bar weekly Food+Condiment completion grading** (Overdue/On-Track status,
  `weeklyDone`) — that's dispatch #97's deliberate, owner-scoped decision; this dispatch only
  touches count-day detection's INPUT population and adds new columns, not the status math.
- **Do not silently pick a "last count" definition without considering the real alternatives above**
  — flag your reasoning in the Resolution even if you do end up picking the simplest one.
- **Do not show a misleading Paper uncounted count when Paper isn't actually due yet** — respect the
  mid-month gating (`paperExpected`/`paperMissing`), don't just always show `active-counted`.
