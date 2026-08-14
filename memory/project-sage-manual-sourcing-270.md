# #270 phase 1 — SAGE manual-data sourcing fix (2026-08-14)

## What was wrong

`src/views/sage.js` built SAGE's system prompt entirely from manual, device-local
upload arrays (`ds.laborRows` / `ds.ctrlRows` / `ds.opsRows`), bypassing
`src/engine/metric-source.js`'s auto-first resolver — the exact pattern CLAUDE.md's
"source data through the shared helpers" standing rule prohibits. On a device with
27 months of cloud/emailed data and zero manual uploads (the normal steady state
post auto/emailed-first migration), SAGE's labor/ops/controls summaries were
silently empty or stale, while `buildFobSummary` (already on `ds.qsrFobRows`, the
correct auto stream) worked fine — the asymmetry is what surfaced the bug.

Four defects, per the issue:

1. `hasData` gated on `ds?.laborRows?.length > 0` only — false on a cloud-only
   device even with abundant real data.
2. `buildControlsSummary` / `buildLaborSummary` / `buildOpsSummary` read
   `ds.ctrlRows` / `ds.laborRows` / `ds.opsRows` directly (manual-only).
   `buildFobSummary` was the working precedent (already on `qsrFobRows`).
3. The data-inventory block in the system prompt counted manual rows, contradicting
   the summaries beside it once fixed — e.g. `FOB/Food Cost: ${ds?.fobRows?.length}`
   was wrong even before this fix, since `buildFobSummary` never read `fobRows`.
4. Semantic mislabel: `buildControlsSummary` computed a 60-day mean `|cashOSAmt|`
   and labeled it "NOTABLE EXCEPTIONS." SAGE then told the owner about "two open
   Cash O/S exceptions" — a mean reported as a count of open incidents.

## What changed

- `sageHasData(ds)` (new, exported): true if ANY resolvable stream has rows —
  `qsrActSummaryRows` / `glimpseRows` / `cashRows` / `qsrFobRows` /
  `salesLedgerRows` / `opsCashRows` / `opsLaborRows` / `opsServiceRows` /
  `ctrlRows` / `laborRows` / `schedRows` — not `laborRows` alone.
- `buildLaborSummary`, `buildOpsSummary`, `buildControlsSummary` rewritten to pull
  per-store-per-day values via `metricSeries(ds, loc, range, key)` and district
  averages via `metricAvg(ds, locs, range, key)` (auto-first, same resolver
  `buildFobSummary` already trusted). Store roster is `Object.keys(STORE_NAMES)`
  (static, always populated), 60-day trailing range via `_lastNDaysRange`.
- `buildControlsSummary`'s elevated section relabeled from "NOTABLE EXCEPTIONS" to
  "STORES WITH AN ELEVATED 60-DAY AVERAGE (not open exceptions — a mean, worth a
  look, not a flagged incident)"; table rows say "Disc avg" / "Cash O/S avg".
- New `metric-source.js` chain: `otDollar` (OT hours' dollar sibling — same
  `opsLaborRows` → `ctrlRows` → `laborRows` chain as `otHrs`, needed for
  `buildLaborSummary`'s OT-dollar column). Already covered by
  `metric-chains.test.js`'s EMITS map, no test infra changes needed.
- Data-inventory block renamed "DATA COVERAGE" and reports what the summaries
  actually resolved (`_resolvedDayCount` = store-days with a `metricSeries` value)
  instead of raw manual `.length` counts. FOB line uses `ds.qsrFobRows.length`
  (matches what `buildFobSummary` reads), not `ds.fobRows`.
- Incidental fix while rewriting the same lines: `laborPct`/`park`/`discPct` are
  0–1 fractions per `parsePct()`'s convention (confirmed against `analytics.js`'s
  own `(v*100).toFixed(2)+'%'` display convention), but the original code
  concatenated them raw with `'%'` (e.g. "0.28%" instead of "28.00%"). New
  `_fmtPct()` helper fixes this everywhere it was touched. Pre-existing bug, not
  introduced by this fix — fixed because it directly affects what SAGE reports,
  the same class of harm the issue is about.
- Also fixed: `buildControlsSummary`'s elevated-discount threshold was
  `s.discPct > 3`, dead code comparing a 0–1 fraction against literal 3 (could
  never trigger). Now `> 0.03` (3%).

## Two adjacent bugs found, deliberately NOT fixed here (out of phase-1 scope)

1. **`ds.storeIds` is manual-labor-derived.** `src/app/App.js` sets
   `storeIds:[...new Set(labor.map(r=>r.loc))].sort()` in at least 3 places — empty
   on a device with zero manual labor uploads. Using it as "the store roster" would
   have silently kept this exact fix broken. Worked around locally by using
   `Object.keys(STORE_NAMES)` instead (precedent: `App.js:1856`,
   `ds?ds.storeIds:Object.keys(DEFAULT_TARGETS)`). Any other code still reading
   `ds.storeIds` as an all-stores list has the same latent bug.
2. **`ds.loaded` is ALSO manual-labor-derived**, and wider: `src/engine/pipeline.js`
   sets `ds.loaded = ds.laborRows.length > 0` in at least 2 places (`buildDS` and
   another call site around line 686). Every `if (!ds.loaded)` gate app-wide
   (10+ found in `analytics.js` alone via grep) is a candidate for the same
   silent-failure-on-cloud-only-device bug `sageHasData` fixes locally for SAGE.
   Not touched here — fixing it is an app-wide sweep, not a phase-1-sized change.
   Worth its own issue/pass.

## Explicitly out of scope (per the issue)

Phase 2 — moving prompt assembly server-side — is separate and larger, not
attempted here. `buildScheduleSummary` (LifeLenz/schedule rows) was not flagged by
the issue and was left untouched.

## Test coverage

`src/__tests__/sage-manual-sourcing.test.js` — builds a `ds` with ONLY cloud
streams populated (`glimpseRows`, `qsrActSummaryRows`, `opsLaborRows`,
`opsCashRows`, `qsrFobRows`) and no manual arrays at all, asserting every rewritten
summary + `sageHasData` + the DATA COVERAGE block still resolve real data and
format correctly — the exact "device that never had a manual upload" scenario the
issue is about.
