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
