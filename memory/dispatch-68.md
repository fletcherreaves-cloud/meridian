# Dispatch #68 — `LaborAnalyticsPanel` was dropping every store, district-wide, right now

**Status:** shipped. Verified live before implementing, per the standing "measure, don't
reason" rule.

---

## Where this came from

`memory/data-sourcing-standard.md`'s exclusion list carried this entry, unrechecked since it
was written:

> `LaborAnalyticsPanel` (labor-tools.js) — labor-HOURS-centric; drops stores with no manual
> labor/ctrl rows by design (needs actual punched hours). Rates could be migrated but the
> panel's hours/period-summary logic makes it risky; revisit only if it becomes a reported gap.

Dispatch #64 (Visit Readiness) had just proved the sibling entry in the same list —
`visit-readiness.js`'s local `srcs` chains, described as "parallel-but-correct" — was
**parallel and wrong**: manual-only where auto sources already existed, silently. The same
list flagged `LaborAnalyticsPanel` as the other unrechecked entry worth a look, and it looked
suspicious for the same reason: auto labor streams (DAR, `opsLaborRows`) now exist, and "drops
stores with no manual rows" is exactly the manual-only pattern #64 just closed elsewhere.

## What was actually true (verified before touching any code)

Read `LaborAnalyticsPanel` (`src/views/labor-tools.js:1667`) end to end first. The doc's premise
was **half right and half stale**:

