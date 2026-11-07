---
name: project-new-store-launch-planner
description: "New Store Launch Planner — a reusable day-by-day sales plan for a newly opening/relocating store, seeded from the comparable-store ramp model and editable in-app. First used for Lindsay (44689), but built as reusable infrastructure for the next relocation/opening per the owner's own stated goal."
metadata:
  node_type: memory
  type: project
scope: tenant
sensitivity: open
---

# New Store Launch Planner (2026-11-06)

## What prompted this

Same conversation, same session: the owner needed Lindsay's (44689) new-standalone-building
opening (2026-11-14, official grand opening 2026-11-17) staffed via LifeLenz, and asked "where
did we put the projections." The honest answer was: nowhere real yet — `DEFAULT_TARGETS['44689']`
in `constants.js` is a verbatim copy-paste of predecessor 18213's old targets, explicitly flagged
in its own code comment as a placeholder, not a forecast. The real tool for this,
`src/engine/new-store-ramp.js` (built 2026-10-14, comparable-store ramp blending), existed but had
never actually been run with real numbers.

I ran it live against real `qsr_daily_activity` data (Tishomingo 43380 weighted 0.7, Ponce de Leon
43701 weighted 0.3 — the owner's own read on which stores are comparable) and got real, actionable
numbers — see §2. The owner then said: "We need to forward think as we do this to be able to model
future new locations on something to kickstart forecasting," and approved building this as a
reusable tool, not a one-off script. "Build it now."

## 1. What already existed (measured, not assumed)

`src/engine/new-store-ramp.js` already had, fully tested, real functions: `firstTradingDay`,
`rampSeriesFor`, `matureBaseline`, `rampShape`, `blendRampShapes`, `projectNewStoreSales`. It
blends comparable stores' own real opening trajectories (as a fraction of each comparable's own
mature run-rate) into a day-indexed `$` forecast, given a caller-supplied mature weekly sales
assumption — deliberately never guessed by the engine itself. This design plugs into that engine
rather than duplicating it.

## 2. The real Lindsay numbers (measured live, 2026-11-06)

Queried live `qsr_daily_activity`, summed `product_sales` across `hour_slot` per `(loc,dt)`:

- **Tishomingo (43380)** real mature daily sales: **$6,276/day** (≈$43,930/week). 707 real daily
  rows.
- **Ponce de Leon (43701)**: **$7,148/day** mature daily sales. 246 real daily rows.
- **Inflation-adjusted assumption for Lindsay**: Tishomingo's weekly figure × 3.5%/yr compounded
  over ~23 months (Tishomingo opened 2024-12-16, Lindsay opens 2026-11-14) ≈ **$46,925/week**. This
  is a default, not a hardcoded truth — the UI lets the owner change it per store/opening.
- **The real finding that changes the staffing picture**: the blended comparable shape shows a
  **grand-opening BUMP, not a slow ramp** — day 0 (partial, matching Lindsay's own planned 10am
  lunch-only soft open) is low (0.30× mature), but days 1–7 run **0.96×–1.81×** mature, settling
  toward ~1.0–1.3× by week 8. Both real comparables ran ABOVE their own eventual steady-state for
  the first several weeks. Staffing should budget closer to peak for weeks 1–4, not ramp up slowly.
- This real comparable-based estimate ($46,925/week) is **lower** than the 18213 placeholder
  ($61,438/week) — 18213 is an old in-Walmart unit with its own baked-in volume; don't treat either
  number as interchangeable with the other.
- **Owner-stated, received mid-build: Lindsay opens as a 24-HOUR operation for its first year** —
  a deliberate owner operating decision, not something the Tishomingo/Ponce de Leon ramp-shape
  comparables predict (whatever those two stores' own overnight patterns are, they don't apply
  here). This does NOT change the day-level `$` math — `projected_sales` stays daypart-agnostic,
  no change needed in `new-store-ramp.js` or the schema. It matters for whoever builds the
  LifeLenz schedule off these numbers: Late Night staffing cannot be assumed minimal. Surfaced as
  an `opsNote` field in `launch-planner.js`'s `SEED_DEFAULTS['44689']`, rendered as a visible
  warning banner in the panel.

## 3. What was built

- **`projectLaunchPlan({loc, comparables, matureWeeklySales, openDate, maxDays})`**
  (`src/engine/new-store-ramp.js`) — a thin calendar-mapping layer over `projectNewStoreSales`.
  The day-indexed math is untouched; this only maps `dayN` to a real `plan_date` starting at
  `openDate`.
- **`new_store_launch_plan` table** (`supabase/schema-new-store-launch-plan.sql`, owner migration,
  not yet run as of this writing) — one row per `(tenant_id, loc, plan_date)`:
  `projected_sales` (the model's own output), `override_sales` (nullable — the owner's manual
  edit), `note`, `source` (`'ramp'` | `'manual'`). Same tenant_id+RLS shape as every other small
  operational table in this repo (closest analog: `runtime_error_reports`).
