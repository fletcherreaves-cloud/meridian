# Dispatch #146 — Pre-populate Retention Rollup workshop-week marks from the Organization
# Structure sheet's "1st Schedule Week" column

**Status: READY TO DISPATCH — both prior open items are now resolved.** Written in response to
the owner's ask (2026-08-26), after seeing the Retention Rollup's empty state: *"also for the
retention rollup, it doesn't appear to populate"* → PM explained no store has a workshop week
marked yet (expected, not a bug) → owner: *"Mark the scheduled weeks for training I can do that
when I'm at the computer, but we also updated the organization structure sheet which already has
those weeks on it. Could we not just pre-populate them from that sheet?"*

**⚠️ REVISED (2026-08-26, same day) — source column changed from "Schedule Workshop" to "1st
Schedule Week", and both prior blockers resolved.** The original version of this dispatch pointed
at the `Locations` sheet's "Schedule Workshop" column (the training date). The owner then
confirmed a session artifact from 2026-08-25 (an updated copy of the workbook, now committed to
`data/org-structure/Organization_Structure.xlsx` — see that file's README for full detail) as
current. That copy carries a better, more direct column for this exact purpose, plus resolves the
open question about future-dated rows. Use the details below, not the superseded ones.

## Real finding, verified live before writing this

`data/org-structure/Organization_Structure.xlsx`'s **`Scheduling Setup` sheet, column L — "1st
Schedule Week"** — is the date each store's **first live LifeLenz schedule week under the new
scheduling process actually landed** (a real outcome date, not a plan), populated for all 20
Oklahoma stores:

```
20475, 34222        → 2026-08-12       32525               → 2026-09-02
10422, 43380         → 2026-08-12       11657, 6972, 31357,
33704, 35064          → 2026-08-19       29760               → 2026-09-02
18213                → 2026-08-19       33222, 13113, 3708,
5183, 5985, 10915,                       24471               → 2026-09-09
  33109                → 2026-08-26
```
(decoded from Excel serials, read live from the confirmed-current file — 2026-08-26)

**This resolves the "planned vs. confirmed" question the original dispatch raised, empirically —
no further owner input needed.** Every store whose "1st Schedule Week" date is ≤ today
(2026-08-26) has real, filled-in `GM Engagement`/`Sched Mgr Engagement`/`Execution Confidence`/
`Notes` values on the same row (genuine retrospective comments, e.g. *"Derek not fully engaged.
Appeared asleep a couple times"*, *"Both highly engaged"*). Every store whose date is still in
the future has all four of those fields completely blank. That correlation is airtight across all
20 OK stores as measured. **`1st Schedule Week ≤ today` is therefore a reliable, confirmed
"has this actually happened" signal — build the date gate as before, but treat it as a validated
rule, not a hedge.**

This is exactly the concept `ScheduleRetentionSection`'s "workshop week" mark represents — and a
more direct one than "Schedule Workshop" (the training date) was: it's the schedule outcome
itself, not the training session that preceded it. The `sched_retention_marks` table's mark is a
**weekKey** (a LifeLenz business week, Wed-anchored, `YYYY-MM-DD` string — `weekStartOf()` in
`src/engine/schedule-summary.js:16`), not a calendar date; the conversion is trivial:
`weekStartOf(scheduleWeekDate).toISOString().slice(0,10)`. No lookup against synced LifeLenz weeks
is needed at import time — `storeRetentionSplit()` already handles a weekKey that doesn't match
any synced week gracefully (`reason:'mark-not-found'`, excluded with a stated reason, never a
crash — `schedule-retention.js:587-595`).

**⚠️ Read the raw column, not the `Locations` sheet's mirrored copy.** An earlier session added a
new "1st Schedule Week" column to the `Locations` sheet (after "Skill Levels Updated") with a
real cross-sheet formula, `=IFERROR(INDEX('Scheduling Setup'!$L:$L,MATCH($A3,'Scheduling
Setup'!$A:$A,0)),"")` — but its cached value is empty in the committed file (written by a library
that doesn't recompute Excel's calc chain), so a naive `sheet_to_json` read of `Locations` will
see `null` there. The SOURCE data — `Scheduling Setup`'s own "1st Schedule Week" column — is a
plain value, unaffected, and is what the parser below should read.

**No existing parser or upload path ingests this workbook at all** — checked `src/parsers/
index.js`'s full `parse*` function list and its `detectType()` filename-routing table; neither
recognizes `Organization_Structure.xlsx` or any of its sheets today. `memory/project-org-
structure.md`'s "a full org file upload can also populate [supervisorGroups]" refers to a
different, simpler upload, not this file. **This is new work, not a missed wiring.**

## Scope — build

1. Add a `parseOrgStructure(wb)` function to `src/parsers/index.js` — reads the `Scheduling
   Setup` sheet (header on row 2, per the confirmed structure above), extracts `{loc,
   scheduleWeekDate}` for every row with a non-null "1st Schedule Week" value and a numeric
   `Location` (the sheet has a handful of stray/orphan rows past the real 20 stores with no
   `LocationName` and no other data — skip any row that doesn't resolve to a real store). `loc` is
   the numeric `Location` column (col 0); `scheduleWeekDate` decoded from the Excel serial the
   same way this file's other date columns already are (see `parseXLDate` at the top of this file
   — reuse it, don't reimplement).
2. Add filename/sheet-name detection to `detectType()` (same file) — filename match on
   `organization_structure` / `org structure` / `org_structure` (case-insensitive, matching this
   function's existing pattern for every other file type), OR a sheet-name fallback checking for
   a sheet literally named `Scheduling Setup` with a `1st Schedule Week` header cell, mirroring
   the FullScale sheet-name-fallback pattern a few lines above it in the same function (dispatch
   #143's context: don't invent a new detection idiom, follow the one already there).
3. Wire the upload handler (Data Manager) so choosing this file type calls, for every row with
   `scheduleWeekDate <= today`: `saveRetentionMark(loc, weekStartOf(scheduleWeekDate)
   .toISOString().slice(0,10))`. Skip (don't call, don't error) any row with `scheduleWeekDate >
   today` or no date at all. Surface a clear post-upload summary to the user: how many stores were
   marked, how many skipped as future-dated, how many had no schedule-week date in the sheet at
   all — this is an unusual upload (it silently changes Retention Rollup's marks, a state that
   used to be manual click-driven), so the confirmation needs to be legible, not just a generic
   "N rows imported."
4. **Do not overwrite an existing mark silently if it differs from the sheet's date** — if a store
   already has a manually-set mark (from the Training Retention tab) that differs from what the
   sheet would import, treat the sheet as the source of truth only if the owner confirms that's
   the intent (a manual mark could reflect real on-the-ground correction the sheet doesn't know
   about). Default to skip-if-already-marked unless told otherwise, and say clearly in the PR
   which rule you implemented.

## Do NOT

- Do not read the `Locations` sheet's mirrored "1st Schedule Week" column for data — its cached
  value is empty in the committed file (see above); read `Scheduling Setup`'s own column instead.
- Do not import a mark for a future-dated "1st Schedule Week" value — the date gate is confirmed
  correct (see the engagement-field correlation above), not optional.
- Do not touch any of the review-engine/EAP/EAD work in dispatch #145 — unrelated panel, unrelated
  data source.

## Verification bar

- Confirm a fresh upload of `data/org-structure/Organization_Structure.xlsx` marks every OK store
  with a past-dated "1st Schedule Week" value, skips every future-dated one, and the post-upload
  summary states counts correctly (expect ~15 marked, ~5 skipped as future, measured 2026-08-26 —
  re-verify at build time since today's date will have moved).
- Confirm the Retention Rollup tab (`ScheduleRetentionRollupSection`) now shows real rows for the
  newly-marked stores without any other code change — this dispatch should need zero changes to
  `schedule-retention.js`'s rollup/aggregation logic, only a new import path feeding the same
  `sched_retention_marks` table the manual UI already writes to.
- Confirm a store manually marked from the Training Retention tab is not silently clobbered by a
  differing sheet date (per the skip-if-already-marked default above, unless the owner said
  otherwise).
- Full `npx vitest run --exclude "**/.claude/**"` suite passing at the same or higher count as
  `main`; `npm run build` clean.
