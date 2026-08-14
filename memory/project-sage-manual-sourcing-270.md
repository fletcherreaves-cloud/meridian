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

## PR #271 review round (2026-08-14, same day)

Three real findings surfaced by review, all fixed in the same PR before merge:

1. **`buildControlsSummary`'s gate was keyed to one metric while the section reports
   two.** `totalDays` counted `discPct`-resolved days only, but `discPct` and
   `cashOSAmt` resolve through different chains (`discPct` → `opsCashRows` →
   `ctrlRows`; `cashOSAmt` → `glimpseRows` → `cashRows` → `opsCashRows` →
   `ctrlRows`). A device carrying the emailed Glimpse stream but no ops-pull cash
   rows and no manual Controls upload had every cash-O/S day resolved and the
   section still returned `null` — the same silent-empty failure this fix exists to
   remove, just relocated one level up. Fixed: `dayCount` now unions resolved days
   across both metrics, and the final "nothing to show" gate checks both district
   figures (`distDisc` and a new `distCashOS`, a flat — not average-of-averages —
   mean of `|cashOSAmt|` across all resolved store-days), not `distDisc` alone. The
   original test fixture couldn't catch this because it always populated
   `opsCashRows`; a new glimpse-only fixture proves the fix.
2. **`storeCount` at the top of `buildSystemPrompt` was still `ds?.storeIds?.length`**
   — three lines above the section this PR rewrote, reading the exact
   manual-labor-derived field documented above as broken on a cloud-only device.
   SAGE's opening line would have read "managing 0 locations" on precisely the
   device this fix targets. Fixed: `Object.keys(STORE_NAMES).length`, same
   substitution used everywhere else in this file.
3. **The `CURRENT OPERATIONAL DATA` header still said "(from uploaded files)"**
   after the TOOL USAGE RULES sentence nearby had already been corrected — same
   defect shape as #4 above (telling SAGE something about the data that isn't
   true), just a second string that didn't get updated. Fixed to describe
   auto-first sourcing.

`buildOpsSummary` has the same single-metric-gate shape (gated on `oepe` alone,
also reports `park`) but `oepe` is the section's ranking key, so the reviewer
recommended leaving it as-is — not changed here.