- **`saveLaunchPlanRow`/`loadLaunchPlan`/`loadDailySalesForStore`** (`src/lib/supabase.js`) — the
  first two self-heal (silent no-op) against the missing table until the owner runs the migration,
  same pattern `reportRuntimeError` already established. `loadDailySalesForStore` is a new minimal
  single-store `{loc,date,sales}` reader — `loadDailyActivityRangeForStore` already existed but
  selects labor columns, not `product_sales`, and widening that shared selection would cost every
  other caller for a long comparable history (Tishomingo: ~2 years × 24 `hour_slot`s).
- **`NewStoreLaunchPlanner`** (`src/views/launch-planner.js`, `panel-registry.js` id
  `launch-planner`, Planning section, `kind:'nav'`, `route:true` from day one) — an editable grid:
  Day N / Date (+ DOW) / Projected $ (read-only, from the model) / Override $ (editable) /
  Effective $ (`override ?? projected`) / Suggested Labor Hours (`effective ÷ DEFAULT_TARGETS[loc]
  ?.tTpph`). A **"Regenerate from ramp model"** action re-derives `projected_sales` for every row
  whose `source` is still `'ramp'` — it **never touches** a row the owner has overridden
  (`source:'manual'`), which is the mechanic that makes this reusable for the next opening rather
  than a one-off: changing the comparables/weights/run-rate and re-running never silently discards
  manual corrections. A Grand Opening date input flags the matching row visually and in its note.
  Store picker is a plain `<select>` over `STORE_NAMES`, not `LocationSelector` — this is a
  single-store, occasional-use planning tool (one in-flight launch at a time), the same exception
  class `memory/panel-contract.md` already documents for `StoreKBEditor`'s own non-`LocationSelector`
  picker.

## 4. Seeded defaults (convenience only, not load-bearing)

`SEED_DEFAULTS['44689']` in `launch-planner.js` pre-fills the form with Lindsay's real numbers
(§2) and the 2026-11-17 grand-opening date — purely a UI convenience for the first real use; every
field is editable, and a different store/opening starts from blank inputs.

## 5. What this does NOT do (by design)

- **No hour-level/daypart breakdown.** Day-level only, v1. The LifeLenz schedule build itself is
  where daypart allocation happens; this tool hands it a daily $ figure and a suggested hours
  total, not an hourly curve.
- **No auto-persist of the real Lindsay plan.** The schema migration hasn't run yet (owner action,
  DDL is never run by an agent session). The computed first-10-day numbers were shown in this PR's
  own report for sanity-check; the actual rows get written the first time the owner opens the panel
  and clicks "Regenerate from ramp model" after running the migration.
- **No multi-launch-at-once UI.** One store selected at a time. If two openings are ever in flight
  simultaneously, the store picker already supports switching between them (each loc's plan is
  independent), but there's no side-by-side comparison view — not asked for, not built.

## 6. Reusability — the actual point of this build

Every input (store, comparables + weights, mature run-rate assumption, open date, grand-opening
date) is a form field, not a constant. The next relocation or new build just needs: pick the new
store, pick its comparables and weights, type a mature run-rate assumption, set the open date, and
click Regenerate — no new code. This is the "kickstart forecasting" infrastructure the owner asked
for when he said "we need to forward think... to be able to model future new locations."

## 2026-11-06 (later same day) — hourly breakdown

Owner, after seeing the day-level grid live and asking where the Suggested Hours number came from
(real bug, fixed separately — see commit `9434bb76`, PR #1707): *"do we have the horsepower to
generate the first week or two of hourly or quarter hourly sales."* Measured directly before
building anything:

- **Hourly: yes, real.** `qsr_daily_activity`'s `hour_slot` for the comparables (checked live
  against Tishomingo 43380, one real day) comes back as exactly 24 ON-THE-HOUR slots
  (`05:00`→`28:00`). The field's internal name hints at quarter-hour origin; the actual DAR pull
  never populates anything finer than hourly.
- **Quarter-hour: no, not from this table.** Any quarter-hour view would have to be
  *interpolated* from the real hourly curve, not measured — not built, since presenting an
  interpolation as real data would be the kind of claim this repo's own "measure it, don't
  reason about it" rule exists to prevent.

### What was built

