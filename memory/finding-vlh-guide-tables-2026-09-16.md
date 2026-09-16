---
name: finding-vlh-guide-tables-2026-09-16
description: "Task #56 — the real 2022 VLH Workbook tables are now parsed, queryable, and measured against live DAR data"
metadata:
  node_type: memory
  type: finding
---

## Task #56 ("VLH needed-hours calc") — unblocked by the owner-provided workbook PDFs, 2026-09-16

Blocked all week on the actual VLH guide tables — `store_vlh_config` was built as the
foundation months ago, but the calculation itself needed the real guest-count -> labor-hours
breakpoints, which only exist in McDonald's own workbook PDFs. The owner supplied both:
`docs/2022_VLH_Workbook_High_Productivity_Guides.pdf` and
`docs/2022_VLH_Workbook_Standard_Guides.pdf` (49 pages each, one per restaurant
configuration).

### What was built

1. **Parser** (`scripts/parse-vlh-workbook.py`, one-off/offline, not part of CI — this repo
   is otherwise Node-only). Word-coordinate based (pdfplumber), because the PDF's own text
   extraction interleaves multiple stacked tables that share the same 5 daypart column
   positions with no repeated header row — see that script's own header comment for the
   full layout reverse-engineering (5 x0 column bands, tier-reset segmentation to split
   Drive Thru from In-Store from the tables after it).
2. **Scope: Drive Thru + In-Store only.** The workbook has ~10 labor-position tables per
   config page (Order Takers, Assemblers, Curbside, Table Service, BDAP, McCafe, Hash
   Browns & Fries, Sandwiches/Delivery-Kitchen, plus these two). Only Drive Thru and
   In-Store have an unambiguous DAR guest-count mapping — their own section labels are a
   literal 1:1 name match to `qsr_daily_activity.dt_transactions` ("DT GC") and
   `.is_transactions` ("In-Store GC"). The other positions' guest-count DRIVER (what
   actually determines which breakpoint tier applies) is not stated anywhere in the PDF's
   own text, and DAR doesn't carry the per-item actuals (sandwich counts, BDAP/McCafe
   orders, fry/hashbrown counts) that would be needed to test a guess — those DAR fields
   are `mean_*`/`proj_*` only, not real per-hour actuals. Per the "measure it, don't reason
   about it" standing rule, guessing a driver here would risk shipping wrong labor guidance
   on a live business tool, so those 8 positions were deliberately left unparsed. The source
   PDFs stay in `docs/` if a future dispatch gets a confirmed driver mapping (from the owner
   or QSRSoft's own documentation) and wants to extend this.
3. **Validation, not just a hopeful parse.** Across all 96 config pages (48 per book: 32
   non-AOT x 4 DT types x 2 In-Store types x 4 kitchen types, minus overlap, plus 16 AOT
   variants x 2 DT types): zero structural issues — every daypart's tier table covers
   0-9999 contiguously with sequential tiers and no gaps, every config's AOT/dt_type/
   in_store/kitchen enum mapped cleanly (no unmapped values), all 96 (guide, aot, dt_type,
   in_store, kitchen) combos are unique. Spot-checked two pages' exact numbers against the
   raw PDF text by eye (a non-AOT Standard page and an AOT Standard page) — exact match.
   Re-ran the committed parser against the committed PDFs and confirmed byte-identical
   output to the committed seed JSON (`scripts/data/vlh-guide-2022-seed.json`, 4,592 rows).
4. **Schema + seed** (`supabase/schema-vlh-guide.sql`, `scripts/seed-vlh-guide.mjs`,
   matching `scripts/seed-event-impact.mjs`'s existing seed-script convention). Reference
   data, not tenant-scoped — same "public read" shape as `qsrsoft_kb`, not per-store
   business data like `store_vlh_config`. **⚠️ Not yet live** — creating the table needs
   DDL access this session doesn't have (no Postgres connection string, only the REST API);
   the owner needs to run the schema file, then either the owner or a future session with
   `SUPABASE_SERVICE_ROLE_KEY` runs `node scripts/seed-vlh-guide.mjs`.
5. **Engine** (`src/engine/vlh-guide.js`): `buildVlhGuideIndex`, `lookupTierHours`,
   `guideNeededHoursForRow`, `guideVsReportedByStoreDaypart`. Pure functions, same style as
   `labor-standard.js` (which it reuses `daypartOf` from, not a re-derived copy — note the
   guide table's own `daypart` column is lowercase snake_case (`'late_night'`) while
   `daypartOf()` returns labor-standard.js's capitalized labels (`'Late Night'`); the engine
   normalizes so callers can pass either). 14 tests
   (`src/__tests__/vlh-guide.test.js`), including the no_dt-config edge case (Drive Thru
   genuinely contributes 0 hours, not null) and the "never guess" contract (missing config,
   negative/null guest count, unresolvable lookup all return `null`, never a fabricated
   number).

### ✅ Live-measured (not assumed) — what `total_needed_hours` actually is

`SUPABASE_SERVICE_ROLE_KEY` was live in this session (re-measure per CLAUDE.md's own
per-session rule — do not assume this carries to a future session without re-checking).
Confirmed `store_vlh_config` already has all **27/27 stores** configured (not a blocker).
Ran the REAL engine (not a parallel reimplementation) against real DAR data: 14-day window,
9,720 `qsr_daily_activity` rows, all 27 stores, via `guideVsReportedByStoreDaypart`.

**Result: the guide-derived Drive Thru + In-Store hours cover 38.6% of `total_needed_hours`**
(26,498 guide hours vs 68,669 reported hours summed across 27 stores x 5 dayparts = 135
store-daypart buckets; `reported/guide` ratio 2.59, stable in direction across every store
and daypart — nowhere did guide hours exceed reported hours).

**This is expected, not a bug or a parser error.** `total_needed_hours`'s own field
dictionary description (`src/constants.js`'s `QSR_DAR_FIELDS`) is *"Algorithmic 'needed'
hours for this slot's projected volume (Variable Needed + Fixed Sched + Floor Need)"* —
three components, and this measurement only covers a subset of ONE of them (Variable
Needed, and only 2 of its ~10 labor positions). It resolves
`memory/analysis-labor-allocation-2026-08-18.md`'s old caveat #2 ("assumed to be the VLH
guide... not confirmed against the workbook tables") into an actual measured relationship:
`total_needed_hours` is NOT a simple copy of the DT+In-Store guide sum, but the two move
together directionally, consistent with DT+In-Store being a real (if partial) component of
it.

**Do not re-read this as "the guide engine is wrong" or attempt to force the ratio to 1.0**
— extending coverage to the other 8 positions (if a driver mapping is ever confirmed) would
close some of the gap; the Fixed Sched + Floor Need components would still leave a residual
that isn't guide-driven at all by QSRSoft's own description.

### Where this leaves Task #56

Genuinely shippable now: a real, tested, live-validated Drive Thru + In-Store needed-hours
calculation exists and is measurably related to QSRSoft's own number, not just assumed to
be. Two things remain before it's usable in the app: (1) the owner runs
`supabase/schema-vlh-guide.sql` + `scripts/seed-vlh-guide.mjs` to make the table live, and
(2) no UI panel surfaces `guideVsReportedByStoreDaypart` yet — this dispatch shipped the
engine + data + live verification, not a new panel; wiring it into Labor Tools / Signals
(e.g. as a per-store per-daypart diagnostic alongside the existing allocation view) is a
natural, small follow-on once the table is live and worth a real number to look at, not
speculative sample data.
