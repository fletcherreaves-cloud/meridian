---
name: dispatch-98
description: Inventory Control's top summary tiles (Stores Reporting, Believe Done >=90%, Avg Count Complete, Count Window, By Class) render unconditionally off EOM-basis math regardless of which of the three tabs (Scoreboard/EOM Count/Count Cycle) is selected -- so viewing Count Cycle shows frozen, often-zero EOM numbers instead of anything about weekly-count completion. Owner wants the tiles to swap to cycle-relevant data based on the selected tab. Sequenced AFTER dispatch #97 (same file, same underlying data the tiles would need) -- do not run both at once.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #98 — make Inventory Control's summary tiles mode-aware, not fixed to EOM

**Read first:** `memory/dispatch-97.md` in full, including its Resolution section once that ships.
**This dispatch depends on #97 and must not start until #97 is merged** — they touch the same file
(`src/views/eom-dashboard.js`) and #97 is what makes weekly-cycle data available on the same basis
this dispatch needs to reuse.

**Status:** ready to hand off once #97 lands. Not an open investigation — the mechanism is already
located below.

---

## What the owner saw, and why

Screenshot: **Count Cycle** tab selected (highlighted), but the four top tiles read `STORES
REPORTING 27`, `BELIEVE DONE (≥90%) 0/27`, `AVG COUNT COMPLETE 0.00%`, `COUNT WINDOW not yet`, and
all four **BY CLASS** tiles (Food/Condiment/Paper/Non-Product) read `0.00%`. That's not a bug in the
data — it's genuinely true of EOM's numbers right now (the EOM count window hasn't opened this
period). The bug is that **you're looking at EOM's numbers while standing on the Count Cycle tab**,
which has its own real, non-zero data (the Weekly Count Cadence table renders correctly right below
these tiles, on the same screen, at the same time).

## Root cause, located

`src/views/eom-dashboard.js`, the summary-tiles block (~line 2263-2270) and the By-Class tiles block
(~line 2274-2283) both render **unconditionally** off `summary`/`classSummary`/`inWindow` — none of
these are gated on or recomputed from `mode` (`'scoreboard' | 'eom' | 'progress'`, where `'progress'`
is the internal key for the tab labeled "Count Cycle" — see the tab list at ~line 2189:
`[['scoreboard','Scoreboard'],['eom','EOM Count'],['progress','Count Cycle']]`). Only the **subtitle
text** (~line 2250-2253) and the **Weekly Count Cadence table itself** (`CadenceMonitor`, rendered
only `mode === 'progress'`, ~line 2305) are actually mode-aware. The four summary tiles and the
by-class row are EOM/Scoreboard artifacts that happen to still show while a different tab is active.

## The fix

Make the summary tiles and By-Class row swap their source data based on `mode`, the same way
`CadenceMonitor` already does:
- **`mode === 'eom'` or `'scoreboard'`** — keep current behavior exactly (EOM-basis `summary`/
  `classSummary`/`inWindow`). Don't change anything here.
