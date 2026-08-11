# Waste-entry data-discipline score (#209)

**Shipped:** v4.988, 2026-08-11. First of Push 3 (#209 -> #210 -> #208), the trust leg the
coaching loop (#208) depends on: unrecorded waste doesn't vanish, it lands in Unexplained and
inflates it, so a store with missing entries has a FOB% that isn't comparable to any other
store's.

## What it does

`src/engine/waste-discipline.js` — a new engine module, deliberately NOT a metric-source.js
chain (see "Why not metric-source.js" below).

- `expectedDaysOfWeek(dateSet, asOf)` — derives which days-of-week a store actually submits a
  given waste type on, from the trailing `LOOKBACK_DAYS` (56, 8 weeks) of OBSERVED dates. A
  day-of-week counts as "expected" only with >=3 occurrences in the window AND a hit rate >=
  `COVER_FRAC` (0.75). Never assumes daily-for-everyone.
- `computeMissingWasteDays(rows, {asOf})` — per (loc, waste type), the missing dates over the
  trailing `RECENT_WINDOW_DAYS` (14) against that store's own derived pattern. Excludes
  full-closure holidays (`isHoliday()` from `utils/holidays.js`) — a closed day is not a miss.
  `pctOnTime` is `null` (not a false 100%) when there's no derivable pattern yet.
- `estimateMissingWasteImpact(rows, missingByLocType)` — $ per missing day estimated as the
  store's own average entry amount for that type on days it DOES submit. An ESTIMATE, not a
  decomposition of Unexplained — confirmed before writing this that no code in the repo traces
  Unexplained back to a specific missing entry.
- `computeStoreDataDiscipline(rows, {asOf})` — per-store rollup: both waste types, an overall
  pct that only averages types WITH a derivable pattern, total missing count, estimated $.
- `disciplineSummary(discipline)` — district rollup, mirrors `count-cycle.js`'s `cycleSummary`
  shape.

## Two things this file exists to get right (per the issue)

1. **"Expected" is derived, never assumed.** Mirrors `engine/count-cycle.js`
   (`detectSessions`/`cycleCompliance`) — derive from what actually happened. Explicitly the
   WRONG precedent here: `engine/eom-inventory.js`'s fixed 3-day EOM window assumes a schedule
   rather than deriving one, and is EOM-only besides.
2. **Missing != zero.** `qsr_waste` rows are discrete per-entry events with NO null-vs-zero
   sentinel column (confirmed via `loadQsrWaste`, `src/lib/supabase.js:2992-3022` —
   `{loc, period, eventId, dt, tm, type:'raw'|'completed', amount, manager, source, edited,
   reason, updatedAt}`) — the only "missing" signal is the absence of any row for a
   (loc, date, type). A real $0 entry and a genuinely absent row are different facts throughout
   this file; a caller must never collapse "0 missing days" and "0 entries found" into the same
   rendered state — the exact v4.870 false-all-clear failure class the FOB Report fix (v4.976)
   addressed for a different stream.

## COVER_FRAC is reused, not re-measured

`waste-discipline.js` imports nothing from `count-cycle.js` directly (its own `COVER_FRAC`
constant is a literal `0.75`) but the value is the SAME number, deliberately, with a comment
explaining why: `count-cycle.js`'s 0.75 was measured from 158 real count-sessions
(`memory/feedback-measure-dont-reason.md`). Reusing an already-measured repo-wide threshold as
the "is this a real recurring pattern" bar is different from inventing a new unmeasured one for
a different data stream — there is no live Supabase session in this sandbox to independently
measure waste-submission cadence, so this was the honest choice rather than guessing a number
that felt right.

## Why not metric-source.js

`metric-source.js`'s `METRIC_SOURCES`/`metricDaily`/`metricSeries` model resolves ONE scalar
value per day with an auto-first fallback chain. Data-discipline is a day-PRESENCE pattern
question ("did an entry exist on this date") over a set of raw rows, not a scalar with
fallbacks — it doesn't fit that resolver shape, so this ships as its own engine module instead
(same reasoning `count-cycle.js` itself already established for count-session detection).

## Lazy-fill wiring

`wasteRows` joins `auditRows` in `LAZY_FILL_SOURCES` (`metric-source.js`) — never loaded eagerly
at startup, only on demand via `ensureLazyFill('wasteRows')`. Wired in `App.js`'s
`configureLazyFill` loaders map (`loadQsrWaste`) and `pipeline.js`'s `buildDS` initial shape
(`wasteRows:[]`).

Reached via explicit `ensureLazyFill()` calls from a "load on open" UI consumer, NOT through a
`metricDaily`/`metricSeries` chain reference — matches the precedent `RegisterAuditTab`/
`DataManagerPanel` already established for `auditRows` in #191.

**New in this issue:** `isLazyFillError(src)` (`metric-source.js`) — `isLazyFillPending` alone
can't distinguish "loaded, zero rows" from "the fetch failed" (both read `pending === false`).
`auditRows`' only lazy-fill consumer (`RegisterAuditTab`) never needed this distinction because
it only ever reports row COUNTS. This is the first `LAZY_FILL_SOURCES` consumer that renders a
claim ("this store is missing entries" / implicitly "this store is fine") based on the loaded
rows, so silently treating a failed fetch as "zero missing" would be exactly the false-all-clear
bug the FOB Report fix (v4.976) already cost several note-cycles once. `isLazyFillError` is a
one-line addition mirroring `isLazyFillPending`'s existing shape.

## UI

Surfaced in `FOBAnalysisPanel` (`src/views/analytics.js`) — chosen because the trust
conversation (is this store's FOB% real) and the coaching-dollar conversation already happen in
this panel together. A new "📋 Waste-Entry Discipline" section, gated to `selLoc==='all'`
(district-wide signal, doesn't depend on the panel's month/location filters):

- **Pending:** small "Checking waste-entry discipline…" line.
- **Failed** (`isLazyFillError('wasteRows')`): a visible red badge, not a silent fallback to
  "nothing to show."
- **Nothing to flag:** the section renders nothing at all — deliberately NOT a green "all
  clear" badge, since an empty `discipline` array (no `qsr_waste` rows reachable, or no store
  has enough history yet) is indistinguishable from "every store is compliant" without
  independently checking row counts. Hiding rather than asserting keeps this honest without
  needing a third visible state for that specific case.
- **Has gaps:** per-store rows (worst-by-estimated-$-impact-first, top 8), each showing missing
  counts by type and the estimated $ impact, plus a district summary line (stores affected,
  total estimated $).

Read-only for now — no acknowledgment/dismissal machinery. That's explicitly left for #208's
coaching loop, not built here.

## Verification

11 new tests (`src/__tests__/waste-discipline.test.js`), fixture style mirrors
`count-cycle.test.js`: derived-pattern correctness (daily vs weekday-only vs below-COVER_FRAC),
insufficient-history -> null (not false 100%), holiday exclusion, the $0-entry-is-not-missing
distinction, the per-store rollup only averaging types with a derivable pattern, and the
district summary rollup. 1 existing test updated
(`metric-source-lazy-fill.test.js`'s #191 scoping assertion — was hardcoded to `['auditRows']`,
now covers both `LAZY_FILL_SOURCES` entries since the extension is intentional, not a
regression).

Full suite (1276 tests) + build both pass clean. Entry chunk gzip 809.45 KB -> 811.04 KB
(+1.59 KB — `analytics.js` is a static import so the new section's markup and the engine module
both land in the entry chunk; still 38.96 KB under the 850 KB budget).

**Not independently measured against live data** — no authenticated Supabase session in this
sandbox (confirmed via curl: anon key returns `[]` for `labor_rows`/`qsr_fob`, same class of
constraint applies to `qsr_waste`). The derived-pattern logic is unit-tested against synthetic
fixtures built to the real row shape, not verified against real store submission cadence.
