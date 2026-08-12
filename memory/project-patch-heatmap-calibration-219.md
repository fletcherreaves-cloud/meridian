# Patch Heatmap band calibration (#219) — measured, decided, shipped

**Status: DONE.** The owner ran `scripts/measure-patch-heatmap-bands.mjs` against live
production (2026-08-11) and supplied final `badAt` values, corrected for a structural bug the
script itself didn't flag (see below). `src/views/patch-heatmap.js`'s `storeDimensions()` now
uses: **Sales 27** (was 15) · **FOB 1.9** (was 3, tighter) · **Labor 8.8** (was 3) · **Speed 73**
(was 20). Controls stays uncalibrated by design (composite score, out of scope). 9 new tests
(`src/__tests__/patch-heatmap-bands.test.js`) lock in both the constants and the corrected
formula together.

## The structural bug the script didn't catch on its own

`bandFromGap(gap, badAt) = 100 * (1 - gap/badAt)`, and `cellStatus()` grades clean at band>=80,
watch at band>=50. Solving those: **watch fires once gap exceeds `0.2 * badAt`, and critical
fires once gap exceeds `0.5 * badAt` — not at `badAt` itself.** The original v4.985/986
constants were picked as if `badAt` WAS the critical line, which is why they were roughly
2-3.7x too tight across three of the four dimensions. A raw p90-of-over-target reading from the
measurement script is therefore not directly usable as `badAt` — it has to be DOUBLED first, so
that the p90 value lands at the `0.5 * badAt` critical boundary where it was actually intended.
The four shipped constants above are already 2x each dimension's measured over-target p90.

## The finding that started this

First production look at the Patch Heatmap (#201, live 2026-08-11): **18 critical / 8 watch /
1 clean — 26 of 27 stores flagged**, the same day the same dashboard's other panels reported
25 of 27 stores at trusted health with all 27 locks complete. Those can't both be true.
`storeDimensions()`'s `badAt` values (Sales 15%, FOB 3pp, Labor 3pp, Speed 20%, plus Controls'
`ctrlScore` used directly) were chosen when the feature was built, not derived from a
distribution — the same class of gap the swing alarm and `COVER_FRAC` (#209) both closed by
measuring instead of guessing.

## Why worst-of-N compounds

`cellStatus()` colors a store by its WORST dimension (`dims.reduce((a,b) => b.band < a.band ?
b : a)`), which is the correct design per the owner's #201 decision ("worst-of-N... green is
good, red is bad") — **not** something this issue asks to change. But it means each
dimension's own "how often does this flag" rate compounds: if 4 independent dimensions each
flag 20% of store-days as watch-or-worse, the chance ALL 4 are clean on a given day is
`0.8^4 ≈ 41%`, not `80%`. A per-dimension cut that looks reasonable in isolation can still
produce a heatmap that's mostly red. That means the fix has to move each `badAt` value out to
where the DATA says "unusual" for that dimension specifically — a looser bar than a human
would naively pick for a single metric, precisely because worst-of-N multiplies the flag rates
together.

## What the script measures

`scripts/measure-patch-heatmap-bands.mjs` — covers **4 of the panel's 5 dimensions**: Sales,
FOB, Labor, Speed. Each has a direct, single-table gap-to-target definition it can pull fresh
and grade with `patch-heatmap.js`'s own `bandFromGap()` formula (copied verbatim into the
script so the simulated flag rate is provably the same formula the panel actually runs, not an
approximation of it):

