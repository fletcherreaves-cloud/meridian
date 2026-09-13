# Metric Registry — condiment/empMeal/unexplained auto-first (closing dispatch #229's own follow-on, 2026-09-13)

Dispatch #229 (2026-09-12, `memory/dispatch-229-metric-registry-unification.md`) routed 32
Signals/Trend Explorer/Scanner metrics through `metric-source.js`'s auto-first resolver, and its
own `AUTO_FIRST_KEY_MAP` comment in `signal-registry.js` named 7 keys with **no matching
`METRIC_SOURCES` chain at all** — `manualRefAmt`, `discCnt`, `promoCnt`,
`baseFoodPct`/`condiment`/`empMeal`/`unexplained`/`discCoupon`/`pLFoodPct`/`pLPaperPct` — and
said building one for any of them was "a follow-on, not something this dispatch does silently."

This closes 3 of those: `condiment`, `empMeal`, `unexplained`. The other 4 FOB-family names
(`baseFoodPct`, `discCoupon`, `pLFoodPct`, `pLPaperPct`) have **no `$` leg loaded anywhere** — no
`qsrFobRows` field, no other auto/emailed stream carries them — so closing them needs new
upstream field research, not a copy of this pattern. Left as-is; not silently expanded into.

## Why these 3 specifically

`qsr_fob` (the auto-pulled stream, `loadQsrFob`/`src/lib/supabase.js`) already carries
`condimentsAmt`/`empMgrMealsAmt`/`unexplainedAmt` — confirmed live in `metric-source.js` since
dispatch #64, used as inputs to `fobTotalAmt`'s 6-way sum. Nothing derived a standalone
percentage from them the way `compWasteAmt`/`rawWasteAmt`/`statVarianceAmt` already do for their
3 siblings (`compWaste`/`rawWaste`/`statVar`). The $ legs existed; only the %-deriving chain was
missing — the exact gap #229's audit found and named.

## What changed

- `src/engine/metric-source.js` — 3 new `METRIC_SOURCES` entries, byte-identical pattern to
  `compWaste`/`rawWaste`/`statVar`: manual `fobRows` field (`condiment`/`empMeal`/`unexplained`,
  the Operations-Report FOB sheet's own precomputed %, `src/parsers/index.js`'s
  `parseFOBData`) stays the first source; `qsrFobRows`'s $ leg ÷ `prodSalesAmt` is the
  auto/emailed fallback, `kind:'ratio'` (rollup-capable via `metricSumRatio`, same as their 3
  siblings).
- `src/engine/signal-registry.js` — 3 new `AUTO_FIRST_KEY_MAP` entries
  (`condiment`/`empMeal`/`unexplained`), and the map's own comment updated to move these 3 off
  the "no chain today" list.
- `src/__tests__/dispatch-229-auto-first-metrics.test.js` — 3 keys added to `DIRECT_SWAP_KEYS`
  (mechanical chain-existence check) + 1 new behavior test reproducing the same live-bug shape
  #229's `oepe` test does: a stale manual FOB upload + fresh `qsr_fob` data — `condiment` now
  surfaces the fresh derived value while the stale manual point survives as the fallback (auto
  **first**, not auto-only).
- `src/__tests__/metric-sum-ratio.test.js` — `rollupCapableMetricKeys()`'s exact-list ratchet
  test extended (16 → 19 keys) and 3 new `RATIO_METRIC_ROWS` entries added, each getting the
  same Sum/Sum-vs-mean-of-daily arithmetic check every other ratio metric in that table gets.

4 new/modified test cases confirmed to fail against pre-fix code (`git stash push --
src/engine/metric-source.js src/engine/signal-registry.js` round-trip, keeping the new tests in
place against the old files).

Full suite 506/506 files, 4820/4820 tests. Build clean, 541.91 KB / 850 KB eager-payload budget
(541.86 → 541.91 KB, +0.05 KB gzipped).
