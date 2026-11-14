---
name: finding-records-top3-near-miss-2026-11-14
description: "Records panel (record-day.js) top-3-per-category + near-miss detection -- closes Notes 61 item #13. What was already there, what's new, and the judgment calls."
metadata:
  type: finding
scope: tenant
sensitivity: open
---

# Records: top-3 + near-miss (2026-11-14, task #159)

## Owner's ask (Notes 61 item #13, verbatim)

> "Records should be all-time, not limited to the date selection. Wants top 3 per category +
> most recent record broken + near misses."

**Important correction to an earlier pass's assumption in this same session:** this is NOT about
the simple manual-Excel "Store All-Time Records" card in `store-dash.js`. The real target is
`src/views/record-day.js`'s `computeRecords()` + `RecordDayTab` -- a sophisticated, already-live,
already-all-time engine (full history scan via `metricSeries`, range `2000-01-01` to the
freshest data). "Most recent record broken" was **already built** (`recentBreakers`, dispatch
#103/#136) before this dispatch touched anything. The two genuinely new pieces this dispatch adds
are top-3 and near-miss.

## What was built

**Top-3.** Every day-level category `computeRecords()` already tracked a single best for --
`sales.day`, `gc.day`, `avgChk.day`, `bf.day`, `speed.oepe/kvs/r2p` -- now also carries a `.top3`
array (`[{val,dk}, ...]`, best-first, respecting the lower-is-better direction for OEPE/KVS/R2P).
Computed as a fresh sort over the same confirmed (non-provisional) `days` array the chronological
running-max scan already builds -- not a new data pull, not part of that scan's loop (which only
ever needs the current best to detect a break the instant it happens).

**Deliberately scoped to DAY-level categories only** -- week/month/day-of-week-variant records
stay single-best, unchanged. Judgment call, not an oversight: those grains are checked far less
often day-to-day than the day-level numbers a GM actually watches, and extending every grain to
top-3 would add real surface area (persistence, UI, tests) for a much smaller slice of real use.

**Near misses.** For the same 7 day-level categories: the MOST RECENT confirmed day whose value
came within `NEAR_MISS_BAND` (5%) of the category's #1 all-time record without beating (or
tying) it. Surfaced as a new `nearMisses` list (newest-first, one entry per store+category),
rendered as a "📍 Near Misses" section on the Recent Breaks tab, reusing that tab's existing
table/badge conventions with a distinct blue "📍 So Close" badge (not the green "✓ Confirmed" or
orange "⏳ Provisional" used for a real break -- a near miss is real and final, it just didn't
happen).

**5% threshold -- the one genuine open judgment call, flagged exactly as the owner invited
("give some ideas here, open to suggestion").** No existing precedent in this codebase answers
*this* proximity question directly: the swing alarm's -10% and the count-completeness 75%
threshold are both measured from real distributions for their own, different questions, not
transferable here. 5% is a deliberate, named (`NEAR_MISS_BAND`), easily-tuned constant -- a
one-line change if it reads too loose or too tight once the owner sees it against real data.

**"Near miss" picks the most recent qualifying day, not the closest value.** Verified with a
fixture where the 2nd-closest day (3% away, more recent) beats the single closest day (4% away,
older) for the slot -- this is a deliberate "recently, we almost got it" framing, not "the
2nd-best day ever (which could be from years ago) is close."

**Persistence.** `mergeTop3(saved, next, isLow)` (new) merges two top-3 lists into the true
best-3-overall, de-duped by date -- same defensive purpose `mergeVal` already serves for the
single-best value: a later run with less historical data loaded must never regress what a fuller
prior run already established. Wired into `mergeStores` via a new `mergeDayCat` helper for all 7
day-level categories. `nearMisses` is **not** persisted (same treatment `recentBreakers` already
gets) -- it's recomputed fresh every run from whatever confirmed-day data is currently loaded,
not merged across sessions.

**Provisional-day safety (dispatch #103's own fix) is fully respected.** Both top-3 and near-miss
are computed only from `confirmedDays = arr.filter(d => d.dk < todayKey)` -- the exact same gate
the existing single-best tracking already enforces. A still-open business day can never occupy a
top-3 slot, can never be the record a near-miss is measured against, and can never itself be
reported as a near miss. Verified directly: a fixture where today's still-open reading would beat
the all-time record on both a sales metric and a speed metric, and neither ever appears in that
category's top-3 or near-miss output.

## What was NOT touched / deliberately deferred

- **Export (CSV/Excel) and the print report** (`tabExportSpec`/`buildFullReportHtml`) were not
  extended to include top-3 or near-miss columns -- they still export/print exactly what they
  did before this dispatch. A real, scoped follow-on if the owner wants these in an exported
  report, not done here to keep this dispatch's blast radius to the engine + the two places
  (Overview cards, Recent Breaks tab) the owner specifically asked to see them on screen.
- Week/month/DOW-variant top-3 (see scoping decision above).
- A merge-regression test that proves a SECOND run with STRICTLY LESS historical data than a
  first run still keeps the fuller top-3 (the real scenario `mergeTop3` exists to guard against).
  The test suite does exercise the merge code path (two successive `computeRecords()` calls, same
  data) and confirms it doesn't corrupt or drop the top-3, but doesn't construct the asymmetric
  "less data the second time" fixture that would most directly prove the regression-prevention
  claim. Worth a second look if this matters in practice (e.g. a user whose browser cache clears
  between sessions and reloads a narrower default window).

## Verification

14 new tests (`src/__tests__/notes61-records-top3-near-miss-2026-11-14.test.js`): top-3 ordering
(including OEPE's lower-is-better direction), provisional-day exclusion from both top-3 and
near-miss, near-miss "most recent within band, not closest value" semantics, boundary behavior
(days well outside the band never win the slot), tie-exclusion, the merge path, `recentBreakers`
unaffected, and two tests rendering the real `RecordDayTab` component (not just the pure
`computeRecords` function) per this repo's "would this verification still pass if reverted"
standing rule.

All pre-existing record-day/store-records tests (`dispatch-103-record-day-provisional`,
`dispatch-200-store-records-merge`, `dispatch-130-record-day-export`,
`dispatch-records-2022-history`) still pass unchanged.