| Dimension | Source | Gap formula | Current `badAt` |
|---|---|---|---|
| Sales | `qsr_daily_activity_rollup` (product_sales, ly_product_sales) | `-(pct vs LY)` | 15 (%) |
| FOB | `qsr_fob` (6-component controllable %) | `(fobPct - tFOBTarget) * 100` | 3 (pp) |
| Labor | `labor_rows.labor_pct` | `(laborPct - resolveLaborTarget) * 100` | 3 (pp) |
| Speed | `qsr_daily_activity_rollup` OEPE (`oepeSeconds`, shared w/ #183) | `(oepe - tOepe) / tOepe * 100` | 20 (%) |

For each it prints: the full gap-percentile spread, the over-target-only percentile spread
(p50/p75/p90/p95 — the candidates for a new `badAt`), and — using the CURRENT `badAt` — what
fraction of measured store-days are already watch-or-worse / critical. That last number is the
direct reproduction target: if it's already high per-dimension, the 26-of-27 finding is
explained by the individual cuts, not a bug in the worst-of-N logic itself. A final section
estimates the compounding effect assuming independence (a deliberately naive but useful sanity
bound) and compares it against the real observed 1-of-27 clean rate.

## Controls (ctrlScore) — explicitly out of scope for this script

Unlike the other 4, `ctrlScore` isn't a raw column in any table — it's a composite
`computeOpsScore` builds from several inputs (labor/OEPE/KVS/park). Measuring ITS distribution
needs either replicating that scoring logic faithfully in a standalone script (real risk of
drift from the actual implementation, unverifiable here) or in-app instrumentation that logs
the live-computed score over time. Flagged rather than guessed at or silently skipped — the
5th dimension's calibration is real follow-up work, not solved by this script.

## Why the script is trustworthy despite being unrun

- Its `bandFromGap()` is a literal copy of `patch-heatmap.js`'s own function — not a
  reimplementation that could silently diverge.
- Every gap formula matches `storeDimensions()`'s exact math (mirrored line-for-line in the
  table above).
- It imports `DEFAULT_TARGETS` (`src/constants.js`), `resolveLaborTarget`
  (`src/engine/labor-basis.js`), and `oepeSeconds` (`src/utils/oepe.js`) directly from the app
  source rather than reimplementing targets/OEPE math a second time — the same target/formula
  the live app uses, guaranteed by import rather than by hand-copying.
- **Verified**: `node --check` passes, and running the script (without a service-role key) gets
  all the way through the three source imports to the expected "missing credentials" exit —
  proof the imports resolve cleanly in a plain Node ESM context, the actual risk with importing
  browser-oriented app modules from a script.
- **Not verified**: never run against real data, so its numeric OUTPUT (the actual percentiles)
  is unknown. This doc does not claim a result — only that the tool is ready to produce one.

## What actually shipped

Owner-supplied final values (already 2x the measured over-target p90, correcting for the
structural bug above):

| Dimension | Old `badAt` | New `badAt` | Direction |
|---|---|---|---|
| Sales | 15 | **27** | loosened ~1.8x |
| FOB | 3 | **1.9** | tightened — was genuinely loose |
| Labor | 3 | **8.8** | loosened ~2.9x |
| Speed | 20 | **73** | loosened ~3.7x — did most of the original damage |

Expected result on the measured distribution: **~6 critical / 14 watch / 7 clean**, vs the
original 18/8/1. Not independently re-verified live in this sandbox (no browser/Supabase
session here) — if the live grid doesn't land near that split, that's a real finding to raise,
not something to nudge quietly.

Code change: `src/views/patch-heatmap.js`'s `storeDimensions()`, with the structural
band/badAt relationship and the measurement cited directly in the function's own comment
(matching how `COVER_FRAC` and the swing alarm cite theirs). #220 (patch rollup tiles), which
was blocked behind this landing, is unblocked.

---

# Patch Heatmap rollup tiles (#220) — shipped v4.993

Sequenced immediately after #219 on the owner's own instruction, in the same file since it's
the same feature. Owner, on first use of #213: *"It's labeled Patch Heatmap, yet shows all
locations individually (I like) — but why not include a tile for each patch rolled up as
well?"*

## The trap, avoided

