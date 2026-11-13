# "Prime Cost %" renamed to "Labor + FOB %" — it was never the real industry metric

**Owner-reported 2026-11-13**: *"Not just for this instance, but everywhere throughout, you have
begun referencing Prime Cost %. This is not a term any of our people are familiar with. What
exactly is it representing and can we find a new way to denote it?"*

## What it actually computes

`src/engine/metric-source.js`'s `primeCostPct`: `laborPct + fobPct`. Both inputs are themselves
already-resolved ratios — this is a sum of two percentages, not a new ratio with its own
numerator/denominator.

`fobPct` is **not food cost / COGS**. It's `fobTotalAmt / prodSalesAmt`, where `fobTotalAmt` is a
six-way sum: `compWasteAmt + rawWasteAmt + condimentsAmt + empMgrMealsAmt + statVarianceAmt +
unexplainedAmt` — comp waste, raw waste, condiments, employee/manager meals, statistical
inventory variance, and unexplained variance, all from `qsr_fob`. That is a **waste/variance**
measure: how much of production sales is lost to spoilage, shrink, and unexplained gaps. It is
deliberately narrow — CLAUDE.md's own SAGE tool-scope notes say plainly that total food cost %
"isn't in Meridian's data model," and this app has never claimed to carry real COGS%.

## Why "Prime Cost %" was the wrong name

The real restaurant-industry term **Prime Cost** = Labor % + **COGS %** (the full cost of the
food and paper actually sold), typically 55–65% combined for a QSR. What this app was calling
"Prime Cost %" is Labor % (correctly a real cost) + a waste/variance percentage (typically a
couple of points, not a cost-of-goods figure) — a structurally different, much smaller number
that would never match what anyone who knows the real term expects to see. The label implied
coverage ("your total cost structure") this number never had. Task #86 (2026-07) named it this
way at build time; that was the original mistake, not something that drifted later.

## The fix

**Renamed to "Labor + FOB %" everywhere it's displayed** — plain, says exactly what's summed,
no industry jargon required to parse it. Scope:

- `src/engine/location-dossier.js` — `DOSSIER_METRICS`'s `primeCostPct` entry label.
- `src/engine/top-bottom-performers.js` — `PERFORMER_METRICS`'s `primeCostPct` entry label (the
  Top/Bottom Performers leaderboard).
- `src/__tests__/dispatch-86-prime-cost-pct.test.js` — updated its label assertion.
- `src/engine/metric-source.js` — comment reworded (no label field there; the key itself feeds
  consumers' own labels).

**Deliberately NOT renamed**: the internal key `primeCostPct` itself, in any file. Renaming a
widely-referenced key for a label-only change would be pure churn across multiple files for zero
behavioral or display benefit — every consumer already looks up its own display label separately
from the key.

**Left untouched (historical record, not a live claim)**: `src/app/changelog/5.630.js` (the
original task #86 ship log) and `src/app/changelog/5.761.js` (today's earlier Location Dossier
Phase 1 ship log) — both describe what those versions actually shipped at the time, under the
name the UI used then. Changelogs are a history, not documentation to keep current.

If the owner later wants the REAL industry Prime Cost (Labor % + true food-cost %), that needs a
genuine COGS%/total-food-cost figure in the data model first — not available today, a real open
item, not attempted here.
