# Smart Targets: column sorting + Base Food Cost/Paper Cost/Disc-Coup (2026-09-14)

Two owner requests, same session as the FOB component breakdown (`memory/dispatch-smart-targets-fob-components-2026-09-14.md`), batched into one PR since both are small, well-scoped Smart Targets view changes:

1. "sort all smart targets by any column as well"
2. Add Base Food Cost, Paper Cost, Disc/Coup as Smart Targets metrics — explicit: "None of which affect the FOB Calculation."

## Column sorting

`smartTargetsSortValue(r, key)` (pure, exported) maps a header key to the row's
sortable value — direct reads for `official`/`smart`/`current`/`vsOfficial`, a
ranked (not string) lookup for `conf` (High=3/Med=2/Low=1, so it sorts
meaningfully instead of alphabetically), `bestFit` reads the winning method's
MAPE rather than its name, and `comp:<key>` reads one FOB component's own Smart
value. `sortSmartRows(rows, key, dir)` sorts by that value, nulls always last.

**Real bug caught by the tests before shipping**: the first implementation computed
an ascending sort (nulls last) and then did `dir==='desc' ? sorted.reverse() :
sorted` — reversing the WHOLE array also reverses null position, putting missing
values FIRST on desc (the exact wrong direction for "never the biggest or
smallest"). Fixed by keeping the null-handling comparisons unconditional and only
multiplying the real-value comparison by a sign (`dir==='desc' ? -1 : 1`), so
nulls stay last in both directions. `src/__tests__/dispatch-smart-targets-column-
sort-2026-09-14.test.js`'s "sorts descending, nulls STILL last" case is what
caught it — worth noting as a case study for the standing "measure it" rule: the
bug was in a 5-line pure function and still shipped wrong on first write.

Wired into `SmartTargetsPanel`: `sortKey`/`sortDir` state, a `Th()` header helper
(click → `toggleSort`, arrow indicator via `sortArrow`), applied to `shown` right
before render (and before CSV export/print, so both follow the visible order).
Resets to the default (direction-aware) order on metric change, since a
`comp:xxx` sort key from FOB is meaningless once you're looking at Sales. The
`Apply` column stays non-clickable — it's an action button, not a data column, so
there's no natural sort value for it (documented as a deliberate exception, not
an oversight).

## Base Food Cost / Paper Cost / Disc/Coup

Three new `METRICS` entries, `direction:'lower'`, `ratio:true`, matching the
existing pattern. All three read `qsr_fob` (the same table + monthly-collapse
FOB % already used — `fobLatestPerMonth()`, factored out of the old `fobMonthly`
so the same cumulative-MTD-row logic isn't duplicated four times):

- **Base Food Cost %** = `totalBaseFood / prodSalesAmt`. Official: `tFOBBase`
  (`monthly_targets.base_food_pct`).
- **Paper Cost %** — no stored pct column on `qsr_fob`; derived from the 6 P&L
  paper-cost legs: `(Begin+Purchases+Adjustments+Transfers−Promotions−End) /
  prodSalesAmt`. Official: `tPaperCost` (`monthly_targets.paper_cost_pct`).
- **Disc/Coup %** = `discountCouponsAmt / prodSalesAmt`. Official:
  `tDiscCoupPct` (`monthly_targets.disc_coup_pct`). Deliberately separate from
  the existing `promopct` metric — that one reads Daily Glimpse's `promoPct`,
  this reads `qsr_fob`'s own `discountCouponsAmt`; different sources, not a
  duplicate.

**Field names verified directly, not trusted from memory**: `totalBaseFood`,
`discountCouponsAmt`, and the 6 `pnlPaperCost*` legs were confirmed by reading
`src/views/at-a-glance.js`'s `fobAgg`/`fobAuto` (~L793-799, L838-842) — the exact
formula the At-A-Glance FOB tile already ships — before writing any new code
against them, per the standing "measure it, don't reason about it" rule.

**None of the three feed FOB %'s 6-component sum** — confirmed by a test
(`fobMonthly` case in the same fixture row that also carries `totalBaseFood`/
paper/`discountCouponsAmt` fields) that `fobMonthly()`'s own output is byte-for-
byte the same 6-component formula as before, unaffected by the new fields being
present on the same row. `officialCol`/`officialVal` for the 3 new metrics were
also confirmed to round-trip through `monthly_targets` correctly by the research
that preceded this dispatch (`saveMonthlyTargets`/`loadMonthlyTargets` already
had `base_food_pct`/`paper_cost_pct`/`disc_coup_pct` columns wired both ways —
no schema change needed).

## Tests

- `src/__tests__/dispatch-smart-targets-column-sort-2026-09-14.test.js` — 12
  cases: `smartTargetsSortValue` per-column-key reads + degradation, `sortSmart
  Rows` sum/null/stability/direction behavior (5 cases, including the caught
  null-position bug), 2 real `SmartTargetsPanel` renders (click Smart header
  asc/desc and confirm row order actually flips; switch metric and confirm the
  arrow disappears).
- `src/__tests__/dispatch-smart-targets-basefood-paper-disccoup-2026-09-14.test.js`
  — 8 cases: the 3 new monthly-collapse functions' formulas, the FOB-unaffected
  regression guard, `METRICS` registry shape (officialCol/direction/ratio/no
  `components`), `officialVal` reading the real DEFAULT_TARGETS fields for store
  3708, and a real `SmartTargetsPanel` render selecting each of the 3 new
  metrics via its actual `<select>` and confirming a real row (not the empty-
  history placeholder) appears for each.

All 20 new/extended assertions confirmed to fail against pre-fix code (`git
stash` round-trip on the one changed source file).

Full suite 512/512 files, 4893/4893 tests. Build clean, 543.97 KB / 850 KB
eager-payload budget.

## Related / still open

- Owner also asked for a **year-to-date backtest engine** across all Smart
  Targets metrics (Smart-as-of-month-start vs real Actual vs real historical
  Official). That's a separate, larger dispatch — design notes from the research
  that preceded both dispatches: `mergedTargetsForLocMonth()` (`engine/review-
  engine.js`) is a ready-made per-store-per-past-month official-target resolver
  to reuse rather than rewriting the merge chain; `oepe`/`r2p` only have YEARLY
  official history (`yearly_targets`), `avgcheck`/`promopct` have NEITHER
  (DEFAULT_TARGETS static only) — those two can't get a real historical-Official
  column, only a real Actual-vs-Smart-as-of one; `daily_glimpse_daily`-sourced
  metrics (oepe/laborpct/avgcheck/promopct) have a **hard floor at 2026-07-01**
  (forward-only emailed stream, no backfill possible) so a full-year backtest is
  infeasible for those regardless of lookback requested.
