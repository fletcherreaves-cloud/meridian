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