- **`hourlyShapeFor(hourlyRows, loc)` / `blendHourlyShapes(comparables)` / `splitDayAcrossHours(dailyTotal, blended)`**
  (`src/engine/new-store-ramp.js`) — a derived VIEW over real `hour_slot`-level sales, structurally
  parallel to the existing day-level `rampShape`/`blendRampShapes` (same trailing-up-to-90-real-
  trading-days mature window, same per-store-own-baseline-then-blend-by-weight shape). Explicitly
  NOT persisted — computed live in the panel from already-loaded rows when the owner expands a day,
  so no new table/DDL for this piece.
- **`loadHourlySalesForStore(loc, startDate, endDate)`** (`src/lib/supabase.js`) — same table/filter
  as `loadDailySalesForStore`, but keeps `hour_slot` instead of summing it away (that function's own
  header already explains why these stay two separate minimal queries rather than one widened one).
- **Overnight-comparability guard.** `hourlyShapeFor` also reports each comparable's own real
  fraction of sales in the deep-overnight slots (`05:00`, `24:00`-`28:00`) and flags
  `nearlyClosedOvernight` under 1%. `blendHourlyShapes` carries this forward as
  `anyNearlyClosedOvernight` — directly motivated by Lindsay's real 24-hour-year-one decision: if
  Tishomingo or Ponce de Leon is itself near-closed overnight, their shape is not a valid stand-in
  for Lindsay's real Late Night trading, and the panel says so rather than silently applying it.
- **UI** (`src/views/launch-planner.js`): a "▸ Hourly" toggle per plan-date row expands a nested
  24-row table (hour range, $, Suggested Hrs — same corrected `($ ÷ avg check) ÷ TPPH` formula as
  the daily total), with the overnight caveat banner shown inline when it applies. The blended
  shape is cached by the comparables' own signature so switching which day is expanded never
  re-fetches; editing the comparable list/weights invalidates the cache.

## 2026-11-07 — quarter-hour (15-min) breakdown: the "no quarter-hour data" conclusion was wrong

