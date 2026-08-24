---
name: dispatch-108
description: Event Impact Registry (src/views/event-impact.js) only has real measured data for the Sports (Home/Away) category -- Festival/Fair, Weather, LTO/Promo, and Holiday all show "No measured data for this event type yet," and the panel only tracks sales lift, never GC. The measurement engine (measureEventLift/shrinkLifts in src/engine/retail-events.js) and a proven runner script (scripts/measure-retail-impact.mjs) already exist and already power both Sports and the 4 retail/shopping types (tax_free/black_friday/small_biz_sat/cyber_monday) -- but those retail types' actual measured status in production Supabase hasn't been verified in this dispatch (assume unknown, check first). Owner wants ALL categories measured using existing historical sales AND GC data, not just sales.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #108 — Event Impact Registry: measure the remaining event types, add GC lift alongside sales

## Owner's ask, in full

*"Event Impact Registry > Need to add impacts for all categories. You have historical sales and gc
data to do this already."* (Screenshot shows Sports (Home/Away) fully populated — real per-store
measured lifts with real n counts — while the type dropdown lists Festival/Fair, Weather, LTO/Promo,
Holiday, and four retail categories.)

## What already exists (checked, not assumed)

`src/engine/retail-events.js` has a **proven, reusable measurement engine**, already used for two
categories:
- `measureEventLift(salesRows, eventDatesByLoc, opts)` (~line 270): for one event type, per event day
  compares a store's actual sales to the **median of its own same-day-of-week sales within ±28 days**
  (excluding other event days and holiday closures), producing a per-store `{measured, n, lifts}`.
- `shrinkLifts(perLoc, K=10)` (~line 303): n-shrinks each store's measured lift toward the district
  mean — a store with 2 observations doesn't swing its own forecast on noise. **Same method the
  football/Sports seed used** (`memory/event-impact-registry.md`).
- `scripts/measure-retail-impact.mjs` already runs this end-to-end for `RETAIL_EVENT_TYPES =
  ['tax_free','black_friday','small_biz_sat','cyber_monday']` — reads `labor_rows` sales, expands
  each type's calendar dates via `expandRetailEvents()`'s rule set (`RETAIL_EVENT_RULES`, all
  rule-derived or hard-dated, cited to a primary source — see that file's own "date provenance"
  section), measures, shrinks, upserts to `event_impact`.

**Whether that script has actually been run against production yet is NOT verified by this
dispatch** — the screenshot only shows the Sports view, not the retail-type rows. **First step: run
`node scripts/measure-retail-impact.mjs --dry` against production and read its output** before
assuming the 4 retail types are already done or still need doing. Don't duplicate work; don't assume
it's finished either — measure it.

The `event_impact` table (`supabase/schema-event-impact.sql`) currently stores **sales lift only**:
`home_impact`/`away_impact`/`measured_home`/`measured_away`/`n_home`/`n_away`. **There is no GC column
at all** — adding GC-lift is a real schema change, not just a new script run.

## What's genuinely new work, and why the remaining 4 types split into two different problems