- **The metric VALUES were already migrated.** A prior dispatch (#324, per the file's own
  comments) already routed `laborPct`/`tpph`/`avgRate`/`actVsNeed`/`otHrs`/`actHrs`/
  `salaryMgrHrs`/`otCost` through `metric-source.js`'s auto-first chains. `crewHrs` is the one
  metric with no registered chain anywhere (documented, deliberate, out of #324's scope) — not
  a gap this dispatch needed to close.
- **The STORE-INCLUSION GATE was never updated to match.** `locStats`'s per-store computation
  still opened with `if(!lRows.length&&!cRows.length) return null` — checking raw manual
  `laborRows`/`ctrlRows` presence, not whether any of the now-auto-first metrics actually
  resolved. So a store with zero manual uploads but full DAR/`opsLaborRows` coverage was
  silently dropped from the panel entirely, even though every rate metric it needs would have
  computed a real value if the function had gotten that far. Same bug class as #64: an
  auto-first chain exists and works, but the thing deciding whether to SHOW the result never
  checks it.
- **`totalSales` was still manual-only** (`_sum(lRows,'sales')`) despite `sales` already having
  a registered auto-first chain (`qsrActSummaryRows.sales`/`.allNetSales` → `laborRows.sales`).
- **A second, unrelated staleness bug in the same file**: `dowStats` and `trendData` both had
  comments claiming `actVsNeed` "has no METRIC_SOURCES entry yet, so it stays a manual
  lRows-only average" — checked against `metric-source.js` directly, and that chain
  (`qsrActSummaryRows.actVsNeed` → `ctrlRows.actVsNeed`, `mode:'any'`) already exists. Both
  comments were stale by the time they were written and both functions kept reading raw
  `ds.laborRows` for `actVsNeed` instead of the registered chain right next to it.
- **A top-level gate had the same problem, more severely.** `hasData` — the guard that decides
  whether the WHOLE panel renders at all, vs. a dead-end "No Labor Data Loaded" screen — checked
  only `ds.laborRows`/`ds.ctrlRows` presence, with no auto fallback.

## Measured live (service-role key, 2026-08-22, 28-day window, all 27 stores)

| | manual (`labor_rows`+`ctrl_rows`) | auto (DAR + `qsr_labor_summary`) |
|---|---|---|
| rows | **0** | 783 + 783 |
| stores covered | **0 / 27** | **27 / 27** |

**Manual labor/controls uploads have been completely dark, district-wide, for at least 28
days**, while auto coverage is complete. The panel's default view is a 4-week trailing window.
So the OLD gate was not a theoretical edge case — it was dropping **every single store** from
the default Labor Analytics view, right now, in production, exactly matching the earlier
suspicion that this "would be quietly incomplete for any store without manual data."

## The fix

`src/views/labor-tools.js`:
- `locStats`: moved the metric computations (`laborPct`/`tpph`/.../`otCost`) before the
  inclusion check, and now includes a store if EITHER legacy manual rows exist OR any migrated
  metric actually resolved (`hasAnyMetric`). `crewHrs` alone resolving is not sufficient by
  itself to include a store with nothing else — but it's also never the only thing checked.
- `totalSales`: now sums the auto-first `sales` daily series (same period-total-from-series
  idiom the file already used for `otCost`), falling back to the raw `lRows` sum only if the
  series is empty.
- `hasData`: also checks `ds.qsrActSummaryRows`/`ds.opsLaborRows` presence, so a district with
  real auto coverage and zero manual uploads doesn't hit the dead-end screen.
- `dowStats`/`trendData`: `actVsNeed` now buckets from `metricSeries`/`metricAvg` like its
  `laborPct`/`tpph`/`otHrs` siblings on the same lines, closing the stale-comment gap. `dowStats`
  keeps its raw `ds.laborRows` read for the `count` column only — that's a manual-upload-coverage
  diagnostic, not a metric value, and deliberately not routed through metric-source.js.

Two structural ratchets needed their ceilings updated as a direct, expected consequence (both
noted inline in the ratchet files themselves, not silently bumped):
- `ratchet-week-day-arithmetic.test.js` (R3): 60 → 62 — two new `.getDay()` calls bucketing
  `otHrs`/`actVsNeed` by weekday, the same DOW-bucketing idiom the two adjacent, already-counted
  `laborPct`/`tpph` calls use. Not week-start/business-day boundary math (the bug class R3
  exists to catch).
- `ratchet-raw-metric-rows.test.js` (R1): 162 → 161 — one raw `ds.laborRows` read removed
  (`trendData`'s now-dead `avgZ('actVsNeed')` helper).

## Verification

`src/__tests__/labor-analytics-manual-only.test.js` (new, 3 tests) renders the ACTUAL
`LaborAnalyticsPanel` consumer — an engine-level check of `metric-source.js` alone can't tell
"the chain resolves" from "the panel actually shows it," which is exactly the gap here (same
standing rule #64 and #62 already applied). Fixture mirrors the measured live state exactly:
zero `laborRows`/`ctrlRows`, full `qsrActSummaryRows`/`opsLaborRows` coverage.

- Auto-only store: does **not** hit "No Labor Data Loaded", does **not** hit "No labor data for
  this period and location", store's own row renders.
- Truly empty `ds` (no auto, no manual): still correctly hits "No Labor Data Loaded" — the gate
  isn't being removed, just widened.
- Manual-only store (the pre-existing, working case): still renders unchanged.

**Demonstrated revert-sensitive**: stashed `labor-tools.js`'s changes and re-ran — the auto-only
test fails exactly as expected (`No Labor Data Loaded` renders), the other two pass unchanged
either way (their paths were never broken). Restored.

2030/2030 tests (3 new), build clean, entry chunk unchanged (`labor-tools.js` is lazy-loaded).
`node -v` 22, within `ci.yml`'s `[20, 22]` matrix.

## `memory/data-sourcing-standard.md`

The `LaborAnalyticsPanel` exclusion-list entry is struck through with this dispatch's correction,
matching the convention #64 set for the Visit Readiness entry in the same list.

## Out of scope

- `crewHrs` — genuinely has no auto source anywhere; left manual-only, correctly.
- The OTHER remaining unrechecked exclusion in the same list (`store-analytics.js`'s `dowData`,
  a day-of-WEEK breakdown where `metricAvg`'s range-mean semantics don't apply) — not asked for
  this dispatch, not touched.
- Weights, targets, bands — this dispatch changes where the numbers come from and whether a
  store is shown at all, nothing about how they're scored once shown.

## Numbering note

This landed as **#68**, not #67 — #67 was already claimed (merged to `main` moments before this
branch started) by an unrelated `event_details`/localStorage-token fix from a different,
concurrent investigation thread. Flagged rather than silently colliding.
