---
name: dispatch-87
description: The two residual test gaps the engineer self-reported after shipping #628, plus the citation-anchor rule. Small and bounded. #86 is CLOSED -- do not re-dispatch it; this is what is genuinely left of that workstream.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #87 — the residue of #628, and stop citing line numbers

**Reads first:** `memory/dispatch-86.md`'s SHIPPED banner and its `## PM verification` section,
then `memory/dispatch-77.md`'s Resolution.

**Status:** ready. No owner decision. Small — this is deliberately *not* a redo of #628.

---

## 🟢 First, the thing not to do

**Dispatch #86 is CLOSED.** Its work shipped as #628 under the #77 label. The engineer flagged the
overlap before anyone re-ran it, which is the correct behaviour and saved a duplicate build. Two
of its steps landed under different names and are not to be "corrected":

| #86 said | #628 shipped | verdict |
|---|---|---|
| a separate `parts: {num, den}` field | `derive.kind:'ratio'` inside the existing `derive` | **better** — one object, so the marker and the formula cannot drift apart, which was the whole risk `parts:` was invented to manage |
| `metricRollup()` | `metricSumRatio()` | same contract, different name — leave it |
| walk both maps explicitly | `Object.assign(METRIC_SOURCES, DERIVED_METRICS)` already merges them, so one lookup covers both | **verified, not assumed** — exactly what #86 asked for |
| sample real rows to find the 3 denominators | read `loadOpsCashSheet`'s existing inline `amt ÷ net_sales_amt` and reuse it | **stronger** — equal to the stored % by construction, not merely reproducing it |

## Item 1 — pin `metricAvg` against silent absorption

#86's verification bar asked for it, #628 didn't add it, and the engineer said so unprompted.
`metricAvg` was correctly left untouched, but nothing stops a future refactor from quietly folding
it into `metricSumRatio` and moving numbers on ~70 call sites.

Add a test that pins `metricAvg`'s output on a fixture where the two rollups genuinely disagree,
and assert the **mean-of-daily** answer — so the pin fails if anything ever redirects it.

⚠️ Reuse the fixture that already exists in `metric-sum-ratio.test.js` for that disagreement
rather than building a second one; the point is one number, not a new harness.

## Item 2 — per-metric num/den assertions for the other 9

Today `metric-sum-ratio.test.js` has arithmetic blocks for `laborPct` and `discPct` only. The
other nine ratio metrics (`tpph`, `avgCheck`, `cashOSPct`, `tRedAPct`, `tRedBPct`, `compWaste`,
`rawWaste`, `statVar`, `spph`) are covered only by the membership assertion on
`rollupCapableMetricKeys()`.

**The risk is not the summation** — `metricSumRatio` is generic, so if it is right for two it is
right for all. **The risk is a reversed or wrong pair in the declaration**, which is invisible:
`tpph` as `actHrs/gc` instead of `gc/actHrs` produces a plausible-looking number and a silently
wrong ranking. That is a per-metric fact and needs a per-metric assertion.

Cheapest form that actually catches it, table-driven over `rollupCapableMetricKeys()`:

1. `derive.fn(a, b) === a / b` for sample values — pins that `inputs` really is `[num, den]` in
   that order **and** that `fn` is a plain division, not something with a guard that reorders it.
2. For each metric, one fixture where Σ/Σ ≠ mean-of-daily, asserting the hand-computed Σ/Σ.

Table-driven so a newly-marked ratio metric is covered the day it is added, not the day someone
remembers. If a metric can't be fixtured cheaply, **say which and why in the commit body** — do
not silently skip it (`memory/dispatch-85.md` on silent caps).

## Item 3 — convert the remaining line-number citations in the ACTIVE files

The rule is now in CLAUDE.md (*"Cite anchors, not line numbers"*). This dispatch already converted
the `⚠️ ROLLUP CAVEAT` cites in `dispatch-77.md` and `dispatch-86.md`.

**Scope: `dispatch-77.md` only** — it carries **32 `file:NNN` cites**, the most of any file in the
repo, and it is the active reference for this workstream, so its cites are the ones people follow.
Convert them to symbol names or quoted comment phrases.

