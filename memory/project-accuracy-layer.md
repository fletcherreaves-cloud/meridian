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

## Baked in so far
1. ✅ **FOB / Food Cost** (v4.440) — verified the district roll-up already
   dollar-weights (no math change); added a reusable **`AuditBadge`** + `fobAudit()`
   self-audit (data present, total sales>0, FOB% in [0,100], all locs have sales,
   and a `reconcile()` of the reported weighted FOB% vs a fresh `weightedMean`
   recompute). Badge shows in the FOB KPI strip. AuditBadge is reusable.
2. ✅ **At-A-Glance sales reconciliation** (v4.441) — `salesRecon` memo +
   ✓/⚠ badge by the "● Data:" status. Cross-checks period **PRODUCT** sales
   (owner's call) across sources for the active scope. KEY SEMANTIC FINDING:
   only DAR-summary (`sales` = Σ product_sales) and Sales-Ledger (`prodSales`)
   carry product sales; **`labor_rows` has only a single `sales` (net/total
   basis, no product split)** — so labor is shown in the tooltip for reference
   but NOT reconciled (mixing bases would false-alarm). Flags >2% divergence.
   TODO if wanted: add a product-sales field to the Ops/labor upload so labor
   can join the reconcile on a like-for-like basis.

## Next: bake in (remaining targets)
3. **Any Supabase loader** that could exceed 1000 rows → `fetchAllPages`
   (audit existing loaders; `loadQsrActSummary` was already fixed manually).
   ✅ v4.439 audit found + fixed 3 silently-truncating loaders in `supabase.js`
   (all now use the existing `fetchAll` pager):
   - `loadLifeLenzSchedule` — 5-year window (`daysBack:1825`) × 27 stores was
     returning only the newest ~1000 rows (~37 days).
   - `loadDailyActivityRange` — 27 stores × ~25 slots exceeds 1000 after ~1.5 days.
   - `loadDtHistory` — `.limit(100000)` does NOT beat Supabase's server max-rows
     cap; the 90-day Speed-of-Service panel was getting ~1 day. (FINDING: `.limit(N)`
     above the server cap is a no-op — always paginate with `.range`.)
   Still worth a pass: `fob_rows` (manual, usually small) and `smg_fullscale`
   (monthly, small) selects have no pagination but rarely exceed 1000.
4. **Generated reports (print/CSV)** — attach an `audit()` badge (rows sum to
   total, % in range, dates complete).
5. Graded-Visits day aggregate already sums-then-divides (weighted) — can adopt
   `weightedRate` for readability but math is already correct.

## Note (unrelated, pre-existing)
`src/__tests__/forecast.test.js` has 9 pre-existing failures on this branch
(forecastDay in `src/engine/forecast.js:1264`) — NOT introduced by the accuracy
work. Flagged for a separate look; failing tests undercut the accuracy theme.
