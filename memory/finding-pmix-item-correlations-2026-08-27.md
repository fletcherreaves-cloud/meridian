# Finding — Product-mix item correlations (dispatch #169, 2026-08-27)

Full spec: `memory/dispatch-169.md`. This file records what was actually measured, so a future
session doesn't re-derive it. Credential used throughout: `SUPABASE_SERVICE_ROLE_KEY`
(`sb_secret_...`, this session's environment) against `qsr_product_mix` via the standard
`apikey`+`Authorization: Bearer` PostgREST recipe.

## Item universe + concentration (task 1)

- `count=exact`/`count=planned` on the full table: **2,566,818 rows** (`count=planned` estimate;
  `count=exact` timed out with `57014` — a scan-finds-nothing/too-much timeout, not a denial, same
  pattern as CLAUDE.md's earlier-documented probes).
- Date range in the table: **2026-01-01 .. 2026-08-25** (237 days).
- No server-side `GROUP BY`/aggregate available — Supabase's PostgREST has aggregates disabled
  (`PGRST123 "Use of aggregate functions is not allowed"`). Full-table client-side aggregation
  across 2.5M rows via 1000-row OFFSET pages is impractical (OFFSET cost grows with depth, and nothing
  indexes a plain `item` scan). Used a **20-date stratified sample** instead: dates evenly spaced
  across the full history, each fetched by `date=eq.X` (indexed, fast, exhaustive for that day) —
  207,966 rows, ~89% of one single-store-day's worth of coverage repeated across the year, not a
  1000-row toy.
- **699 distinct menuItemNumbers** in that sample (vs. the dispatch doc's own preliminary
  1000-row/391-item finding — confirms the universe is large and that a bigger sample finds more
  items, i.e. the real full-history count is at or above 699).
- **Concentration** (share of total `soldQty` in the sample): top 10 items = 25.7%, top 20 = 39.0%,
  top 50 = 60.5%, top 100 = 78.1%, top 150 ≈ 86.8%, top 200 = 91.7%, top 391 = 99.0%. Confirms the
  dispatch's "small top-N drives most volume" hypothesis — this backed `PMIX_SCANNER_TOP_N = 150`
  in `signal-registry.js`.
- Top items by volume were plausible, real menu staples (Hpy Meal Auto Deduct, L Coke, Hash Brown,
  McChicken, L Dr. Pepper, McDouble, Double Cheeseburger, L French Fries, ...) — sanity-checks the
  sampling methodology.

## Filet-O-Fish anchor case (verification)

Pulled the **full captured history** for menuItemNumber **5926** ("Filet-O-Fish", the à la carte
sandwich — confirmed against the live `desc_` column) — not a sample: **7,916 rows**, all 27
stores, 2026-01-01..2026-08-25. Saved as `src/__tests__/fixtures/pmix-fof-2026.json` (compact,
loc/date/item/price/soldQty only — 599 KB).

Hand-aggregated (sum `soldQty` across price tiers per (loc,date), then across stores per date,
then grouped by day-of-week):

| DOW | n days | mean daily district units |
|---|---|---|
| Mon | 34 | 433.4 |
| Tue | 34 | 443.7 |
| Wed | 33 | 470.8 |
| Thu | 34 | 495.3 |
| **Fri** | 34 | **568.8** |
| Sat | 34 | 426.9 |
| Sun | 34 | 396.1 |

Friday is the single highest day of the week — reproduces the Notes 28 #5 claim directly from raw
numbers, before any registry code was written.

Run through the actual `computeCustomSignal({xMetric:'calFri', yMetric:'pmixItem:5926', ...})`
path: **r = +0.145, n = 6,305 (loc-day pairs), p ≈ 0** — positive and highly significant given the
large n. Modest r (not the app's 0.50 "confirmed" bar) because day-level noise across 27
individual stores dilutes a single calendar flag's signal — expected for daily granularity, not a
red flag. See `src/__tests__/dispatch-169-pmix-fof-correlation.test.js`.

## The `allowZero` reality (task 5)

`scripts/qsrsoft-pmix-pull.mjs` already filters `soldQty<=0` rows as "catalog placeholders" before
upsert (`qtyDropped` in `upsertAndLog`, confirmed by reading the script, not assumed). So a
genuinely 0-sold day for an item **never reaches `qsr_product_mix`/`ds.pmixRows` as a row** — it is
indistinguishable from "item not in the catalog feed that day." `allowZero:true` was still set on
the synthesized `pmixItem:*` metric (matches the dispatch's own reasoning and the
Weather/Calendar precedent, forward-compatible if the pull script's filter ever changes), but it
does not currently recover the literal zero the FR's "0 Filet-O-Fish sold on a Tuesday" framing
was written around. Changing the pull script's filter is a bigger, separate decision (the schema
doc explicitly protects against widening this table's row volume without a specific reason) — out
of scope for this dispatch, documented instead of silently glossed over.

## Bug found and fixed: Calendar/Pricing metrics never reached `scanAllPairs`

While wiring items to pair against Calendar/Weather metrics in the Scanner, discovered that
`calFri`/`calWeekend`/`calMon`/`pxDaysSince`/`pxItemsChanged`/`pxMeanStepPct` were **never actually
included in `scanAllPairs`'s sweep**, since Calendar shipped in v4.533. Root cause: the
pre-extraction loop gated every metric on `ds[m.source]` being a non-empty array — correct for
every real-table source, but `__calendar`/`__priceEvents` are *derived* sources with no such array
by design, so `ds['__calendar']`/`ds['__priceEvents']` were always `undefined` and the metric was
silently skipped. `SEEDED_SIGNALS`'s "Friday lift" entry never caught this because it calls
`computeCustomSignal` directly, bypassing the buggy loop entirely.

Reproduced directly (node, pre-fix): `scanAllPairs({laborRows}, ...)` against a dataset with an
obvious Fri/Sat/Sun sales pattern returned `metricsUsed: 2` (sales, gc only), `tested: 1` — zero
calendar pairs. Post-fix: `metricsUsed: 5`, `tested: 7`, calFri/calWeekend/calMon all present with
the expected `r` values. Fixed by special-casing the two derived sources in the presence check
(read the real precondition for each: Calendar has none — its own `_CAL_SRC` streams govern
coverage inside `extractMetricValues`; Pricing needs `ds.pmixRows` non-empty). Regression test:
`src/__tests__/dispatch-169-pmix-item-registry.test.js`'s "regression: Calendar/Pricing metrics
now actually reach scanAllPairs" block.

This is exactly the "engine right but unused" shape CLAUDE.md's dispatch16 verification rule
warns about — every prior calendar/pricing test exercised `extractMetricValues`/
`computeCustomSignal` directly, never the actual Scanner sweep, so nothing before this could have
told "wired into Calendar/Pricing" from "wired into everything except the one place that runs by
default."

## Design decision: Scanner item coverage (task 4)

Chose a **hybrid** of the dispatch's two listed options, not one in isolation:
- Capped to **top `PMIX_SCANNER_TOP_N` (150) items by volume** — the measured concentration point
  (~87% of units sold).
- Paired **only against Calendar + Weather** metrics already present in the sweep (not against
  each other, not against the rest of the registry) — matches the FR's actual ask (item ×
  day-of-week/weather), not a general item↔everything fishing expedition.
- **Off by default** behind `opts.includeItems` (Signals panel: an "Item Mix" checkbox, daily-only,
  disabled on the Monthly view) — a plain "Run scan" has the identical pair count/timing as before
  this dispatch (regression-tested).

Tradeoff: a top-150 cap means a real but low-volume seasonal/LTO item (a McRib-style promotional
item, say) would need to place in the top 150 by volume across whatever window is loaded to be
auto-discovered by the Scanner — for anything below that, the Signal Lab item picker (searches the
full ~700+ item list, no cap) is the intended path, not the Scanner sweep.