🔴 **Do NOT sweep the other ~490.** They are archive. The measured reason: correcting a line number
mints a new one that the next PR breaks — #627 fixed `:309-315` to `:349-355` and #628 invalidated
that within hours. A sweep would recreate the problem at scale. Fix one opportunistically when you
are already editing that line; otherwise leave it.

## Verification bar

- Item 1's pin must **fail** if `metricAvg` is redirected to `metricSumRatio`. Verify by actually
  doing it, then reverting — don't assert that it would.
- Item 2 must be table-driven off `rollupCapableMetricKeys()`, and must **fail** if any metric's
  `derive.inputs` pair is reversed. Verify by reversing one, then reverting.
- Item 3: `grep -cE "\.(js|mjs|ts|sql):[0-9]+" memory/dispatch-77.md` goes to 0, and every anchor
  you substitute is greppable — check each one actually resolves.

## Do NOT

- Do **not** re-open or re-implement #86. See the table above.
- Do **not** rename `metricSumRatio` to `metricRollup`, or `derive.kind:'ratio'` to `parts:`.
- Do **not** touch `metricAvg`'s behaviour. Item 1 pins it; it does not change it.
- Do **not** sweep the ~490 archival line cites.
- Do **not** fix the open `avgCheck` sales-basis finding here — it needs the product-sales vs
  all-net-sales gap **measured** first, and then a decision about widening `netSalesAmt`'s chain.
  Recorded in `dispatch-86.md`'s `## PM verification`; owner's call, not this dispatch's.

---

## Resolution (2026-08-24)

All three items shipped, docs-only exemption does not apply here (test code + memory doc), no
production code touched.

### Item 1 — `metricAvg` pinned

New test in `src/__tests__/metric-sum-ratio.test.js`: asserts `metricAvg` returns the
mean-of-daily answer (`0.35`) on the exact laborPct fixture `metricSumRatio`'s own divergence test
already uses (light day 0.10 + heavy day 0.28 vs a flat 0.20 comparator) — reused per the
dispatch's own instruction, no second fixture built.

**Confirmed revert-sensitive by actually doing it, not asserting it would work:** temporarily
edited `metricAvg` to call `metricSumRatio` first and return its value when non-null. Re-ran the
suite — the pin failed, along with 10 other tests in the same file that independently call
`metricAvg` for comparison (expected collateral, not a concern). Reverted; suite green again.

### Item 2 — per-metric num/den assertions for the other 9

`RATIO_METRIC_ROWS` in the same test file maps each of `tpph`, `avgCheck`, `cashOSPct`,
`tRedAPct`, `tRedBPct`, `compWaste`, `rawWaste`, `statVar`, `spph` to the single raw stream/field
pair that supplies both its numerator and denominator legs from one row (traced from each
metric's `derive.inputs` against their own `METRIC_SOURCES` chains — e.g. `tpph`'s `gc`/`actHrs`
both resolve from `qsrActSummaryRows`, so one row with both fields is sufficient). A coverage test
asserts this table plus `laborPct`/`discPct` (already tested before this dispatch) accounts for
every key `rollupCapableMetricKeys()` returns, so a newly-marked ratio metric fails loudly if
nobody adds it here.

Two assertions per metric, table-driven:
1. `derive.fn(7, 3) === 7/3` — pins that `fn` is a plain division of its own inputs.
2. An uneven-volume fixture (light day num=10/den=100, heavy day num=400/den=1000) asserting
   `metricSumRatio` matches the **semantically correct** `(10+400)/(100+1000)` — built from what
   the numerator and denominator actually *mean* for that metric (e.g. `gc/actHrs` for TPPH, not
   whichever order happened to be convenient), not merely from `derive.inputs`' own order. This is
   the assertion that actually catches a reversed pair — check 1 alone would still pass if both
   `inputs` and `fn`'s params were reversed together, since `fn` would still be "a plain division
   of its two args."

**Confirmed revert-sensitive by actually reversing one, not asserting it would fail:** temporarily
swapped `tpph`'s `derive.inputs` from `['gc','actHrs']` to `['actHrs','gc']` (leaving `fn`
unchanged, so it now computes `actHrs/gc` instead of `gc/actHrs` — a genuine reversed-pair bug,
not a cosmetic one). Re-ran the suite: **exactly one test failed** — `tpph`'s own arithmetic
assertion, no collateral damage to the other 8 metrics' tests or to check 1's `fn(7,3)` assertion
(which still passes on a reversed pair, confirming it alone would NOT have caught this — check 2
is load-bearing). Reverted; suite green again.