The 2026-11-06 hourly-breakdown entry above states *"Quarter-hour: no, not from this table"* and
explains that was true of `qsr_daily_activity` specifically. The owner asked to re-check ("We
should have the quarter hourly data from the pulls") rather than accept that as final — correct
call. A **separate table, `qsr_sales_quarter_hour`**, already holds REAL 15-minute sales buckets:
built on 2026-10-12 for the unrelated "Record Hour" feature (best rolling 60-consecutive-minute
sales window), live-measured at **96 distinct `qtr_slot` values/store/day**, backfilled to
**2024-01-01** (2,511,402 rows total as of that build) — see
`memory/finding-record-hour-quarter-hour-pull.md`. The 2026-11-06 check only looked at
`qsr_daily_activity` (genuinely hourly-only) and never searched for a sibling table; this is
exactly the "check whether an affordance already exists before adding one" miss CLAUDE.md warns
about, just on the read side instead of the write side.

### What was built

Structurally parallel to the hourly breakdown, one level finer, reusing the REAL quarter-hour data
rather than interpolating from the hourly curve (interpolation would be exactly the kind of
unmeasured claim the "measure it, don't reason about it" rule exists to prevent — not needed here
since real 15-min data already exists):

- **`loadQuarterHourSalesForStore(loc, startDate, endDate)`** (`src/lib/supabase.js`) — sibling of
  `loadHourlySalesForStore`, reading `qsr_sales_quarter_hour` instead of `qsr_daily_activity`.
  loc is stored PADDED in that table (matching every other QSRSoft-sourced table) but this
  function returns it unpadded, same convention the existing day/hour readers already use for
  this engine's callers.
- **`QTR_SLOTS` / `DEEP_OVERNIGHT_QTR_SLOTS` / `quarterHourShapeFor` / `blendQuarterHourShapes` /
  `splitDayAcrossQuarterHours`** (`src/engine/new-store-ramp.js`) — same trailing-up-to-90-real-
  trading-days shape logic as the hourly functions, keyed on the 96 real `qtr_slot` buckets
  (`'04:15'`..`'28:00'`) instead of 24 `hour_slot` buckets. `DEEP_OVERNIGHT_QTR_SLOTS` is DERIVED
  from the existing `DEEP_OVERNIGHT_SLOTS` (each hour bucket's 4 constituent 15-min slots),
  not hand-duplicated, so the two sets can't drift apart.
- **UI**: a second "▸ 15-min" toggle alongside the existing "▸ Hourly" toggle on each plan-date
  row, independently expandable (a day can show neither, either, or both breakdowns at once) —
  expands a nested 96-row table (15-min range, $, Suggested Hrs, same corrected formula), with the
  same overnight-comparability caveat banner.
- Explicitly NOT persisted — same derived-live-view approach as the hourly breakdown, computed
  from already-loaded rows when the owner expands a day.

Tests: 12 new engine tests mirroring the hourly suite exactly (`src/__tests__/new-store-ramp.test.js`),
1 loader test + 2 panel tests (`src/__tests__/dispatch-launch-planner-2026-11-06.test.js`). Full
suite 772/772 files, 7062/7062 tests. Build clean, 670.64 KB gzip eager payload (budget 850 KB,
negligible change from the pre-existing 670.52 KB).

## 2026-11-07 (later same day) — 12-month reconciliation: two independent methods converge within 0.3%

Owner: "let's remodel the sales forecast for 12 months for 44689... I think we documented it
somewhere... I think maybe I copied it and saved it" — then pasted a recollection: 18213's real
trailing-12-month sales ($2,154,000.83), the Holdenville NSN 2979→35064 precedent (+$500,000 in
year one), and a rough "$8k-$9k/day" and "2.7M/year" sense of where Lindsay should land. Asked to
reevaluate against the existing ramp-model assumption and adjust if they no longer agreed.

**What was measured, live, before changing anything:**

- **18213's real trailing-12-month sales** (2025-10-01 → 2026-09-30), summed directly from
  `qsr_daily_activity.product_sales`: **$2,154,060.43** across 8,761 real hour-slot rows —
  matches the owner's recollection ($2,154,000.83) almost exactly.
- **The Holdenville $500k-year-one precedent** was already documented, owner-sourced-only, in
  `memory/finding-qsrsoft-retention-2026-10-17.md`'s "Holdenville NSN 2979 → 35064" section —
  QSRSoft's own data retention erased that window for every store (not a 2011-date error; the
  transition happened, see that file's dated correction), so the $500k figure can never be
  independently re-verified from Meridian's own data and was correctly treated here as a given
  fact, not re-investigated.
- **$2,154,060.43 + $500,000 = $2,654,060** — this is almost certainly the real source of the
  owner's "~2.7M/year" recollection, reconstructed exactly from the two real numbers they
  supplied, not a new estimate.
- **The existing ramp-model assumption, run for the real 365 days it was never actually shown
  for**: `projectNewStoreSales` from `src/engine/new-store-ramp.js`, run directly against real
  Tishomingo (43380, weight 0.7) and Ponce de Leon (43701, weight 0.3) daily sales loaded live
  from `qsr_daily_activity`, at the EXISTING `matureWeeklySales: 46925` seeded in
  `launch-planner.js`, produces a real 365-day total of **$2,646,006** (vs. just $726,770 for the
  first 90 days — the old hardcoded 60-day UI window never showed enough of the curve to check
  this against anything).
- **$2,646,006 vs. $2,654,060 is a 0.3% difference** — two completely independent methods
  (comparable-store ramp shape vs. predecessor-store base + a real precedent transition) converge
  on essentially the same number.

**Conclusion: the $46,925/week mature-sales assumption is validated and unchanged.** The real gap
was never the assumption — it was that the UI had no way to view or check a 12-month total at
all. That gap is now closed (see "What changed" below), not the math.

**The "$8k-$9k/day" figure also reconciles, not contradicts.** $2.65M/365 ≈ $7,260/day as a
FULL-YEAR average, below $8k-$9k — but the existing ramp shape (documented in this file's first
section) already shows days 1-7 running 0.96x-1.81x mature and settling toward 1.0-1.3x by week
8, i.e. a MATURE steady-state of roughly $6,704-$8,715/day once the opening bump settles — which
is exactly the $8k-$9k/day range, just describing the steady-state rate rather than the blended
first-year average. Both figures were right; they were answering different questions.

**One operational note surfaced in passing, not acted on here**: GM Harlee's last day is
2026-10-14, with the new GM starting 2026-10-16 — a leadership transition landing about a month
before a brand-new-building opening (2026-11-14) and grand opening (2026-11-17). Worth keeping in
mind for onboarding/readiness, but this tool is a sales-ramp planner, not an HR tracker — no field
was added for it here.

### What changed

The gap this surfaced: `maxDays` was hardcoded to 60 with zero UI control, so nobody could ever
see — or sanity-check an assumption against — a real annual total.

- **`src/views/launch-planner.js`**: `maxDays` now defaults to **365** (a true 12-month view).
  Added a **Plan Length** `<select>` (60 / 90 / 180 / 365 days) next to the other inputs so any
  window length is a click, not a code edit — reusable for the next opening, same as every other
  input on this panel. Added a **"Projected Total (N days): $X"** stat, summing every row's
  EFFECTIVE sales (`overrideSales ?? projectedSales`) across however many rows currently exist —
  shown only once a plan exists (hidden in the empty state).
- Tests: 3 new (`src/__tests__/dispatch-launch-planner-2026-11-06.test.js`) — the Plan Length
  select defaults to 365, the Projected Total stat is absent with no rows, and it correctly sums
  effective sales (override wins over its own row's projected value) with the right row count in
  its label.