**`holiday` — trivially measurable the same way as the retail types.** `HOLIDAY_MAP`
(`src/utils/holidays.js`) already has exact per-year holiday dates system-wide, including which are
full/partial closures (already excluded as baseline-contaminating in `measure-retail-impact.mjs`'s own
`excludeDates` logic — reuse that same exclusion, but this time to build holiday EVENT dates for the
*open* holidays, not to exclude them). Build this as a peer to `RETAIL_EVENT_RULES`/
`expandRetailEvents()` (or feed `HOLIDAY_MAP` directly into `measureEventLift`) and add `'holiday'` to
a runner script (extend `measure-retail-impact.mjs` or add a sibling script — match whichever is
cleaner given the actual code once you're in it).

**`event` (Festival/Fair) and `promo` (LTO/Promo) — NOT rule-derivable.** Unlike a tax-free weekend or
Black Friday, a festival or an LTO doesn't happen on a predictable calendar formula — it only exists in
Meridian if/when someone tagged it historically via Calendar Manager into `org_events` (the same table
`expandRetailEvents()`'s output ultimately lands in, and what `orgEventsToDayMap()` turns into the
`mf_events` per-day map `retail-events.js` itself reads for float-date-mismatch checking). **Measurement
here means: pull whatever has ALREADY been tagged historically with `event_type`/`type ===
'event'`/`'promo'` per store from `org_events`, then run the same `measureEventLift`/`shrinkLifts`
pipeline against those actual tagged dates.** Coverage will be exactly as complete as what's already
been tagged — could be sparse for some stores, absent for others. **State that honestly in the
panel/script output** (the existing "No measured data for this event type yet" pattern in
`event-impact.js` ~line 119-120 already does this correctly for empty results — keep that
behavior for locs where nothing was ever tagged, don't paper over gaps).

**`weather` — the fuzziest one.** A "weather event day" isn't a discrete tagged occurrence the way a
festival is, but Meridian already has real, human-judged severe-weather tags in `org_events` under the
specific `EVENT_TYPES` weather subtypes (`winter_storm`, `snow`, `ice`, `tornado`, `t_storm`,
`sev_weather`, `high_winds`, `flood`, `hurricane`, plus the generic `weather`) — the Event Impact panel
only exposes one generic `'weather'` row (`event-impact.js` line 16), so decide (or ask) whether to
measure the generic bucket only for v1, or split by subtype later. **Do not invent a new
threshold-based weather-event rule (e.g. "rain > X inches = event day") without checking with the
owner first** — `retail-events.js`'s own standing principle applies here too: *"a wrong date is worse
than a missing event."* Measure against what's already been tagged by a human as weather-worthy in
`org_events`, the same approach as festival/promo, not an invented statistical rule.

## New: GC lift alongside sales lift (owner explicitly asked for both)

`measureEventLift` currently reads only `r.sales` from `salesRows`. Generalize it (or add a parallel
function reusing the same median-baseline/±28-day/exclusion logic) to also compute GC lift. **Source
question — check before picking one:** `labor_rows` (what `measure-retail-impact.mjs` already reads)
has **no GC/transaction-count column at all** (checked `supabase/schema.sql` ~line 606-617: `sales,
labor_pct, tpph, ot_hrs, ot_dollar` — no `gc`). Candidate GC sources that DO exist:
`qsr_sales_mix` (JSONB `metrics` column, one row per loc/dt, auto-pulled/backfilled via API — per
CLAUDE.md's data-sourcing rules this is the API-backed source, not the shallower emailed
`sales_ledger_daily` which CLAUDE.md documents as floored at 2026-07-01 and is described there as
"redundant" with the deeper `qsr_sales_mix`). **Confirm `qsr_sales_mix`'s actual measured backfill
depth for `gc` before relying on it** (per CLAUDE.md's "measure it, don't reason about it" standing
rule — query it, don't assume from the schema comment alone) — if it doesn't reach back far enough to
give the older event years (2022+) enough same-DOW baseline observations, say so plainly rather than
silently measuring GC lift only for recent years while sales lift covers the full history.

Once a GC source is confirmed, extend `event_impact`'s schema (new columns —
`gc_home_impact`/`gc_away_impact`/`measured_gc_home`/`measured_gc_away`/`n_gc_home`/`n_gc_away`, or
whatever shape mirrors the existing sales columns most directly) and wire GC lift display into
`EventImpactPanel` (`src/views/event-impact.js`) alongside the existing Home %/Away % sales columns —
follow the existing column layout/edit/reset pattern (~line 96-120), don't redesign it.

## Scope, in order

1. Run `scripts/measure-retail-impact.mjs --dry` against production; report what's already measured
   vs. not, for the 4 existing retail types. Do not re-measure what's already there.
2. Confirm the GC data source and its real backfill depth (measured, not assumed).
3. Extend `event_impact` schema for GC columns; extend `measureEventLift` (or add a GC-aware sibling)
   to compute GC lift using the identical median/±28-day/shrink methodology already proven for sales.
4. Build the `holiday` measurement (rule-derived from `HOLIDAY_MAP`, same pattern as retail types).
5. Build the `event`/`promo` measurement (from whatever's already tagged in `org_events`, honestly
   reporting sparse/absent coverage per store rather than implying completeness).
6. Scope (and likely hold for an owner decision, per the "don't invent a threshold rule" note above)
   the `weather` measurement — proposal: measure against existing human-tagged `org_events` weather
   subtypes first; do not build a new statistical weather-event rule without confirming with the owner.
7. Wire GC-lift display into `EventImpactPanel` for every type once measured.
8. Run all new/extended measurement scripts against production and confirm real rows land in
   `event_impact` (not just a `--dry` report).

## Verification bar

- Actually run each new/extended measurement script against production (not `--dry` only) and confirm
  `event_impact` gains real rows with plausible n counts and lift magnitudes for `holiday` at minimum
  (the rule-derivable, low-risk one) — reproduce a spot-check by hand for one store/holiday the way
  earlier dispatches this session independently re-derived a metric from raw data before trusting a
  script's output.
- Render the actual `EventImpactPanel`, switch through every type in the dropdown, and confirm each
  now shows real measured data (or an honest "no data yet" for `event`/`promo`/`weather` locs that
  were genuinely never tagged — that is a correct outcome, not a bug, for those specific locs).
- Confirm GC-lift columns render correctly and independently of sales-lift columns (a store can have
  one without the other if data coverage differs).
- `npm run build` clean, full test suite green, and confirm the Sports (Home/Away) category — already
  working — is completely unchanged by this work.

## Do NOT

- **Do not invent event dates for `event`/`promo`/`weather`** — only measure against what's already
  real in `org_events` (human-tagged) or `HOLIDAY_MAP` (verified calendar). Never synthesize dates the
  way `retail-events.js`'s own "OMITTED ON PURPOSE" section explicitly refuses to do for unverifiable
  windows.
- **Do not assume the 4 retail types are unmeasured (or already measured) without running the `--dry`
  check first** — verify, don't guess either direction.
- **Do not assume `labor_rows` has GC** — it doesn't (checked). Confirm the real source and its actual
  backfill depth before building on it.
- **Do not change `measureEventLift`'s existing sales-lift behavior** for Sports/retail types while
  adding GC — this is additive, not a rewrite of what's already proven and shipped.

## Resolution (2026-08-24)

Worked in an isolated git worktree (`.claude/worktrees/agent-dispatch108`, branch
`claude/dispatch-108-event-impact`) after finding the shared main checkout held another session's
uncommitted dispatch-107 WIP and its branch pointer was being switched by a third actor mid-task —
moved there to avoid stepping on concurrent work, per no explicit instruction otherwise. All
numbers below are measured against production Supabase with `SUPABASE_SERVICE_ROLE_KEY`.

**Step 1 — retail-type dry run, actual output (not assumed either direction):**
```
labor_rows: 42156 day-rows, 2022-01-01 → 2026-07-23
── tax_free ── district mean lift 2.69% across 26 stores (n=12 per store, mostly)
── black_friday ── district mean lift -3.14% across 26 stores (n=4)
── small_biz_sat ── district mean lift -0.76% across 26 stores (n=4)
── cyber_monday ── district mean lift 0.66% across 26 stores (n=4)
[--dry] would upsert 101 event_impact rows.
```
Cross-checked against the table directly: `event_impact` held **26 rows, all `event_type='sports'`**
before this dispatch — the 4 retail types had genuinely never been written, despite the script
existing and being proven. Not "already measured," not "needs a new script" — needed a real run,
which step 8 did.

**Step 2 — GC source confirmed and its real backfill depth measured (not the schema-comment
assumption):**
- `qsr_daily_activity_rollup`: **2024-01-01 → 2026-08-24, 24,982 rows**, 25 distinct stores on
  2024-01-05 growing to 27 by 2026-08-20.
- `qsr_sales_mix` (the dispatch's suggested candidate): same range, 24,962 rows. Its `metrics` JSONB
  has no field literally named `gc`; the closest is `gross_sales_qty`.
- `daily_glimpse_daily` (emailed stream, for comparison): confirmed the CLAUDE.md-documented
  2026-07-01 floor exactly — 2026-07-01 → 2026-08-23.
- Cross-validated the two candidates against each other on a real row (loc 3708, 2026-08-01):
  `qsr_daily_activity_rollup.transactions` = 979, `qsr_sales_mix.metrics.gross_sales_qty` = 979 —
  exact match. `product_sales` / `product_sales_amt` also matched exactly (11431.31).
- **Chose `qsr_daily_activity_rollup.transactions`**, not `qsr_sales_mix`: it's the app's
  already-established canonical `gc` source (`src/engine/metric-source.js`'s `gc` chain leads with
  `qsrActSummaryRows`, which reads this exact table) and carries an unambiguous `gc` semantic,
  whereas `qsr_sales_mix` is a channel-mix table whose closest field is named for something else.
  Both would answer the same number (proven above) — this just avoids introducing a second, oddly-
  named GC source into the codebase.
- **Real implication, stated plainly per the dispatch's instruction**: GC lift only reaches back to
  2024-01-01, sales lift to 2022-01-01 — about 2.5 fewer years of baseline for GC. A store can
  legitimately show sales lift with no GC lift for an event whose only historical occurrences predate
  2024; that is real data-coverage difference, not a bug, and `mergeSalesAndGcWrites` gates each
  metric's minimum-n independently rather than requiring both to qualify together.

**Step 3 — schema + engine, additive, sales-lift byte-identical:**
- `supabase/schema-event-impact-gc.sql` (new): 6 nullable columns
  (`gc_home_impact`/`gc_away_impact`/`measured_gc_home`/`measured_gc_away`/`n_gc_home`/`n_gc_away`),
  inherits the table's existing RLS.
- `measureEventLift` (`src/engine/retail-events.js`) gained `opts.valueKey` (default `'sales'`) —
  every existing call site is unchanged output-for-output; confirmed by re-running
  `measure-retail-impact.mjs --dry` after the change and diffing against the pre-change capture —
  identical district means, n counts, and shrunk % for all 4 retail types.
- New `scripts/lib/event-impact-write.mjs`: `loadGcRows` (paginated `qsr_daily_activity_rollup`
  read), `mergeSalesAndGcWrites` (per-metric independent minN gate), `upsertEventImpact` (the
  pre-migration fallback below).

**⚠️ Could not run the schema migration myself — genuine, measured blocker, not a shortcut taken.**
This session has no path to run DDL against production: no `DATABASE_URL`/direct Postgres
connection in the environment (checked `env`), and no `exec_sql`-style RPC exists on the project
(probed 5 candidate function names via `sb.rpc(...)`, all returned "Could not find the function…").
Confirmed the columns are genuinely absent by attempting a real upsert with `gc_home_impact` before
writing any fallback code: `PGRST204 — Could not find the 'gc_home_impact' column of 'event_impact'
in the schema cache`. This is the same situation every other `supabase/schema-*.sql` file in this
repo is already in (**"Run once in the Supabase SQL editor"**) — not new, just newly relevant.
**Owner action needed:** paste `supabase/schema-event-impact-gc.sql` into the Supabase SQL editor
once (idempotent, ~2 minutes), then re-run the same 3 scripts (`measure-retail-impact.mjs`,
`measure-holiday-impact.mjs`, `measure-tagged-event-impact.mjs`, no `--dry`) to land GC lift — no
code change needed. Until then, `upsertEventImpact()` catches the `PGRST204`, strips the `gc_*`
keys, and retries — so this did NOT block landing real sales-lift data today (see step 8 below).

**Step 4 — holiday, built and measured:** `scripts/measure-holiday-impact.mjs` (new). 15 open-holiday
labels from `HOLIDAY_MAP` (excludes Christmas Day [fullClosure], Christmas Eve/New Year's Eve/
Thanksgiving [partialClosure] — same exclusion test `measure-retail-impact.mjs` already used for its
baseline, reused here to build the event-day list instead of to exclude it), all pooled into ONE
`holiday` event_type matching the panel's single 🎉 row (Black Friday's dates land in both the
`holiday` bucket and its own dedicated `black_friday` retail type — different DB keys, no collision,
deliberate: one answers "how do holidays move this store," the other "how does Black Friday
specifically"). Dry run: 115 open-holiday dates in range (excluding 40 closure dates), 27/27 stores
gradable, district mean sales lift -2.10% / GC lift -8.88%.

**Manual spot-check, reproduced by hand against live production data (verification bar's explicit
"holiday at minimum" requirement):** MLK Day, 2025-01-20, store 3708. Queried `labor_rows` directly:
event-day sales $8851.09; baseline = median of the 8 other Mondays within ±28 days
(`[8247.48, 8529.62, 8833.87, 8986.14, 8994.96, 9153.61, 11172.29, 11654.96]`, excluding the closure
dates in that window) = $8990.55. Lift = 8851.09/8990.55 − 1 = **−1.55%**, one of the 70 observations
the script averaged into store 3708's reported holiday-bucket sales lift. Confirms the pipeline
executes the documented methodology against real data, not just against its own test fixtures.

Also spot-checked a GC observation the same way for step 2/3's new `valueKey:'gc'` path: store
10034, OK tax-free Friday 2024-08-02. `qsr_daily_activity_rollup` event-day transactions = 1210;
baseline = median of 8 other Fridays within ±28 days
(`[1134,1177,1184,1200,1209,1220,1237,1251]`) = 1204.5. Lift = 1210/1204.5 − 1 = **+0.46%**, one of
9 observations averaged into that store's tax-free GC lift.

**Step 5 — event/promo, measured against what's already tagged (not invented):**
`scripts/measure-tagged-event-impact.mjs` (new), reading `org_events` directly.
- `event` (Festival/Fair): **16 tagged rows, 11 distinct stores**, only 16 gradable (date_end ≤ today)
  — genuinely sparse, as the dispatch predicted. 9 of 11 stores clear `n≥2`; 2 (n=1 each) are
  correctly skipped by the minN gate and contribute no row.
- `promo` (LTO/Promo): **756 tagged rows across all 27 stores**, all gradable (2025-01-07 →
  2025-12-02) — solid coverage, not sparse. 26/27 stores measured (n≈28 each); one store's data
  didn't reach a gradable pair.

**Step 6 — weather, scoped and flagged, not built as a new rule:** same script pools the 10
`EVENT_TYPES` weather subtypes (`winter_storm`/`snow`/`ice`/`tornado`/`t_storm`/`sev_weather`/
`high_winds`/`flood`/`hurricane`/generic `weather`) into the panel's single 🌧 row — a *pooling*
choice on top of only-ever-tagged data, not an invented threshold rule.
**Measured: production currently has ZERO `org_events` rows of ANY weather subtype** (paginated the
full 2,708-row table and filtered — confirmed, not assumed). So this run correctly wrote **0**
weather rows and printed an honest "no tagged weather events found" rather than fabricating
anything. **This pooling choice (one bucket vs. per-subtype rows) is the piece flagged for owner
confirmation** the dispatch asked for — it does not block anything else in this dispatch, and
nothing here invents a rain-inches/wind-speed threshold.

**Step 7 — UI wiring:** `EventImpactPanel` (`src/views/event-impact.js`) gained GC Home %/GC Away %
(or GC % for non-sports types) columns beside the existing sales columns, same
input/measured/n/reset pattern; reset restores both sales and GC to their measured seed; a store can
carry one lift without the other and the row still renders correctly (no fabricated "gc null" text).
`loadEventImpact`/`saveEventImpact` (`src/lib/supabase.js`) extended additively —
`saveEventImpact` only sends `gc_*` keys when the payload actually carries a gc field, so an
ordinary sales-only edit never round-trips an explicit null over a real measured GC value it never
touched.

**Step 8 — actually run against production (not just `--dry`), confirmed real rows landed:**
```
event_impact total rows now: 189
{ sports: 26, tax_free: 26, black_friday: 25, small_biz_sat: 25,
  cyber_monday: 25, holiday: 27, event: 9, promo: 26 }
```
(up from 26, all `sports`, before this dispatch). Weather correctly contributed 0 — see step 6. GC
columns did not persist this run — see step 3's blocker; sales-lift-only rows landed via the
documented fallback, and GC will land with the same command once the owner applies the migration.
Spot-checked one written row directly (`loc=3708, event_type=holiday`): `home_impact=-6.08%`,
`measured_home=-6.65%`, `n_home=70` — matches the dry-run console output exactly, and the
`measured_home` figure is consistent with (not identical to, since it's an average of 70 days) the
hand-verified MLK-Day single-observation lift of -1.55% above.

**Verification bar — status:**
- ✅ Retail dry run read before assuming either direction; retail types actually run (not just dry).
- ✅ GC source confirmed + real depth measured (2024-01-01+), not assumed from schema comments.
- ✅ Holiday spot-checked by hand against live data (MLK Day 2025, store 3708) — plus a second
  hand-check on the new GC path (OK tax-free Friday 2024, store 10034).
- ✅ `EventImpactPanel` renders GC columns (verified via 4 new render tests exercising the actual
  component, not just the engine — matches this repo's "would this verification still pass if the
  change were reverted" standard) and independent sales/GC coverage renders correctly.
- ✅ Sports (Home/Away) confirmed unchanged: still exactly 26 rows post-dispatch, and no script this
  dispatch wrote ever targets `event_type='sports'` — logically guaranteed untouched, not just
  observed.
- ✅ `npm run build` clean; full suite **2310/2310** green (36 new/extended cases in
  `retail-events.test.js`, 4 new render tests in `event-impact-panel.test.js`).
- ⚠️ GC lift is measured, spot-checked, and wired everywhere it needs to be, but **not yet visible
  live in the panel** — it needs the one owner SQL-editor step named in step 3, after which the
  exact same 3 scripts (no code change) land it.

**Pending owner action:**
1. Run `supabase/schema-event-impact-gc.sql` in the Supabase SQL editor (idempotent, ~2 minutes).
2. Re-run `node scripts/measure-retail-impact.mjs && node scripts/measure-holiday-impact.mjs && node
   scripts/measure-tagged-event-impact.mjs` (no `--dry`) to land GC lift for all measured types.
3. Confirm (or redirect) the weather-pooling choice from step 6 — one 🌧 bucket across all 10 tagged
   subtypes vs. a per-subtype breakdown. Not blocking; either answer is a small follow-up once
   weather events actually get tagged (there are none in production today).