- **`mode === 'progress'` (Count Cycle)** — swap to weekly-cycle-basis numbers instead: e.g. count
  of stores on-cycle vs. overdue (from `cadenceByLoc`, rebuilt by dispatch #97 onto the
  `count-cycle.js`/`qsr_onhand` basis), an average weekly Food/Condiment completion percentage
  using #97's new EOM-aligned threshold, and whatever "count window" concept makes sense for a
  rolling weekly cadence (there isn't a single open/closed window the way EOM has one — figure out
  what's actually meaningful to show here, e.g. "days until next store is due" or similar, rather
  than forcing EOM's exact tile shape onto a different kind of cycle).
- **Tile labels must say what they're showing.** Reusing the exact same tile chrome for a different
  underlying question (EOM window completion vs. weekly cadence health) without changing the label
  would just relocate the confusion — "Believe Done (≥90%)" specifically names EOM's threshold and
  window; the Count Cycle equivalent needs its own accurate label.
- **Don't invent a third "Daily" mode/tab unless real data supports one.** The owner's message named
  "EOM, Weekly, or Daily" — today there are only two count-progress tabs (`'eom'` and `'progress'`/
  Count Cycle), and Count Cycle's own data already distinguishes weekly full-count sessions from
  daily spot-checks internally (`nWeekly`/`nSpot`, `sessions[].kind`). Check whether the owner wants
  a genuinely separate Daily tab/view, or whether "daily" just refers to the spot-check sessions
  already visible inside Count Cycle's per-store drill-down — this is a real open question, not
  something to guess an answer to. If unclear, ask rather than build a speculative third mode.

## Verification bar

- Render the actual `EomDashboard`/panel consumer (not an isolated tile-computation function) in
  each of the three modes and confirm the summary tiles show materially different, mode-correct
  numbers — not the same EOM numbers bleeding through on Count Cycle. Per this repo's "would this
  verification still pass if reverted" rule.
- Confirm `mode === 'eom'`/`'scoreboard'` tiles are byte-for-byte unchanged from before this fix —
  this is an additive swap, not a rewrite of the EOM math.
- Sanity-check the Count Cycle tiles' numbers against a live pull the same way #97's own
  verification did (real store counts, not just "the code runs").

## Do NOT

- **Do not start this before #97 is merged.** Same file, same underlying data dependency — running
  both at once risks a merge collision and makes verifying either one harder.
- **Do not change EOM/Scoreboard tile behavior** — this is additive for Count Cycle only.
- **Do not invent a third "Daily" mode without confirming that's actually wanted** — see above.
- **Do not reuse EOM's exact tile labels/thresholds for Count Cycle's numbers** — different
  question, needs its own accurate label, even if the visual tile shape stays the same.

---

## Resolution (2026-08-25)

**Shipped.** EOM/Scoreboard tile behavior is unchanged, no third "Daily" mode was invented, and
Count Cycle got its own labels/thresholds rather than EOM's exact tile shape — matching every item
on the "Do NOT" list.

### What actually shipped

The summary-tiles block and By-Class row (`src/views/eom-dashboard.js`) were extracted out of
`EOMDashboardPanel`'s render body into a new component, `SummaryTiles({ mode, summary,
cycleSummary, classSummary, inWindow, hasRows })`, so the `mode` branch that was missing lives at
the actual call site a test can render directly — not re-derived from an isolated calc function.
`mode === 'eom'`/`'scoreboard'` render the exact original array of tuples and JSX, byte-for-byte;
`mode === 'progress'` (Count Cycle) swaps to a new `cycleSummaryFor(rows, cadenceByLoc)`, built
entirely on dispatch #97's `cadenceByLoc` (qsr_onhand-basis) — no new fetch, no touch to
`summary`/`classSummary`/`inWindow`/`r.prog` at all.

**Tile-by-tile mapping (Count Cycle):**
- **Stores reporting** — kept as a label; counts stores with a `cadenceByLoc` entry (same concept,
  cadence-basis instead of EOM-basis).
- **"On track (weekly)" X/N** replaces "Believe done (≥90%)". Reuses `CadenceMonitor`'s own 8-day
  bar — extracted the inline `statusOf` arrow it already had into a module-level
  `cadenceStatusOf`, used by both the table and the new tiles, so they can't drift into
  disagreeing about which store is "on track."
- **"Avg weekly F+C complete"** replaces "Avg count complete". Item-weighted (owner's 2026-08-06
  rule: total items counted ÷ total items, never a mean of per-store percentages) Food+Condiment
  coverage of each store's CURRENT attempt this period. A compliant store (`lastWeekly` set)
  contributes its real `weeklySessions` counts; a short attempt derives `counted = classTotals -
  stillMissing` from `diagnoseIncompleteCount`'s own `byClass` rows (which don't carry `total`, so
  `classTotals` — already on the cadence record — supplies it); a store with no attempt at all
  this period contributes 0 against its full universe. Reads "—", not a misleading "0.00%", when
  no store anywhere has cadence data.
- **"Overdue (≥8d)"** replaces "Count window". The dispatch's own framing was right — weekly
  cadence has no single open/closed window the way EOM's last-3-days does. Considered "days until
  next store is due" (the dispatch's own example) but there is no per-store expected-due-date
  concept computed anywhere else in this codebase (only the 8d/14d status thresholds), and
  inventing one to back a single forward-looking number would be exactly the kind of guess
  CLAUDE.md's "measure it, don't reason about it" rule warns against. Used the overdue COUNT
  instead — a number the table already computes (`nOverdue`) and displays as a table subtitle, so
  the tile and the table agree by construction. A "(+N never)" qualifier is appended when stores
  exist with no qualifying session on record at all this period, since "Overdue" and "Never" are
  a real, different distinction the table already draws (a store that's never run a full weekly
  count reads differently from one that's simply between counts).
- **By-Class row** swaps to `cycleSummary.classSummary` — Food and Condiment ONLY (weekly cadence
  never checks Paper/Non-Product, dispatch #97), labeled "Food · weekly"/"Condiment · weekly" so
  they can't be mistaken for the EOM tiles of the same underlying name. Built on the identical
  `{k, label, fob, pct, doneStores, n}` shape EOM's own `classSummary` already produces, so the
  render JSX needed no branching beyond picking which array to map — one more reuse of an existing
  shape instead of a second rendering path.

### The "Daily" mode question — genuinely left open, not guessed

Per the dispatch's explicit instruction not to build a speculative third mode: no "Daily" tab or
`mode` value was added. Count Cycle's per-store drill-down already distinguishes `nWeekly`/`nSpot`
sessions and each session's `kind` ('weekly'/'spot') — that machinery is untouched and still there
if "daily" turns out to mean the spot-check sessions rather than a new top-level view. This is an
open owner question, not resolved by this dispatch.

### Verification

**Render-level (per "would this verification still pass if reverted"):** new test file
`src/__tests__/dispatch-98-cycle-tiles.test.js` renders the actual `SummaryTiles` consumer — not
`cycleSummaryFor` in isolation — across all three modes, plus separate engine-level checks of
`cycleSummaryFor` against real `cadenceFromOnHand()` output (bucket counts, item-weighted
Food+Condiment `avg`, per-class `doneStores`, and the null-avg-not-0%-when-no-data case). Confirmed
the tests are load-bearing by temporarily reverting the `mode` branch (`const tiles = false`) and,
separately, the By-Class source branch (`const classRow = classSummary`), rerunning, and watching
the Count Cycle-mode assertions fail each time (EOM tile text — "Believe done (≥90%)", plain
"Food"/"Paper"/"Non-Product" — leaking into `mode==='progress'` output) before restoring both.

**`mode==='eom'`/`'scoreboard'` unchanged:** confirmed by rendering `SummaryTiles` with the same
fixture in both modes and asserting the original tile text/values/labels are all still present,
with no Count Cycle wording ("On track (weekly)", "Overdue (") leaking in.

**Live spot-check against Supabase** (`SUPABASE_SERVICE_ROLE_KEY` as a `Bearer` token, same pattern
dispatch #97's own verification used): pulled `qsr_onhand` for `period=2026-08` — **7,552 rows, 27
stores** (up from #97's 7,539 rows one day earlier, as expected for a live, growing table) — mapped
through the identical row shape `loadQsrOnHand` produces, and ran the ACTUAL shipped
`cadenceFromOnHand()`/`cycleSummaryFor()` call chain against it, `asOf: 2026-08-25`:

```
n: 27, nOnTrack: 2, nOverdue: 0, nNever: 25, avg: 0.9751 (97.51%)
classSummary: food pct 0.9728 (10/27 stores done), condiment pct 0.9829 (13/27 stores done)
```

This is coherent with, not contradicting, dispatch #97's own 2026-08-24 measurement (3/27 on track
that day: 10422, 11657, 13113). One day later 10422 dropped out of "on track" — not a bug: its live
Food `classTotals` grew from 119 to 122 active items between the two pulls (real-world SKU churn),
so its previously-98%-clearing session now reads short by 2 items against the larger denominator.
This is the exact single-item-flips-98%-compliance sensitivity #97's own Resolution flagged as a
follow-up (the `"(Deactivated)"`-phantom-item finding) — a real, measured property of grading at a
98% bar against a rolling active-item universe, not a defect in this dispatch's math.

### Test/build results

- `npm test`: **227 files / 2361 tests, all passing** (baseline immediately before this change:
  226 files / 2355 tests — net +6, all new, 0 regressions; confirmed by running the new test file
  against the pre-fix `eom-dashboard.js` via `git stash` and watching exactly those 6 fail).
- `npm run build`: clean. Entry eager payload **528.40 → 528.41 KB gzip** (+0.01 KB, hashing
  noise; budget 850 KB). `eom-dashboard` chunk (lazy, not in the eager budget): **62.29 → 62.88 KB
  gzip** (+0.59 KB).

**Version:** v5.152 (`src/app/changelog/5.152.js`).
