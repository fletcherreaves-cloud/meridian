---
name: dispatch-115
description: tolerance-status.js's baseFd check (Base Food % coaching/tolerance finding) compares totalBaseFood/prodSalesAmt (a broad theoretical-food-cost-shaped ratio, ~23-28% per real store magnitudes) against the official target tFOBBase (~3.8-4.1% per real store values in constants.js -- one of FOB's six small variance components, not a broad food-cost measure). These are not the same quantity, so this check fires a false CRITICAL finding on every single store into the Coaching pipeline dispatch #94 just built. Surfaced but explicitly left unfixed by dispatch #94 ("flagged prominently... not fixed here... outside this dispatch's scope").
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #115 — Fix the Base Food % tolerance check's metric-definition mismatch

## What's wrong, verified directly against current code

`tolerance-status.js`'s `TOL_SPEC` entry:
```js
baseFd: {man:{src:'fobRows',f:'baseFoodPct'}, fob:{num:'totalBaseFood'}},
```
compares an auto-computed `baseFoodPct = totalBaseFood / sales` (`src/views/analytics.js`,
`totalBaseFood` a raw dollar field on `qsr_fob` rows) against the official yearly-workbook target
`tFOBBase`. Checked real per-store target values in `constants.js`: `tFOBBase` sits at ~3.8–4.1%
across every store — one of FOB's six small controllable-variance components (comp waste, raw
waste, condiments, emp meals, stat variance, and base food, each individually a few tenths of a
percent to low single digits), matching the yearly workbook's own "Base Food %" column, a narrow
variance-tolerance figure.

`totalBaseFood` (the auto side) is a QSRSoft-reported dollar figure whose actual %-of-sales
magnitude, per this repo's own investigation, lands far closer to `tFOBTotal` (~26–29% per real
store values in `constants.js` — the broad P&L Total Food Cost figure) than to `tFOBBase`. Compared
against the narrow `tFOBBase` target, this reads as a large, uniform CRITICAL miss for every store,
every period — a "cry wolf" false-positive that undermines the coaching/tolerance system dispatch
#94 just shipped, exactly the kind of miscalibration CLAUDE.md's own tolerance/coaching standing
rules warn against.

**Already flagged, not fixed**: dispatch #94's own resolution surfaced this exact mismatch and
explicitly deferred it ("flagged prominently... not fixed here... outside this dispatch's scope") —
this dispatch is that deferred fix.

## Scope

1. **Trace `totalBaseFood`'s real definition to its source** — the QSRSoft FOB report field it's
   parsed from (check `src/parsers/index.js`'s FOB parser and/or the auto-pull script that
   populates `qsr_fob`), and confirm what it actually represents (a broad theoretical/base food
   cost basis, vs. narrower "Base Food %" variance component the target field names). Do this the
   same way dispatch #102 traced FOB Analysis's inflation bug to its root — by reading the actual
   field mapping, not by pattern-matching the name.
2. **Reconcile which target field `totalBaseFood`/`baseFoodPct` should actually be compared
   against** — the magnitude evidence points toward `tFOBTotal` (or possibly `tPaperCost`/some
   other broader target, if the trace in step 1 reveals a different real match) rather than
   `tFOBBase`, but confirm via the actual field semantics, not just magnitude-matching (magnitude
   is a strong hint, not proof — two fields can coincidentally be similar size and still measure
   different things).
3. **Fix the `TOL_SPEC` comparison pair** in `tolerance-status.js` once the correct target is
   identified — either repoint `baseFd`'s `offKey` to the right target field, or, if
   `totalBaseFood` genuinely has no matching target anywhere in the current target schema, consider
   whether this tolerance check should be removed/disabled rather than compared against a
   definitionally wrong number (do not leave a comparison that's known-wrong just because SOME
   comparison target exists).
