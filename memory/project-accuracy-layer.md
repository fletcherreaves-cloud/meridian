---
name: project-accuracy-layer
description: Accuracy & Integrity primitives (Workstream A / P0) — the shared math layer every aggregate and report should route through
metadata:
  node_type: memory
  type: project
---

# Accuracy & Integrity Layer (P0 foundation)

`src/lib/accuracy.js` — pure, dependency-free, unit-tested in
`src/__tests__/accuracy.test.js` (20 tests). Shipped v4.435. This is Workstream A
from `memory/vision-and-roadmap.md`: build the primitives first, then bake them
into every panel/report so the standing rule holds — **correct math, never
average averages, dollar-weight aggregates, self-audit every report.**

## API
**Aggregation (the heart):**
- `sum(rows, fn)` — Σ, skips non-numeric.
- `weightedRate(rows, numFn, denFn)` → **Σnum/Σden** — the ONLY correct way to
  aggregate a ratio (speed, labor %, food-cost %, pull-fwd %) across stores/hours.
  null when Σden = 0.
- `weightedMean(rows, valueFn, weightFn)` → **Σ(v·w)/Σw** — dollar/count-weight a
  finished per-store rate (fixes the straight-average FOB bug).
- `mean(rows, fn)` — simple average; CORRECT ONLY for non-ratios (counts, dollars).
  Named explicitly so using it on a ratio is a visible choice, not an accident.

**Scale & units (regression guards):**
- `pctToFraction` / `fractionToPct`, `asFraction(x)` (coerces a percent-looking
  value → fraction, warns once — for the 0-1 vs 0-100 bug).
- `perUnitSeconds(timeSum, count, {from:'ms'})` — DAR raw times are ms sums;
  guards the µs/ms/s bug. (This is what `secOf` in graded-visits does.)
- `padLoc(loc, 7)` — zero-pad NSN for `qsr_daily_activity` joins.

**Reconciliation:** `reconcile({ledger, dar, labor}, {tolerance})` — flags when the
same quantity from multiple sources diverges (relative default; `{absolute:true}`).

**Report self-audit:** `audit([checks])` → `{pass, failed, checks}` for a ✓/⚠
badge. Builders: `check(name, ok, detail)`, `checkRowsSumToTotal`, `checkInRange`
(e.g. % in [0,100]), `checkDateCoverage` (no missing days).

**Pagination:** `fetchAllPages(fetchPage, {pageSize:1000})` — defeats Supabase's
1000-row cap (the freshness-banner bug root cause). fetchPage(offset, limit)→array.

## Next: bake in (retrofit targets, owner to prioritize)
1. **FOB / Food Cost** — route district roll-ups through `weightedMean` (dollar-
   weighted); add a `checkInRange` audit badge on the panel.
2. **Freshness / At-A-Glance** — `reconcile` day sales across sales_ledger vs DAR
   vs labor; show a ⚠ when they disagree instead of silently picking one.
3. **Any Supabase loader** that could exceed 1000 rows → `fetchAllPages`
   (audit existing loaders; `loadQsrActSummary` was already fixed manually).
4. **Generated reports (print/CSV)** — attach an `audit()` badge (rows sum to
   total, % in range, dates complete).
5. Graded-Visits day aggregate already sums-then-divides (weighted) — can adopt
   `weightedRate` for readability but math is already correct.

## Note (unrelated, pre-existing)
`src/__tests__/forecast.test.js` has 9 pre-existing failures on this branch
(forecastDay in `src/engine/forecast.js:1264`) — NOT introduced by the accuracy
work. Flagged for a separate look; failing tests undercut the accuracy theme.
