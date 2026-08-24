---
name: dispatch-104
description: Top/Bottom Performers (src/views/top-bottom-performers.js) has two owner asks -- consolidate the location pill row and convert the 16-metric picker row into a dropdown for a cleaner look, and add FOB as a new rankable category. The location selector is ALREADY wired to the shared components/PanelControls.js LocationSelector (the documented standard, same component dispatch #100 just used for the Security panel's Store pills) -- it's not missing a pattern, it renders all 33+ pills (All/State/Patch/Store) flat and simultaneously, which may be the actual "not clean" complaint rather than a wrong component. FOB isn't currently rankable at all -- only its sub-components (Comp Waste/Raw Waste/Stat Variance) are -- and any new FOB metric must be built on dispatch #102's FIXED aggregation, not the ~24x-inflated one that dispatch #102 is fixing in a different panel off the same qsr_fob table.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #104 — Top/Bottom Performers: cleaner selectors, add FOB as a rankable category

**Status:** ready for most of the scope; one part (the location selector's exact target shape)
needs a quick owner confirmation before implementation — see "Open question" below. Independent of
every other in-flight dispatch — different file, safe to run in parallel.

---

## What the owner asked

1. *"Put all the location pills into our standard selector"*
2. *"Also for top/bottom, add FOB as a category and place all categories in a dropdown (cleaner
   look)"*

## Part 1 — location selector: already the standard component, but renders everything flat at once

Measured, not assumed: `top-bottom-performers.js` (~line 91) already renders
`h(LocationSelector, {stores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: scope,
onChange: setScope})` — the exact shared component from `src/components/PanelControls.js`, the same
one dispatch #100 just adopted for the Security panel. This is **not a missing-standard bug** — it's
already the documented pattern (CLAUDE.md's UI Conventions: *"Location selectors: pill-style, All →
State → Org/Patch → Store hierarchy on all filters"*).

**What's actually happening, and likely the real complaint:** `LocationSelector`'s default
`mode:'full'` (`PanelControls.js` ~line 168-179) renders **every level simultaneously** — the `All`
pill, every State pill, every Patch/DO pill, AND every one of the 27 Store pills, all in one flat
row/wrap, all the time. That's the wall of 30+ pills visible in the owner's screenshot (FL/OK, four
DO names, then all 27 stores). The *component* matches the standard; the *density* of showing every
level at once, unconditionally, is what may actually read as "not our standard selector" even though
it technically is.

### Open question — confirm before implementing

Two different fixes are possible depending on what the owner actually wants:
- **(a) Keep the pill-style standard, but make it hierarchical/progressive** — show only `All` +
  States by default; clicking a State reveals its Patches; clicking a Patch reveals its Stores —
  instead of all 33+ pills at once. This stays inside the documented pill-based convention.
- **(b) Something closer to a dropdown/combobox** for location too, mirroring the metric-picker
  ask in Part 2. This would be a real deviation from CLAUDE.md's documented pill-style standard,
  not an application of it — worth flagging explicitly rather than silently doing it.

**Do not guess between these.** If the owner's phrasing ("into our standard selector") most
naturally reads as (a) once you show them both options, proceed with (a) — it satisfies "cleaner"
without contradicting the documented convention, and `LocationSelector` may need a new `mode` (e.g.
`'progressive'`) alongside its existing `'full'`/`'store'` modes rather than a rewrite. If there's
real ambiguity, ask.

## Part 2 — metric-category picker: flat pill row → dropdown

Unambiguous, no standing-convention conflict (metric pickers aren't covered by the pill-style
location standard). `top-bottom-performers.js` (~line 86) renders `PERFORMER_METRICS.map(m =>
btn(...))` — 16 metrics as a flat, wrapped pill row (two full rows in the owner's screenshot). Change
this to a single `<select>` (or equivalent dropdown component already used elsewhere in this repo —
check for a shared pattern before building a bespoke one) bound to `metricKey`. Keep behavior
otherwise identical — same metrics, same selection semantics, just presented as a dropdown instead
of a pill wall.

## Part 3 — add FOB as a rankable category

**Not currently possible without new plumbing.** `PERFORMER_METRICS`
(`src/engine/top-bottom-performers.js`, ~line 52-69) lists 16 metrics, including individual FOB
*components* (`compWaste`, `rawWaste`, `statVar`) — but no single overall "FOB %" entry.
`src/engine/metric-source.js`'s `METRIC_SOURCES` has no `fobPct`-equivalent key at all (grepped,
confirmed absent) — `rankableMetricKeys()`/`metricDirection()` can't resolve a metric that was never
declared, and `PERFORMER_METRICS`' own guard (this file's header comment) means a new entry here
must have a real, resolved direction backing it, not a hand-typed one.

To add it:
1. Add a new `METRIC_SOURCES` entry (`metric-source.js`) for overall FOB % — sum of the six
   controllable components ÷ sales (`comp+raw+cond+emp+statv+unex)/sales`, the same definition
   `computeFOBMetrics`/`cloudFobRows` in `src/views/analytics.js` and `fobSnapshotByStore`
   (`eom-inventory.js`) already use — with `direction:'lower'` (FOB is a cost metric, lower is
   better, matching the sibling component metrics already in this list).
2. **This MUST be built on dispatch #102's fixed aggregation, not the currently-buggy one.**
   Dispatch #102 (read that dispatch in full first) found `qsr_fob` rows are daily MTD-snapshot
   duplicates — summing across a month's rows inflates every dollar figure ~24×. `fobSnapshotByStore`
   (`eom-inventory.js`) already does the correct latest-snapshot-per-`(loc,month)` collapse; whatever
   `computeFOBMetrics` in `analytics.js` is fixed to do (per dispatch #102) is the same pattern this
   new metric-source entry needs. **If dispatch #102 hasn't merged yet when this ships, don't wire a
   new FOB rankable metric on top of the still-inflated numbers — either wait, or build it directly
   on `fobSnapshotByStore`'s already-correct per-store-per-month snapshot instead of re-deriving a
   possibly-still-broken aggregation.**
3. Add the new key to `PERFORMER_METRICS` with a label (`'FOB %'`) and a percent formatter matching
   the sibling entries (`v => (v*100).toFixed(2)+'%'`).
4. Confirm `metricSumRatio`/`rollupCapableMetricKeys` handle this new ratio metric the same
   Σnumerator/Σdenominator way the existing ratio metrics do (per this file's own header comment on
   why that matters) — don't let it default to a mean-of-daily-ratios average-of-averages.

## Verification bar

- Render the actual `TopBottomPerformersPanel` consumer (not isolated engine functions) and confirm:
  the metric dropdown selects correctly and behavior matches the old pill row exactly for every
  existing metric; FOB % appears as a selectable category and produces a real, correctly-ranked
  list (spot-check 2-3 stores' FOB % against a live `qsr_fob` pull using dispatch #102's corrected
  basis, not the raw summed one).
- Whatever the location-selector fix ends up being (per the open question), confirm `scope.level`
  behavior for `all`/`state`/`patch`/`store` is unchanged in substance — this is a presentation
  change, not a filtering-logic change.
- Per this repo's "would this verification still pass if reverted" rule.

## Do NOT

- **Do not silently convert the location selector to a dropdown without confirming that's actually
  wanted** — it would contradict CLAUDE.md's documented pill-style standard; get a real answer
  first, per the open question above.
- **Do not add the new FOB rankable metric on top of the still-buggy 24x-inflated `qsr_fob`
  aggregation.** Build on dispatch #102's fix or on `fobSnapshotByStore`'s already-correct pattern.
- **Do not touch `src/views/analytics.js`'s `computeFOBMetrics`** — that's dispatch #102's scope,
  not this one's. This dispatch only adds a new metric-source entry and a `PERFORMER_METRICS` row.