4. Check whether this same `totalBaseFood`/`tFOBBase` mismatch appears anywhere else in the
   codebase beyond `tolerance-status.js` (e.g., `analytics.js`'s own FOB_COMP-driven display,
   `at-a-glance.js`) — CLAUDE.md's own dev rules flag that a wrong field-mapping tends to recur
   across independently-written consumers of the same source data.

## Verification bar

- Reproduce the false-CRITICAL finding first, against real data, before changing anything (this
  repo's "measure it, don't reason about it" standing rule) — confirm `baseFd` really does fire
  CRITICAL uniformly across stores today.
- After the fix, confirm the same stores no longer show a uniform false CRITICAL, and that a
  genuinely correct comparison produces plausible, varied results (not just "the number changed").
- Render the actual Coaching findings pipeline (dispatch #94's consumer), not just the tolerance
  function in isolation, and confirm the fix is visible end-to-end.
- Full suite green, `npm run build` clean.

## Do NOT

- **Do not guess the correct target field from magnitude alone** — confirm via the actual parser/
  field-semantics trace (step 1) before repointing the comparison.
- **Do not touch any other `TOL_SPEC` entry** — this dispatch is scoped to `baseFd` only.
- **Do not re-litigate dispatch #94's own scope** — that dispatch is done; this is its explicitly
  deferred follow-up, not a re-review of its other findings.

## Resolution (2026-08-25)

**Fixed, verified live, and reproduced/un-reproduced against the real Coaching pipeline.** The
fix disables the comparison rather than repointing it — the magnitude-favored candidate
(`tFOBTotal`) turned out, on direct measurement, to be a different quantity too.

### Step 1 — traced `totalBaseFood` to its source, then measured its real relationship live

`scripts/qsrsoft-pull.mjs`'s `SELECT_COLS` pulls `totalBaseFood` from the same QSRSoft endpoint
(`/reporting/v2/food/actual-food-over-base`, `catalogType:'actualFoodOverBase'`) as the six FOB
variance fields (`compWasteAmt`/`rawWasteAmt`/`condimentsAmt`/`empMgrMealsAmt`/`statVarianceAmt`/
`unexplainedAmt`) and the six `pnlFoodCost*` fields — all one report, matching the owner's own
export filename in dispatch #102 (`Food_Over_Base_...xlsx`). So `totalBaseFood` is QSRSoft's own
"Base Food" line item on that report, a real reported figure — not a derived/guessed value.

Queried live `qsr_fob` directly (`SUPABASE_SERVICE_ROLE_KEY`, `content-range: 0-59/24561`, real
rows — not `*/0`) and computed, for the latest MTD row per store, August 2026, all 27 stores:

| loc | sales | totalBaseFood/sales | 6-component variance/sales | pnl Total Food Cost % | base+variance |
|---|---:|---:|---:|---:|---:|
| 3708 | $246,255 | 23.36% | 4.79% | 28.56% | 28.14% |
| 5985 | $478,037 | 23.01% | 3.90% | 27.46% | 26.91% |
| 38609 | $297,978 | 21.73% | 3.20% | 25.46% | 24.93% |
| 35064 | $156,599 | 24.07% | 6.69% | 31.32% | 30.77% |
| *(all 27 stores measured; pattern uniform — full run in the reproduction script below)* |||||

`totalBaseFood/sales` + the six-component variance sum reconstructs `pnlFoodPct` (the P&L-computed
Total Food Cost %) to within ~0.3–0.6pp on **every** store. This is the live-data confirmation
(not a name-pattern guess) that `totalBaseFood` is the **theoretical/recipe-costed base food cost**
— the portion of total food cost *before* waste/comp/condiment/meal/stat variance is added — at a
real magnitude of ~21–24% of sales. `at-a-glance.js`'s own pre-existing comment on `fobAuto`
independently corroborates this exact relationship for store 5985 (documented "base food 22.7%,
P&L food 27.3% — confirmed against the report").

### Step 2 — reconciled against the target schema, and ruled out `tFOBTotal` by measurement, not guess

Read `constants.js`'s per-store target block. For nearly every store, `tFOBBase` sits within a few
tenths of a percent of `tFOBTarget` (the sum-of-six-variance-components target) — e.g. store 5985:
`tFOBBase:0.038` vs `tFOBTarget:0.038` (identical); store 3708: `tFOBBase:0.04` vs
`tFOBTarget:0.0385`. Both are narrow, single-digit-percent FOB-variance-scale targets. Cross-checked
against `src/parsers/index.js`: the yearly-workbook `fobBase` target column and the manual
Operations-Report FOB-sheet's `baseFoodPct` column (`fc('Base Food %', ...)`) are **the same
"Base Food %" concept from the same workbook family** — a narrow variance-tolerance figure, not a
broad theoretical-cost basis. So `TOL_SPEC.baseFd`'s **manual** side
(`man:{src:'fobRows',f:'baseFoodPct'}` vs `tFOBBase`) is a **correct** pairing — the bug is only in
the cloud fallback (`fob:{num:'totalBaseFood'}`), which measures a fundamentally different,
~5x-larger quantity under the same label.

The dispatch's own magnitude hint pointed at `tFOBTotal` (~26–29%) as the likely repoint target.
Measured directly instead of assumed: `tFOBTotal` is the **P&L actual** total (computed from
`pnlFoodCost*` inventory movements), not the **theoretical base**. Per the reconstruction above,
`totalBaseFood/sales` is consistently **~4–5pp below** `tFOBTotal`'s target value, on every single
store — e.g. store 3708: base 23.36% vs `tFOBTotal` target 27.95% (diff 4.59pp); store 6178: base
21.80% vs target 26.21% (diff 4.41pp); store 38609: base 21.73% vs target 26.02% (diff 4.29pp).
`baseFd`'s declared `tol` is 0.5% (tol*2 = 1%) — a systematic ~4–5pp gap on every store would still
fire **red on every store**, just a smaller-magnitude version of the same false-uniform-CRITICAL
failure, not a genuinely varied signal. Repointing to `tFOBTotal` would not have fixed the bug.

**No field in `DEFAULT_TARGETS` represents "theoretical base food cost as % of sales"** at the
~21–24% scale `totalBaseFood` actually sits at. `tPaperCost` (~3–4%) and `tFOBBonusBase`
(~3.55–3.85%) are the only other candidates near that name family, and both are narrow
variance/bonus-threshold figures like `tFOBBase`, not broad cost-basis figures.

### Step 3 — the fix: `offKey:null`, this file's own established convention

Per the dispatch's own fallback instruction ("if `totalBaseFood` genuinely has no matching target
… consider whether this check should be disabled"), and since step 2 measured that no valid target
exists (not merely assumed it), `TOL_METRICS`'s `baseFd` entry now has `offKey:null` instead of
`offKey:'tFOBBase'`. This is not a new mechanism — 8 of the 24 `TOL_METRICS` already use
`offKey:null` for "no valid official target" (`actvsNd`, `disc`, `cashOS`, `tRedB`, `tRedA`,
`discP`, `gc`, `avgChk`, `sales`), and the module's own header comment documents the resulting
behavior: the metric still renders its real current value in `UnifiedTargetsPanel`'s KPI table
(confirmed: `store-dash.js`'s `offVal = m.offKey ? officialT[m.offKey] : null`, unchanged), it just
never produces a green/yellow/red status. `TOL_SPEC.baseFd`'s value-sourcing entry (manual
`fobRows.baseFoodPct` / cloud `totalBaseFood`) is untouched — that mapping is correct and still
needed to populate the Current column.

### Verification — reproduced the false-CRITICAL live, then confirmed it's gone, end-to-end

Reproduced against the **real, unmodified** `tolerance-status.js` module and **real live
`qsr_fob`** data (no manual `fobRows`, matching the district reality most stores use — falls to
the cloud `totalBaseFood` path): **27/27 stores red**, matching dispatch #94's original 5.139.js
finding exactly (0 green / 0 yellow / 27 red).

Post-fix, the identical script against the identical live data: **0/0 — `baseFd` never produces a
status entry for any store.**

Rendered the actual Coaching pipeline consumer (`buildStore` → `buildBrief`, dispatch #94 Phase
3's wiring, not `tolStatusesForStore` in isolation) with real live-shaped `qsrFobRows`. Pre-fix:
produced `{rule:'tolBaseFd', t:'crit', m:'CRITICAL — BASE FOOD %: 23.30% vs 4.00% target
(+19.30%, tolerance 0.50%)...'}`. Post-fix: no `tolBaseFd` finding at all.

Per the "would this verification still pass if reverted" rule: `git stash`-reverted
`tolerance-status.js` alone (test file untouched) and re-ran the new suite
(`src/__tests__/dispatch-115-basefd-mismatch.test.js`) — all 4 assertions failed, reproducing the
exact pre-fix finding text above. Restored the fix; all 4 pass again. The test therefore fails
against a revert of the actual fix, not just against a hand-crafted broken input.

### Step 4 — checked for the same mismatch elsewhere; found it in 2 more places, fixed neither

- **`src/views/analytics.js`, `FOB_COMP`'s `baseFoodPct` row (`tgt:'tFOBBase'`)** — feeds
  `computeFOBMetrics`, which powers `FOBAnalysisPanel`'s "Base Food" KPI card
  (`bfood.diffPct = bfood.actual - bfood.target`) **and** the "🎯 Root-Cause Priority Matrix" dollar-
  impact ranking. This is a **live, user-visible instance of the identical bug** — the KPI card
  would show "▲ +19.xx% vs target" in red for every store, and the priority matrix's own caption
  ("Excludes Base Food (largely outside store control)") is **already wrong on the current code**:
  nothing in the `FOB_COMP.filter(...)` at that call site actually excludes `baseFoodPct` by key or
  by an `actionable:false` flag, so it would rank near the top of every district's "coaching
  opportunities" list at a fake multi-thousand-dollar amount, contradicting its own caption.
  **Not fixed here** — `computeFOBMetrics` has no `offKey:null`-equivalent convention
  (`allTargets[loc][c.tgt]||0` silently coerces a missing/null target to 0, which would make the
  priority-matrix bug *worse*, not better, since "target=0" reads as "any positive actual is over
  target"). A correct fix needs its own mechanism (e.g. wiring `actionable:false` through to both
  the KPI card's color logic and the priority-matrix filter, not just one of the two) — real
  follow-on work, not a drive-by edit riding on this dispatch, matching the same judgment dispatch
  #94 made in deferring this exact issue in the first place. Flagging for a follow-up dispatch.
- **`src/views/at-a-glance.js`, `fobSec.tgts.baseFoodPct` (`wTgt('tFOBBase')`)** — computed inside
  the FOB section's `tgts` object, but **never rendered**: the FOB tile's "Base Food %" stat
  (around the `fobSec.baseFoodPct` display) shows only the value, prior-month, and market badges —
  no `tgts.baseFoodPct` reference anywhere in its JSX (confirmed by grep: only `tgts.fobPct` and
  the 6-component breakdown list, which excludes `baseFoodPct`, actually consume `fobSec.tgts`).
  Dead code carrying the same wrong pairing, but currently invisible to a user. Noted for the same
  follow-up.

### Test / build results

- New test `src/__tests__/dispatch-115-basefd-mismatch.test.js`: 4/4 passing, and hand-confirmed to
  fail against a revert of the fix (see above).
- `npm test`: **230/230 files, 2380/2380 tests passing** (0 regressions).
- `npm run build`: clean. `tolerance-status.js` is a lazy chunk (not in the eager entry bundle) —
  eager-payload budget check: **528.03 KB gzip** of the 850 KB budget (321.97 KB headroom),
  unaffected by this change (comment + one field value only).

**Version:** v5.155 (`src/app/changelog/5.155.js`).
