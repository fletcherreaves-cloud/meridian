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

## Resolution (2026-08-24)

Implemented in full. `computeFOBMetrics` (`analytics.js`) was **not touched**, per the "Do NOT" —
confirmed via `git diff --stat` on the PR branch showing zero lines in `analytics.js`.

**Part 1 — location selector.** No live owner reachable in this session, so the dispatch's own
fallback was taken: `LocationSelector` (`components/PanelControls.js`) gained a **`mode:'progressive'`**
alongside its existing `'full'`/`'store'` — same component, same pill styling, same
`{level,id}` value shape and `locationSelectorLocs()` resolution (untouched), just revealed one
tier at a time instead of all 30+ pills flat: `All` + States always show; picking a State reveals
*that state's* Patches (via `invOrgCoords[loc].state`, filtered from `tree.patches`); picking a
Patch reveals *that patch's* Stores. The prior selection stays visibly "open" (a breadcrumb) when
the current value is a Patch or Store, not just an exact `level` match, so navigating back up
doesn't collapse what's already chosen. A State with no Patch data at all (a gap in
`invOrgCoords`, not the common case) falls straight through to its Stores rather than becoming an
unreachable tier. `top-bottom-performers.js` passes `mode:'progressive'`; every other
`LocationSelector` consumer is unaffected (default stays `'full'`).
**This was NOT a live-confirmed answer** — say so if the owner's intent turns out to be closer to
option (b) (an actual dropdown), and the fallback should be revisited.

**Part 2 — metric dropdown.** The 16-pill `PERFORMER_METRICS` row became a single `<select>` bound
to `metricKey`, `onChange` calling the same `setMetricKey` the old pill `onClick`s did. Identical
metric set, identical selection semantics — pinned by updating the two existing pill-click tests
in `top-bottom-performers-panel.test.js` to drive the `<select>` instead (`select.value = …` +
dispatch `change`) and confirming they still pass (ranking still flips end-for-end on Labor %, the
Σ/Σ vs mean-of-daily disclaimer still switches correctly).

**Part 3 — FOB % as a rankable category.** Built on dispatch #102's now-merged fix (confirmed via
`computeFOBMetrics`'s own "Dispatch #102" comment on `main`), not the inflated aggregation this
dispatch warned against:
- `metric-source.js` gained the 3 missing FOB dollar legs (`condimentsAmt`, `empMgrMealsAmt`,
  `unexplainedAmt` — mirroring the existing `compWasteAmt`/`rawWasteAmt`/`statVarianceAmt`
  pattern), a derive-only `fobTotalAmt` (the 6-way sum, mirroring the existing derive-only
  `spph`/`avgRate` shape — no `srcs`, so it resolves only through `metricSeries`/`metricAvg`/
  `metricSumRatio`, never `metricDaily`, same as those 6 pre-existing derive-only metrics), and
  `fobPct` (`fobTotalAmt ÷ prodSalesAmt`, `kind:'ratio'`, `direction:'lower'`).
- `PERFORMER_METRICS` (`engine/top-bottom-performers.js`) got a `fobPct` row (`'FOB %'`, same
  `(v*100).toFixed(2)+'%'` formatter as its sibling waste/variance rows).
- **Confirmed NOT the #102 inflation trap.** Unlike a raw dollar sum across snapshot-duplicated
  days, `fobPct`'s `metricSumRatio` sums two legs that are BOTH the same MTD-cumulative-snapshot
  basis (`fobTotalAmt` and `prodSalesAmt`), so the inflation in numerator and denominator cancels
  to first order — a ratio-of-sums, not a sum-of-a-single-leg. Verified two ways: (1) a unit test
  (`metric-sum-ratio.test.js`) modeling 3 identical-snapshot days lands the Σ/Σ result within
  1e-6 of the single day's own ratio, not ~3x it; (2) a live spot-check against real `qsr_fob`
  data (below) reproduces the true latest-snapshot figure exactly.

**Live verification (service-role `Authorization: Bearer` on `qsr_fob`, confirmed live —
`content-range: 0-4/24534` on an unfiltered probe, so this is a real read, not `[]` misread as
success).** `qsr_fob.loc` is zero-padded to 7 chars in the table itself (e.g. `0003708`) — the
per-loc query needed padding; `metric-source.js`'s existing `_PADDED_LOC_SOURCES` already handles
this at the resolver's indexing boundary, so no chain code needed changing for it. Spot-checked
3 real stores' July 2026 (a fully-closed month) FOB % — the SHIPPED `metricSumRatio(ds, loc,
range, 'fobPct')` call, not a reimplementation — against the true latest-snapshot-in-window figure
(dispatch #102's own basis, computed by hand from the same fetched rows):

| store | latest-snapshot (Σ#102 basis) | fobPct via metricSumRatio (shipped) | fobPct via metricAvg (mean-of-daily) |
|---|---|---|---|
| 3708 (OK) | 4.55% | **4.55%** (n=31) | 4.55% |
| 6178 (FL) | 3.49% | **3.49%** (n=31) | 3.49% |
| 5183 (OK) | 4.50% | **4.50%** (n=31) | 4.50% |

Exact match to 2 decimals on all 3 — the Σ/Σ rollup this panel actually uses for `fobPct`
reproduces the corrected basis, not a divergent approximation.

**Verification bar, item by item:**
- Rendered the actual `TopBottomPerformers` consumer (not `rankPerformers()` in isolation) —
  `top-bottom-performers-panel.test.js`, new `describe` blocks for FOB % and the progressive
  selector, both driving the real component through React's DOM.
- Metric dropdown behaves identically to the old pill row for every existing metric — the two
  pre-existing pill-click tests updated to drive the `<select>`, unchanged assertions, still pass.
- FOB % selectable, produces a real correctly-ranked list — new test ranks a synthetic
  2.15%-vs-6.45% fixture correctly (lower/better first) and asserts the exact rendered percentages
  come from the Σ/Σ basis, not mean-of-daily.
- `metricSumRatio`/`rollupCapableMetricKeys` treat `fobPct` the same Σ/Σ way as the existing ratio
  metrics — `rollupCapableMetricKeys()` now includes it (guard test updated), and a dedicated
  `metricSumRatio -- fobPct` describe block in `metric-sum-ratio.test.js` proves the 6-way-sum
  numerator sums correctly, diverges from mean-of-daily on an uneven-volume fixture (the same
  pattern that motivated dispatch #77), and does NOT reproduce the #102 inflation bug.
- `scope.level` filtering for all/state/patch/store unchanged in substance — `locationSelectorLocs()`
  itself was not touched; new tests confirm selecting a Store through the progressive UI still
  narrows the ranking to exactly that one loc, same as `'full'` mode always did.

**Numbers:** full suite 2311/2311 (0 regressions). `npm run build` clean. Entry chunk gzip
519.95 KB → 520.05 KB (+0.10 KB, `top-bottom-performers.js` is a `lazyPanel()`-loaded chunk, so
almost none of this lands in the eager entry bundle); eager total 521.81 KB → 521.91 KB gzip
(budget 850 KB, headroom 328.09 KB).

**Left alone, deliberately:** `metricDaily`'s lack of derive support for `srcs`-less specs is a
pre-existing gap shared by 6 other derive-only metrics (`spph`, `avgRate`, `oppCostDollar`,
`oppCostPct`, `actVsSched`, `actVsSchedOpp`) — none of them, nor the new `fobTotalAmt`, are ever
called through `metricDaily` today, only `metricSeries`/`metricAvg`/`metricSumRatio`. Out of scope
here; flagged rather than silently fixed or silently left undocumented.
