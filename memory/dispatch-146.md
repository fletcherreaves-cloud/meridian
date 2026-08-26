# Dispatch #146 — Pre-populate Retention Rollup workshop-week marks from the Organization
# Structure sheet's "Schedule Workshop" column

**Status: DRAFTED, NOT YET DISPATCHED — two open items below need the owner before this goes to
an engineer.** Written in response to the owner's ask (2026-08-26), after seeing the Retention
Rollup's empty state: *"also for the retention rollup, it doesn't appear to populate"* → PM
explained no store has a workshop week marked yet (expected, not a bug) → owner: *"Mark the
scheduled weeks for training I can do that when I'm at the computer, but we also updated the
organization structure sheet which already has those weeks on it. Could we not just pre-populate
them from that sheet?"*

## Real finding, verified live before writing this

`data/org-structure/Organization_Structure.xlsx` (the "sacred baseline file", `data/org-
structure/README.md`) — the repo's committed copy (last touched 2026-08-23, so it predates
whatever update the owner just made) — genuinely has this data. Its `Locations` sheet (header
row 2) has a real **"Schedule Workshop"** column (col index 32) with a real date value for every
one of the 20 Oklahoma stores (FL stores are blank — no workshop scheduled yet there):

```
3708  → 2026-09-03      11657 → 2026-08-26      29760 → 2026-09-02
5183  → 2026-08-13      13113 → 2026-08-26      31357 → 2026-08-27
5985  → 2026-08-17      18213 → 2026-08-13      32525 → 2026-08-17
6972  → 2026-08-27      20475 → 2026-08-05      33109 → 2026-08-18
10422 → 2026-08-06      24471 → 2026-09-03      33222 → 2026-09-02
10915 → 2026-08-18      ...                     33704 → 2026-08-12
                                                 34222 → 2026-08-05
                                                 35064 → 2026-08-12
                                                 43380 → 2026-08-06
```
(dates decoded from Excel serials, confirmed via a live read of the committed file — 2026-08-26)

This is exactly the concept `ScheduleRetentionSection`'s "workshop week" mark represents. The
`sched_retention_marks` table's mark is a **weekKey** (a LifeLenz business week, Wed-anchored,
`YYYY-MM-DD` string — `weekStartOf()` in `src/engine/schedule-summary.js:16`), not a calendar
date, but the conversion is trivial: `weekStartOf(workshopDate).toISOString().slice(0,10)`. No
lookup against synced LifeLenz weeks is needed at import time — `storeRetentionSplit()` already
handles a weekKey that doesn't match any synced week gracefully (`reason:'mark-not-found'`,
excluded with a stated reason, never a crash — `schedule-retention.js:587-595`).

**No existing parser or upload path ingests this workbook at all** — checked `src/parsers/
index.js`'s full `parse*` function list and its `detectType()` filename-routing table; neither
recognizes `Organization_Structure.xlsx` or any of its sheets today. `memory/project-org-
structure.md`'s "a full org file upload can also populate [supervisorGroups]" refers to a
different, simpler upload, not this file. **This is new work, not a missed wiring.**

## Two open items — resolve before dispatching to an engineer

1. **I only have the 2026-08-23 committed copy. The owner said he updated the sheet since —
   I need the current file (or explicit confirmation to proceed against the committed one) before
   any real import runs.** Whatever ships here is a re-runnable upload feature, not a one-time
   data fix, so this mostly affects when the owner first exercises it — but don't claim "done" off
   stale data.
