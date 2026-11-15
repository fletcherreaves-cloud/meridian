---
name: finding-targets-vs-actual-report-2026-11-15
description: "New report, v5.792 — Targets vs Actual (owner request: Monthly/Daily tabs, target vs actual, per store, 7/14/21/28D+MTD date picker, workbook-style look). Monthly tab's 16 metrics map 1:1 onto the real monthly_targets table; Daily tab covers DEFAULT_TARGETS' daily operational fields with no monthly override. Built on ReportShell; every actual value reuses fob-reference.js's FOB-leg delta math (new resolveMetricForRange export) and metric-source.js's metricAvg/metricSumRatio, never re-derived."
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# Targets vs Actual report (2026-11-15)

## Ask

"can you create a new report that focuses solely on the monthly targets and daily targets
(separate tabs) that shows clearly what the current target is vs the actual results. For the
date picker, seed it with 7,14,21 & 28 day options plus MTD please. Bonus if you can mimic the
look from the monthly projections workbook sent out to each store."

## What shipped

- `src/engine/targets-vs-actual.js` — pure engine. `MONTHLY_TARGET_METRICS` (16 entries: Sales $,
  Crew Labor %, Labor % Overall, TPPH, and the 11 FOB-leg metrics + Op Supply $ — the same set the
  real `monthly_targets` table / `MonthlyTargetManager` edit) and `DAILY_TARGET_METRICS` (10
  entries: OEPE, KVS Time, Parked %, Average Check, T-Red A/B %, POS Over %, Cash O/S %, Drawer
  Opens, Promo % — `DEFAULT_TARGETS` fields with no monthly override). `effectiveMonthlyTarget()`
  reads the cloud `monthly_targets` override for the range's month, DEFAULT_TARGETS otherwise —
  deliberately does NOT read the device-local `loadTargetsV2()` draft (CLAUDE.md's cloud-first
  rule: a report reads the source of truth, not the live-editing surface). `targetStatus()` grades
  ok/watch/miss, with a near-zero-target absolute-threshold branch (e.g. `tUnex`'s 0.0 target)
  instead of a relative-% one that would blow up.
- `src/engine/fob-reference.js` — added `resolveMetricForRange(ds, loc, metricKey, range)`, an
  arbitrary-`[s,e]`-window sibling to that file's existing fixed MTD/L3M/L6W/LM windows. Reuses the
  SAME FOB-leg delta-reconstruction (`fobDailyDeltas`/`_resolveWindow`) — this file's own header
  explains why `qsr_fob`'s cumulative MTD snapshot can never be averaged directly; a second,
  re-derived implementation would be exactly the kind of drift CLAUDE.md's "check whether a helper
  exists before writing one" rule exists to prevent.
- `src/components/PanelControls.js` — added `MTD_PRESET` (`{id:'mtd', label:'MTD', mtd:true}`) and
  taught `resolveDatePreset()` to resolve it to `[1st of the month, lastClosedBusinessDay()]`.
  Additive only — `DATE_RANGE_PRESETS` itself is untouched, so every existing report's own preset
  list is unaffected; a report opts in by including `MTD_PRESET` in its own `datePresets` array.
- `src/views/targets-vs-actual-report.js` — the panel. Built on `ReportShell` exactly like
  `fob-reference-table.js`, so it gets the criteria bar (date range + LocationSelector + Run) and
  Print/CSV/Excel/PDF export for free. Two pill tabs (Monthly/Daily, both computed in one Run so
  switching tabs needs no re-fetch). Rendered **per store** — a card per location with a
  McDonald's-red (`#DA291C`) accent left-border + bold store name, echoing the owner's own printed
  monthly-projections workbook (the "bonus" ask) — under a plain, theme-token-based table
  (`var(--surf)`/`var(--bdr)`/`var(--text)`), so the brand accent is the one deliberate literal-hex
  touch and everything else stays correct in both light (shipped default) and dark mode.
- `src/app/panel-registry.js` / `src/app/App.js` — registered `targets-vs-actual`,
  `perm:'analytics.store'`, `kind:'nav'`, `section:'reports'`, `route:true` — the exact same
  treatment `fob-reference-table` already has, since this is a direct, scoped owner request, not
  an experiment.

## Verified, not just unit-tested

Ran the app locally (`npm run dev`) and drove it with Playwright: nav search finds "Targets vs
Actual" under Reports, the date-range `<select>` options are exactly `7D / 14D / 21D / 28D / MTD /
Custom…`, Run Report renders a red-accented card per store with real `DEFAULT_TARGETS` numbers in
the Target column (Sales $111,513, Crew Labor 21.00%, OEPE 140s, etc.), and switching to the Daily
tab swaps in the daily metric set. Actual/Variance/Status read "—" in this sandboxed dev
environment because it has no live QSRSoft/Supabase data to query — expected, not a bug (confirmed
against the "0 stores · no data" freshness indicator the app itself shows).

17 new tests (`src/__tests__/dispatch-targets-vs-actual-report-2026-11-15.test.js`): the MTD
preset's date math (including the ABC 4am-cutover "last CLOSED business day" edge — noon on the
15th resolves to the 14th, not the 15th), `targetStatus()`'s ok/watch/miss/near-zero-target
branches, `effectiveMonthlyTarget()`'s override-vs-fallback merge, `computeTargetsVsActual()`
against the exact fixture `fob-reference-table-panel.test.js` already proves resolves the FOB-leg
math correctly (same 30-day September data, store 3708), and full panel renders (pre-run empty
state, a real run, tab switching, CSV export).

## What's deliberately NOT in this report

Two monthly_targets fields (`tBonusLabor` — bonus-qualifying crew %, `tFOBBonusBase`) have no
verified actual-value source anywhere in this codebase — rather than fabricate one, they're left
out of the Monthly tab. If a real actual-source for either is found later, adding it is a one-line
addition to `MONTHLY_TARGET_METRICS`.

## Follow-up (2026-11-15, same day): "wire in the Food cost items on monthly" + a Yearly tab

Owner: *"Can we wire in the Food cost items on monthly and add a yearly targets as well for the
yearly workbook uploaded."*

**Food cost items (Monthly tab):** re-checked every `DEFAULT_TARGETS` field against
`MONTHLY_TARGET_METRICS` — the only Food-Cost-group field not already wired was `tFOBBonusBase`
(the one left out above). Read `src/parsers/index.js` (`fobBonusBase` parses the workbook's
"Bonus Food Over Base Target" column) and `src/views/analytics.js`'s own Monthly Projections
workbook grid (`PROJ_FIELDS`), which places `tFOBBonusBase` immediately after `tFOBTotal` in the
same Food Cost group with no actual column of its own. Conclusion: it's not a separate measured
metric — it's a second, stricter target line graded against the exact same real Total Food Cost %
actual `tFOBTotal` already uses. Added as a 12th `MONTHLY_TARGET_METRICS` entry
(`fobBonusBase`), reusing `resolveMetricForRange(ds, loc, 'totalFoodCostPct', range)` verbatim —
not a new resolver. `tBonusLabor` (the labor-side sibling, same workbook row shape) stays out —
out of scope for a food-cost ask.

**Yearly tab:** added a third pill tab reading `ds.allYearlyTargets[year]`
(`loadAllYearlyTargets()`, already loaded into `ds` at startup) via new `YEARLY_TARGET_METRICS` +
`effectiveYearlyTarget()` exports in `targets-vs-actual.js`. Scoped to the 8 yearly_targets fields
that already have a verified daily/auto actual resolver reusable at this report's day-range grain
(Sales $, Labor %, TPPH, OEPE, Parked %, KVS Time, R2P, FOB Target % — the same resolvers the
Monthly/Daily tabs already use). **Deliberately excludes** the yearly workbook's CSAT
(OSAT/OSAT B2B/EAD/1-800 Contacts), Digital (App %/GCRD, McDelivery GCRD/Wait/Stars) and People
(staffing targets, turnover) fields, plus KVS Usage — `src/engine/review-engine.js`'s own
`REVIEW_METRIC_TARGET_FIELD` mapping (the other real consumer of these same yearly targets)
already establishes which of these have a real actual source and which don't: some have **no**
verified actual anywhere yet (McDelivery Stars: *"no actual-data source exists yet, enter
manually"*; OSAT B2B: *"owner-held pending his own investigation"*; 1-800 Contacts: a rate/count
unit mismatch never wired), and the rest (OSAT, EAD, headcount, shift-cert, turnover, McDelivery
wait/GC/R/D, digital GC/R/D) are computed by review-engine's own monthly `byLocMonth()` rollup —
a real, separate reuse target, but at a different grain (SMG/Roster/Turnover are monthly-cadence
uploads, not the day-level auto streams metric-source.js resolves) than this report's
7/14/21/28D/MTD picker fits cleanly. Left for a follow-on pass rather than guessed at here —
same "don't fabricate an actual" discipline as `tBonusLabor`/`tFOBBonusBase` above, just a bigger
lift to close correctly. `effectiveYearlyTarget()` deliberately has **no** `DEFAULT_TARGETS`
fallback (unlike `effectiveMonthlyTarget()`) — a yearly workbook may simply not exist for a given
store/year, and `DEFAULT_TARGETS` has no year dimension to fall back to.

9 new tests added to the existing dispatch test file (26 total): `fobBonusBase` reusing
`fobTotal`'s actual, `effectiveYearlyTarget()`'s no-fallback behavior, every
`YEARLY_TARGET_METRICS` entry's resolver + field-name sanity, a full yearly-tab compute against
the same proven fixture, the no-workbook-uploaded degrade case, and a Yearly-tab panel render.

## Bug fix, same day: "Also check labor target monthly. It is not right."

Owner flagged the Monthly tab's labor row directly. Root cause: v5.792 shipped a second,
redundant "Labor % (Overall)" row hardcoded to `targetField: 'tLabor'` — the exact legacy field
`src/engine/labor-basis.js` exists to retire after issue #153 (*"computeOpsScore graded on
`tLabor` while the approval cycle only ever populates `tCrewLabor`"*). That file's
`resolveLaborTarget()`/`DEFAULT_LABOR_BASIS` (`'tCrewLabor'`) is the single resolver every other
labor-target consumer in the codebase routes through (`morning-brief.js`, `at-a-glance.js`,
`store-analytics.js`, `labor-tools.js`, `analytics.js`, `store-dash.js`, `pipeline.js`,
`finding-rules.js`, `insights.js`, `one-pager-data.js`, `eom-supervisor.js`, `scheduling.js`,
`store-cockpit.js`, `bullseye-tile.js`, `labor-analysis.js`, `review-engine.js`, and more) — this
report was the one place in the codebase that bypassed it and read the field directly.

Fix: removed the `laborPctOverall` row entirely (it duplicated `crewLaborPct` against the wrong
field, never added real information); `crewLaborPct`'s target now resolves through
`resolveLaborTarget(targets)` instead of a hardcoded field read.

**Found the identical bug a second time before it shipped**, in this same commit's own new
`YEARLY_TARGET_METRICS` (`yLabor`, also hardcoded to `tLabor`) — caught by cross-checking against
`review-engine.js`'s `REVIEW_METRIC_TARGET_FIELD.labor` comment, which documents that dispatch
#142 already corrected this exact field to `tCrewLabor` for yearly data too, and that
`tCrewLabor` is itself a real `yearly_targets` column (`crew_labor_pct`), not monthly-only. Fixed
the same way: `yLabor` now routes through `resolveLaborTarget()`, relabeled "Crew Labor %" to
match `LABOR_BASIS_FIELDS.tCrewLabor.label`.

No other `MONTHLY_TARGET_METRICS`/`YEARLY_TARGET_METRICS`/`DAILY_TARGET_METRICS` entry reads a
labor field, so this was the full extent of it. Test fixtures/assertions updated to set
`tCrewLabor` instead of `tLabor`; full suite (8204 tests) and build re-verified green after the
fix, on top of the Food Cost/Yearly additions above.
