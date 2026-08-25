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

## Resolution (2026-08-25, v5.156)

All four items shipped in `src/views/eom-dashboard.js` (`cadenceFromOnHand()`/`CadenceMonitor`) +
one one-line export added to `src/engine/count-cycle.js`. New tests:
`src/__tests__/dispatch-112-count-cadence.test.js` (10 tests, all render/exercise the actual
consumers, not isolated engine calls). Full suite 2393/2393 passing (231 files) including the
pre-existing dispatch-97/dispatch-98 suites unchanged. Build clean. Entry gzip 456.87 → 456.89 KB,
eager-payload 528.01 → 528.03 KB (budget 850 KB) — noise-level; `eom-dashboard`'s own lazy chunk
grew 65.20 → 65.67 KB gzip.

Also, per the panel-contract standing rule that landed on `main` mid-session (2026-08-25, "touching
a panel for any reason? also check it against the panel contract"): `CadenceMonitor`'s table had no
`overflowX:'auto'` wrapper at all before this dispatch, and this dispatch was already widening it
5 → 7 columns — the exact scenario the rule calls out as worth fixing opportunistically. Wrapped it
in the same `overflowX:'auto'` + `width:'max-content'`/`minWidth:'100%'` pattern already used
elsewhere in this file, verified against `src/__tests__/scroll-table-width.test.js`'s ratchet
(which specifically catches the `width:'100%'`-with-no-`minWidth` variant that looks like it
scrolls but doesn't).

### Item 1 — count-day population: measured, then fixed

Measured LIVE **before** touching any code (service-role key, `qsr_onhand`, period `2026-08`,
single-period-scoped to match the real app's `loadQsrOnHand({period})` call, all 27 stores — see
"data caveat" below for why single-period-scoping mattered): the old `weeklyDone`-only basis
populated `detectedWeekdayName` for **2/27 stores (7.4%)**. Broadened `dayFreq`'s input from
`weeklyDays` (`weeklyDone`-only) to `dayDetectionSessions` (any `touchedWeekly` session — a real
Food/Condiment attempt, no 98% requirement) and re-measured: **27/27 (100%)**, every one of the 25
newly-populated stores hand-checked against real session dates for an obvious weekday pattern (e.g.
store 6972: Thu 07/30, 08/06, 08/13, 08/20 — a clean weekly Thursday cadence no session there ever
crossed 98% to surface). Status grading (`weeklyDone`/`lastWeekly`/`daysSinceWeekly`/Overdue,
`nWeekly` for the "This window" column) is byte-for-byte unchanged — verified by keeping `weeklyDays`
as a separate variable from the new `dayDetectionSessions`, not repurposing it.

**Data caveat that nearly produced a false measurement:** the first pass combined `qsr_onhand`'s
two live periods (2026-07 + 2026-08, 14,547 rows total) into one `rows` array, which **doubled**
`classTotals` (the table's PK is `loc+period+wrin`, so the same item gets a fresh row per period) —
every session then read ~45–52% coverage and the whole exercise would have measured a phantom "0%
compliance district-wide" that had nothing to do with count-day detection. Caught by checking how
the real app actually calls `loadQsrOnHand` (single-period) before trusting the first measurement;
re-scoped to one period and re-measured. Recorded here because it's exactly the kind of
data-scoping trap this dispatch's own "measure it, don't reason about it" bar exists to catch, and
because it fed directly into the finding below.

**A second, larger finding surfaced by the same corrected measurement, reported but NOT acted on
(out of scope for this dispatch):** even single-period-scoped, **0/27 stores** currently have a
session crossing the 98% Food+Condiment bar at all in the live 2026-08 data — every real weekly
session tops out around 45–52% coverage of each class's active-item universe. That means "Last full
count" (`lastWeekly`) currently reads blank for literally every store in production, independent of
anything in this dispatch. This is dispatch #97's own grading (explicitly out of scope to change
here per this dispatch's "Do NOT"), so it is not touched, but it's worth a look separately — a
98% bar that 0/27 real stores clear may be measuring something other than what it was calibrated
against (dispatch #97 measured coverage on a 2026-08 snapshot too; whether the active-item universe
has grown since, or whether classTotals is picking up extra rows, is unconfirmed and untouched here).

### Item 2 — "Last Count": literal reading picked, with live evidence

New `lastCount` field = `max(date)` across every graded session for that store, no size/quality
filter — the most literal reading of "even if incomplete." Measured live against the two existing
candidates: `lastAttempt` (size-priority pick, used today for the "still uncounted since" text) and
`cycleCompliance`'s `lastAny` (chronologically last non-spot session) — **19/27 real stores
disagreed among the three.** Concrete example: store 6972, `lastAttempt` = `lastAny` = 08-20, but
the store genuinely touched inventory again on 08-25 — neither existing field surfaces that. Chose
the literal max-date reading because the owner's own phrasing ("even if incomplete") describes
exactly that case, and because the use case (a manager glancing at the table to know "when did this
store last touch inventory at all") is answered by recency, not by attempt size or session-quality
filtering. `lastAttempt`/`lastAny` are unchanged and still used for their own existing purposes
(the missing-item "since X" text now uses `lastCount` instead — see item 4 below for why).

### Item 3 — Food/Condiment reused an existing helper the dispatch didn't name; Paper needed a real deviation from the dispatch's own suggested implementation

**Food/Condiment:** rather than re-deriving `total - counted` a third time, `uncountedFood`/
`uncountedCondiment` call dispatch #98's own `cycleClassCoverage()` (already in this file, already
tested) directly on the record just built. One real bug caught before shipping: `cycleClassCoverage`
reads "class absent from the `missing` array" as "that class was fully covered" — true only when the
array came from an actual Food/Condiment diagnosis. Once `missing` became the item-4 COMBINED array
(Food/Condiment + Paper), a Paper-only entry would make it look like Food/Condiment were fully
counted even when neither had ever been touched. Fixed by passing the food/condiment-only local
`missing` into `cycleClassCoverage`, not the combined field — regression-guarded by a dedicated test
(a store with zero Food/Condiment activity and only a Paper gap must still show its true Food/
Condiment uncounted counts, not 0).

**Paper — implemented as suggested, measured, found genuinely wrong, fixed differently:** the
dispatch's own writeup suggested sourcing Paper's uncounted count from `cycleCompliance()`'s
`perClassCounted()` (`active - counted`). Implemented it exactly that way first, then — per this
session's "a reviewer's/dispatch's root cause is a hypothesis, reproduce it before trusting it"
standing rule — measured it against all 7 real `paperMissing=true` stores in the live 2026-08 data
before shipping, and found it produces genuinely wrong numbers in two reproducible ways:

1. **Cross-period leakage.** `perClassCounted()`'s "most recent session touching Paper" has no
   month boundary — it walks every session ever seen in the input rows. Live example: store 43701's
   last Paper touch was **07-31** (a July session); it has touched zero Paper items in August. The
   subtraction formula read this as "1 of 76 already counted" (borrowing July's tiny stray-touch
   count) instead of the true answer for the current period: 0 of 76.
2. **Multi-session undercounting.** Paper counting can legitimately span more than one date within
   a period — a single-session pick (whether by recency, as `perClassCounted` does, or by size)
   only ever sees ONE of those dates. Live example: store 38609 counted 16 Paper items on 08-13 and
   13 more (disjoint items) on 08-20; `perClassCounted` (recency-picked) only reflects the 08-20
   session, understating real progress (29/74 counted) as 13/74.
3. **A third issue found investigating the above:** `diagnoseIncompleteCount()` (the engine already
   reused for Food/Condiment's item list) has no `active`/`recipeItem` filtering of its own — run
   unfiltered on a store's Paper rows, its `byClass` count came out ABOVE that store's own
   active-Paper universe on several live stores (e.g. store 34222: active=71, unfiltered diag
   count=93-96) — the classic Topic-3/Topic-6 legacy-item universe mismatch dispatch16 (#374) had
   already solved for `count-cycle.js`'s own `isActive()`, just not exposed for reuse here.

**Fix:** `uncountedPaper` and the Paper missing-item list now come from `diagnoseIncompleteCount()`
(still the same already-reused engine, not a new one) windowed at the **current period's start**
(not any single session's date) and pre-filtered to rows where `cls==='Paper' && isActive(r)`.
`isActive` was exported from `count-cycle.js` (one line, `const` → `export const`, no behavior
change for any existing consumer) rather than re-derived a second time. Windowing at period-start
means every item's own current `last_counted` is evaluated independently against one fixed boundary
— naturally unions every session within the period (fixes #2) and never reaches into a prior one
(fixes #1) — and the active-only pre-filter fixes #3. Re-verified against the same 7 live stores:
every result correctly bounded by that store's own active-Paper universe (previously several
weren't), and the two live examples above (43701, 38609) now read 76/76 outstanding and 45/74
outstanding respectively — the correct cumulative answers.

`cycleCompliance()`'s `paperMissing` **gate** (is Paper due and unsatisfied at all right now) is
untouched — this deviation only changes which number answers "how many, and which ones" once the
gate says yes. The mid-month-Paper detection algorithm itself (`satisfiesMidPaper`/`paperExpected`/
`paperThisMonth`) is not reimplemented anywhere in this change.

Both live-measured bugs are reproduced as dedicated unit tests (`does not count a PRIOR-period Paper
touch...`, `unions Paper progress across multiple sessions...`) so a future revert of the fix would
fail them directly, not just an isolated engine-function assertion.

Hand-verified against raw `qsr_onhand` rows (independent of any of this session's code) for one real
store per class with a genuine gap: store 5183/Food (120 active, 83 counted on the picked session →
37 uncounted, confirmed against the raw per-date breakdown), store 33222/Condiment (37 active, 34
counted → 3 uncounted), store 43701/Paper (76 active, 0 counted in August → 76 uncounted, matching
the cross-period-leakage fix above).

### Item 4 — drilldown

Confirmed by rendering the actual `CadenceMonitor` with a real Paper-missing fixture and expanding
the row: the existing `c.missing.map(...)` render loop needed no changes at all — it already had no
class-specific logic, exactly as the dispatch predicted, and Paper's row (added by item 3, gated on
`paperMissing`) renders with the correct item list, not just a count. One deliberate wording change:
the "Still uncounted since X" header now reads off `lastCount` (item 2) instead of the Food/
Condiment-specific `lastAttempt`, since a store's ONLY gap this period can now be Paper, for which
`lastAttempt` is often stale or `null`.

### What's genuinely new vs. reused, for a quick audit

- **Reused unchanged:** `detectSessions()`, `cycleCompliance()`'s `paperMissing` gate,
  `sessionQualities()`/`satisfiesMidPaper` (indirectly, via `paperMissing`), dispatch #98's
  `cycleClassCoverage()`, `diagnoseIncompleteCount()` (already used for Food/Condiment, now also
  used for Paper).
- **New, small, additive:** `count-cycle.js`'s `isActive` export (one line). `cadenceFromOnHand`'s
  `lastCount`, `paperMissing`, `uncountedFood`, `uncountedCondiment`, `uncountedPaper` fields.
  `CadenceMonitor`'s two new columns + the `fcpChip`/`UncountedFCP` render helpers.
- **Deviated from the dispatch's own suggested implementation, with live measurement to back it:**
  Paper's uncounted-count/item-list source (`diagnoseIncompleteCount` + period-start window +
  `isActive` filter, instead of `perClassCounted`'s `active - counted`), for the three reasons above.