2. **Does "Schedule Workshop" mean CONFIRMED-occurred, or just PLANNED/scheduled?** The sheet has
   no paired "occurred" flag for this column (contrast: "Mobile Inventory App Training Occurred"
   IS a separate Yes/No column next to "Mobile App Training Scheduled" — a real precedent for the
   sheet distinguishing the two concepts when it wants to). Some Schedule Workshop dates in the
   committed copy are already in the past relative to today (2026-08-26) — e.g. 5183: 08-13,
   20475/34222: 08-05, 10422/43380: 08-06 — but others are still in the future — e.g. 3708/24471:
   09-03, 29760/33222: 09-02. Marking a Retention Rollup split at a date that hasn't happened yet
   would produce a false/premature before-vs-since comparison (comparing two halves of a period
   where nothing actually changed). **Proposed default, safe under either interpretation: only
   import a mark for a store whose Schedule Workshop date is ≤ today at import time; skip (don't
   mark, don't error) any store whose date is still in the future.** State this plainly to the
   owner rather than assuming — if "Schedule Workshop" is only ever filled in once it's confirmed
   done (never pre-filled with a future date), the gate is unnecessary but harmless; if it's a
   forward-looking schedule, the gate is required correctness.

## Scope — build (once the above is resolved)

1. Add a `parseOrgStructure(wb)` function to `src/parsers/index.js` — reads the `Locations`
   sheet (header on row 2, per the confirmed structure above), extracts `{loc, workshopDate}` for
   every row with a non-null "Schedule Workshop" value. `loc` is the numeric `Location` column
   (col 0); `workshopDate` decoded from the Excel serial the same way this file's other date
   columns already are (see `parseXLDate` at the top of this file — reuse it, don't reimplement).
2. Add filename/sheet-name detection to `detectType()` (same file) — filename match on
   `organization_structure` / `org structure` / `org_structure` (case-insensitive, matching this
   function's existing pattern for every other file type), OR a sheet-name fallback checking for
   a sheet literally named `Locations` with a `Schedule Workshop` header cell, mirroring the
   FullScale sheet-name-fallback pattern a few lines above it in the same function (dispatch #143's
   context: don't invent a new detection idiom, follow the one already there).
3. Wire the upload handler (Data Manager) so choosing this file type calls, for every row with
   `workshopDate <= today`: `saveRetentionMark(loc, weekStartOf(workshopDate).toISOString()
   .slice(0,10))`. Skip (don't call, don't error) any row with `workshopDate > today` or no date
   at all. Surface a clear post-upload summary to the user: how many stores were marked, how many
   skipped as future-dated, how many had no workshop date in the sheet at all — this is an
   unusual upload (it silently changes Retention Rollup's marks, a state that used to be manual
   click-driven), so the confirmation needs to be legible, not just a generic "N rows imported."
4. **Do not overwrite an existing mark silently if it differs from the sheet's date** — if a store
   already has a manually-set mark (from the Training Retention tab) that differs from what the
   sheet would import, treat the sheet as the source of truth only if the owner confirms that's
   the intent (a manual mark could reflect real on-the-ground correction the sheet doesn't know
   about). Default to skip-if-already-marked unless told otherwise, and say clearly in the PR
   which rule you implemented.

## Do NOT

- Do not build or run this against the stale (2026-08-23) committed file as if it were current
  data — the owner said he updated it; get the current file first.
- Do not import a mark for a future-dated "Schedule Workshop" value without the owner confirming
  the date semantics (see open item 2) — a wrong-direction default here corrupts every group's
  Retention Rollup aggregate silently, not just one store's view.
- Do not touch any of the review-engine/EAP/EAD work in dispatch #145 — unrelated panel, unrelated
  data source.

## Verification bar (once built and dispatched)

- Confirm a fresh upload of the (current) Organization_Structure.xlsx marks every OK store with a
  past-dated Schedule Workshop value, skips every future-dated one, and the post-upload summary
  states counts correctly.
- Confirm the Retention Rollup tab (`ScheduleRetentionRollupSection`) now shows real rows for the
  newly-marked stores without any other code change — this dispatch should need zero changes to
  `schedule-retention.js`'s rollup/aggregation logic, only a new import path feeding the same
  `sched_retention_marks` table the manual UI already writes to.
- Confirm a store manually marked from the Training Retention tab is not silently clobbered by a
  differing sheet date (per the skip-if-already-marked default above, unless the owner said
  otherwise).
- Full `npx vitest run --exclude "**/.claude/**"` suite passing at the same or higher count as
  `main`; `npm run build` clean.
