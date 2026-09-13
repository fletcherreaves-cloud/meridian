# crewHrs gets an auto-first METRIC_SOURCES chain (2026-09-13)

Closes the one gap dispatch #324's own migration left open, named explicitly in its own
comment in `labor-tools.js`: *"crewHrs has NO metric-source.js entry anywhere (no auto source
registered, opsLaborRows included) — left on the manual ctrlRows/laborRows read; adding a new
registry entry is out of #324's scope."*

## What was already true (checked before building)

`opsLaborRows` (`qsr_labor_summary`, via `loadOpsLaborSummary` / `scripts/qsrsoft-ops-pull.mjs`)
was **already pulling** crew labor hours daily — `COLS_LABOR_SUM` includes `'crewLaborHours'`
and the endpoint is the same `compType:'calendar'` labor-summary report `otHrs`/`otDollar`
already route through, independently validated against raw punch-time data (0.000 mean abs diff
across 83 store-days/5 stores — `memory/finding-comptype-calendar-labor-summary-2026-08-27.md`).
The data existed; only the chain was missing.

## A wrong assumption caught before shipping (measured, not reasoned)

`COLS_LABOR_SUM`'s own constant spells the field `'crewLaborHours'` (camelCase) — the natural
first guess for the chain's field name. Queried the live table directly before trusting it:

```
{"metrics":{"total_hours":195.47,...,"crew_labor_hours":186.47,...}}
```

The real JSONB key is **`crew_labor_hours`** (snake_case) — `mapCols()` in
`scripts/qsrsoft-ops-pull.mjs` runs every column name through `snake()` before writing it, so
the pull script's own camelCase constant name never describes what actually lands in the
database. Writing the chain against the assumed camelCase name would have shipped a silently
non-resolving reference — exactly the failure class `metric-chains.test.js` exists to catch, and
it did: `loadOpsLaborSummary` doesn't re-declare every `metrics`-JSONB field as an explicit
camelCase literal the way `loadOpsCashSheet` does for its own fields, so the auto-generated
`EMITS.opsLaborRows` field list (`scripts/gen-loader-emits.mjs`) had no way to see a field
reachable only through the loader's bare `...r` spread.

## What changed

- **`src/lib/supabase.js`** — `loadOpsLaborSummary` gains one more explicit camelCase alias,
  `crewHrs: r.crew_labor_hours != null ? Number(r.crew_labor_hours) : null`, matching how it
  already aliases `otHrs`/`otDollar`/`laborDollar` — and matching `loadOpsCashSheet`'s
  established convention of re-declaring every metric-source.js-consumed field explicitly rather
  than leaving it inside the bare spread. This is also what makes the field statically
  discoverable again (`node scripts/gen-loader-emits.mjs --write` now shows `'crewHrs'` in
  `EMITS.opsLaborRows`).
- **`src/engine/metric-source.js`** — new `crewHrs` chain: `{ mode: 'pos', srcs:
  [['opsLaborRows', 'crewHrs'], ['ctrlRows', 'crewHrs']] }`. **`laborRows` is deliberately
  excluded** — `EMITS.laborRows` (generated from real loader output) has no `crewHrs` field at
  all, meaning the pre-fix manual read (`labor-tools.js`'s old `_avg(lRows,'crewHrs')`) was
  silently always `null` for that leg. `metric-chains.test.js`'s "only names fields the source
  loader actually emits" guard caught this immediately when first drafted with all three legs —
  removing the dead leg is a small, provable correctness fix, not a scope change.
- **`src/views/labor-tools.js`** — `locStats`'s `crewHrs` now reads `metricAvg(ds,loc,range,
  'crewHrs')` instead of the raw `_avg(lRows,'crewHrs') || (...) _avg(cRows,'crewHrs')` read,
  matching how `laborPct`/`tpph`/`otHrs`/`actVsNeed`/`avgRate`/`salaryMgrHrs` were already
  migrated. `crewHrs` also joins the `hasAnyMetric` store-inclusion array (dispatch #68's own
  gate) — it was the one metric excluded from that check specifically because it had no auto
  chain; now every metric checked there has one. The local `_avg` helper and `cIsSummary` flag
  were crewHrs's only remaining consumers in this function and are removed as genuinely dead
  code, not left as an unused vestige.

## Tests

`src/__tests__/dispatch-crewhrs-auto-first-2026-09-13.test.js` — 5 cases: the chain's shape
(auto-first, no laborRows leg), resolving from `opsLaborRows` with no manual data, falling back
to `ctrlRows` when opsLaborRows has nothing, opsLaborRows winning over ctrlRows when both cover
the same day, and a real render of `LaborAnalyticsPanel` (not just the engine, per the standing
"would this verification still pass if reverted" rule) showing a store whose ONLY resolvable
metric is `crewHrs` is no longer dropped by the inclusion gate. All 5 confirmed to fail against
pre-fix code (`git stash` round-trip on the 3 changed source files, tests left in place).

`metric-chains.test.js`'s "only names fields the source loader actually emits" guard and
`scripts/gen-loader-emits.mjs`'s regenerated `EMITS.opsLaborRows` entry both pass unchanged.

Full suite 507/507 files, 4829/4829 tests. Build clean, 542.11 KB / 850 KB eager-payload budget.
