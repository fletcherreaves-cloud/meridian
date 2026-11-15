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
