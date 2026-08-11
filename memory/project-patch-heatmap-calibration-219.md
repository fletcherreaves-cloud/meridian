# Patch Heatmap band calibration (#219) — measurement tooling, bands NOT yet changed

**Status:** blocked on live data. `scripts/measure-patch-heatmap-bands.mjs` is written and its
imports verified to resolve in Node, but has never been run — no `SUPABASE_SERVICE_ROLE_KEY` in
this sandbox (same constraint as `measure-coaching-noise-threshold.mjs` for #208). **The
`badAt` constants in `src/views/patch-heatmap.js` are unchanged.** Per the issue's own
instruction — "don't loosen until it looks nice, that's picking by feel twice" — changing them
without the real distribution would be exactly the mistake the issue is trying to prevent.

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

## Next step

Someone with `SUPABASE_SERVICE_ROLE_KEY` (the owner, or a future session with real access) runs:

```
node scripts/measure-patch-heatmap-bands.mjs
```

...reads the printed p90/p95 candidates per dimension, updates the 4 `badAt` constants in
`src/views/patch-heatmap.js`'s `storeDimensions()` to match, and cites the measurement in the
code comment (matching how `COVER_FRAC` and the swing alarm cite theirs). #220 (patch rollup
tiles) is blocked behind this landing — the owner explicitly sequenced it that way.

If the measured bands still flag close to 26 of 27 once real percentiles are used, that is
itself a real finding (per the issue's own words) — not a sign the measurement is wrong.