30 tests total in `metric-sum-ratio.test.js` now (up from 10): the original 10, the new
`metricAvg` pin, a coverage check, and 2×9=18 table-driven assertions.

### Item 3 — anchors, not line numbers, in `dispatch-77.md`

Converted all **28** `file:NNN`-style citations (`grep -cE "\.(js|mjs|ts|sql):[0-9]+"` — matching
the dispatch's own verification command exactly — now returns `0`), plus **7** additional
`(:NNN-NNN)`-style citations in the Resolution section's own source-sweep table that the literal
grep bar doesn't catch but are the identical rot (a parenthetical line range next to a
backtick-wrapped filename). Converting these too was judged in-scope: same file, same failure
mode, found while reading the file end-to-end rather than grep-and-stop — consistent with this
session's own repeated "the dispatch's own count undercounts, a full sweep finds more" pattern.

Every substituted anchor was **measured against the current source, not assumed from the
original citation** — several had already drifted since the citations were written a day earlier
(e.g. `store-dash.js:1756`'s `metCol` helper is inside `StoreCard`, not the function the original
line number implied without a name; `at-a-glance.js:1453-1470`'s `higherBetter` table had moved
~30 lines to a `lbData` memo's `META` object). Anchors landed on: `UnifiedTargetsPanel`/
`RankingView`'s two distinct local `METRICS` tables in `store-dash.js` (previously conflated under
one bare `store-dash.js` citation, now named apart since they disagree with each other — the
whole point of this doc); `analytics.js`'s `CORR_PREDICTORS` and target-definitions array;
`one-pager-data.js`'s `buildCurrentState`; `analytics.js`'s `kpiRow`/`metLbl`/`deltaColor`;
`store-dash.js`'s `StoreCard`'s `metCol`; `one-pager.js`'s `StateGrid`/`PerLocationTable`'s
`cell`; `utils/stats.js`'s `bestQuartile`; `metric-source.js`'s `r2p` chain comment;
`panel-registry.js`'s `id:'security'` entry; the `Bar` component (`visit-readiness.js`);
`store-analytics.js`'s `MultiStoreComparison`'s local `METRICS`/`getBest()`; `at-a-glance.js`'s
`lbData` leaderboard `META` object; `bullseye-tile.js`'s `METRICS` object; and the
`chart.js/auto` imports in `store-dash.js`/`dt-speedofservice.js`.

**Every anchor confirmed greppable** against the actual current source (not just plausible-looking
— each was checked with a real `grep -c` against the file it names) before considering this item
done, per the dispatch's own verification bar.

**No fourth-in-two-days finding to flag.** Read every citation site's current code while
converting it; nothing else was found stated-as-true-but-now-false in this file. (The count stands
at the five #86's `## PM verification` already recorded — this dispatch didn't add a sixth.)

### What was deliberately NOT done

- `#86` was not re-implemented. See its own table of "what shipped under a different name."
- `metricAvg`'s behavior was not changed — Item 1 is a pin, not a fix.
- The other ~490 archival `file:NNN` citations across the repo were not swept — scope was
  `dispatch-77.md` only, per the dispatch's explicit instruction and the measured reasoning
  (correcting a line number mints a new one the next PR breaks; a sweep would recreate the problem
  at scale, not solve it).
- The open `avgCheck` sales-basis finding (`dispatch-86.md`'s `## PM verification`) was not
  touched — it needs a measurement (product-sales vs all-net-sales gap size) this environment
  can't perform (anon key, zero rows under RLS) before any decision about widening `netSalesAmt`.

### Verification

`npx vitest run`: 2209/2209 (up from 2189 — 20 new tests: 1 metricAvg pin + 1 coverage check + 18
table-driven). `npm run build`: clean; eager payload 518.32 KB gzip (850 KB budget, 331.68 KB
headroom) — no production code changed, so no shift from #628's own numbers.