**Never colour a patch tile by its worst store.** That tile is then just that store again
wearing a bigger badge — zero new information, and it goes red the moment any single store
struggles (on the pre-#219 bands, every patch would have been red). The payoff row from the
issue's own table:

| Pattern | Reading | Who to coach |
|---|---|---|
| Store red | one restaurant struggling | the GM |
| Patch red as a unit | systemic across the patch | the supervisor |
| Patch green, one store red | isolated | the GM — leave the supervisor alone |
| Patch red, no single store dominant | process/staffing/coaching style | the supervisor |

That last row is unobtainable from "worst store" — it's only visible once the underlying data
is genuinely aggregated first.

## How `patchDimensions()` aggregates each dimension

New function in `src/views/patch-heatmap.js`, reusing `bandFromGap()`/`bandColor()` and a
newly-factored `statusFromDims()` (the same worst-of-N logic `storeDimensions()`'s
`cellStatus()` already used, now shared by both store and patch tiles):

- **Sales** — sums raw `pSales`/`pLY` dollars across member stores directly. A true
  dollar-weighted aggregate (no separate weight variable needed — summing $ across stores IS
  the weighted average).
- **FOB** — sums `fobRow.sales`/`fobRow.fob` $ directly, same reasoning. The comparison
  TARGET is also sales-weighted across the same member stores (mirrors `computeFOBMetrics`'
  own `wTgt` pattern in `analytics.js` — not a new invention).
- **Labor** — sales-weighted average of each store's `laborPct` and its `resolveLaborTarget`.
  No raw labor-$ figure survives this far upstream (only the sales-weighted convention
  `labor-tools.js`'s own district rollup already uses), so this is the best available
  dollar-adjacent weight, not a literal $-of-labor sum.
- **Speed (OEPE)** — sales-weighted average of seconds. Honestly a size-proxy, not literal
  car-weighting — OEPE has no car-count weight anywhere else in this app either
  (`attention-now.js`'s `dtRows` detector notes the same limitation for its own OEPE
  aggregation).
- **Controls** — deliberately EXCLUDED, same reasoning as #219: `ctrlScore` is a composite
  `computeOpsScore` builds from several inputs, not a raw gap-to-target this function can
  aggregate honestly without re-deriving that scoring logic per patch. A real follow-up, not
  solved here.

## Grouping source

`supervisorGroups()` (`src/constants.js`), NOT the frozen `INV_ORG_COORDS[loc].sup` snapshot
the issue also named as an option. Researched before choosing: `App.js` calls
`setLiveSupervisorGroups()`/`setLiveAssignments()` on every settings load
(`memory/project-org-structure.md`), so `supervisorGroups()` is the live, Management-editable
org chart the rest of the app (EOM Dashboard, Management UI) already treats as canonical.
`INV_ORG_COORDS.sup` is a frozen hardcoded seed — it matches `supervisorGroups()`'s partition
today but isn't guaranteed to stay in sync after a reassignment. The inverse loc→patch lookup
is first-writer-wins, guarding the issue's "don't double-count a store in two patches"
requirement even though a clean org-chart partition shouldn't produce that in practice.

## UI

A patch row above the store grid — the issue's own suggested layout, since patch and store
tiles answer genuinely different questions and mixing them in one grid would blur that. Same
interaction model as store tiles: click to expand, worst dimension named on the tile itself
(never color alone), gray `?` unknown state when a patch has no dimension with real data.
Store-membership count shown per patch tile and per dimension detail line (e.g. "(3 stores)")
so it's visible how many stores actually contributed to a given aggregate. No coaching hook
added — a supervisor-level "Coach this" is a natural future extension of #208's coaching loop,
but out of scope for this issue.

## Verification

9 new tests (`src/__tests__/patch-heatmap-rollup.test.js`): every dimension's aggregation
checked against a hand-computed dollar/sales-weighted answer, using fixtures deliberately
shaped so a naive per-store average would produce a DIFFERENT (wrong) number — e.g. Sales:
naive mean of (-10%, 0%) = -5%, correct dollar-weighted answer = -1%. Also covers: Controls
exclusion, partial-member-set handling (only members with real data contribute, dims stay
absent when nobody has data), and the core anti-pattern guard directly — a store bad enough to
be critical on its own bands clean once genuinely aggregated into a much larger healthy patch.

Full suite (1318 tests) + build both pass clean. Entry chunk unchanged — `patch-heatmap.js` is
lazy via `at-a-glance.js`, so all new code landed in that chunk (108.52→112.54 KB raw,
29.43→30.11 KB gzip), not the entry chunk.

**Not verified live** — no browser/Supabase session in this sandbox. The owner should confirm
the patch row groups stores as expected (no supervisor showing an empty or duplicate patch)
against the real live org chart.
