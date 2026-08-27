---
name: audit-emailed-stream-redundancy-2026-08-27
description: Dispatch #165 -- audit of suspected redundancy between the three emailed QSRSoft streams (daily_glimpse_daily / sales_ledger_daily / cash_sheet_daily) and their API-pulled siblings from qsrsoft-ops-pull.mjs. Per-metric METRIC_SOURCES chain analysis + live service-role measurements, per-stream verdicts, and the one contained fix (dtMixPct) landed alongside it.
metadata:
  type: audit
---

# Audit: redundancy of the three emailed QSRSoft streams (#260, closed)

**Dispatch #165.** This closes CLAUDE.md's "#260" reference ("Suspected redundancy in the current
three emailed streams is being audited in #260"). Audit-and-report only, as scoped — no stream,
pull script, or table was disabled or deprecated. One small, contained bug found and fixed in the
same PR (dtMixPct's missing fallback); everything else is reported, not touched.

**Credential used throughout:** `SUPABASE_SERVICE_ROLE_KEY` (an `sb_secret_...` value, present in
this session's environment) against `VITE_SUPABASE_URL` via the PostgREST `/rest/v1/` API, using
`apikey` + `Authorization: Bearer` headers. Every count below is a real `content-range` or a real
row payload, not an inferred number -- restated inline per CLAUDE.md's "a live-data claim must
name the credential and the observation" rule.

## The three emailed streams and their nearest API sibling

| Emailed (`qsrsoft-email-parse.mjs`, forward-only from 2026-07-01) | `ds` field | API-pulled sibling (`qsrsoft-ops-pull.mjs`, floor 2024-01-01) |
|---|---|---|
| `daily_glimpse_daily` | `glimpseRows` | `qsr_cash_sheet` (cash/promo/refunds) + `qsr_service_stats` (OEPE/KVS/park) |
| `sales_ledger_daily` | `salesLedgerRows` | `qsr_sales_mix` (channel breakdown) |
| `cash_sheet_daily` | `cashRows` | `qsr_cash_sheet` (cash/refunds) |

Both families ultimately read the same underlying QSRSoft reports (Daily Glimpse / cash-sheet /
cash-sheet-extract), pulled two different ways: one parsed server-side from an emailed CSV, the
other pulled directly from the reporting API on a daily GitHub Action. This is why field-level
reconciliation below is so often exact -- when it matches, it isn't a coincidence, it's the same
report read twice.

## 1. Live row-count / date-coverage measurement (reproducing #347's pattern, today)

Total rows + date range, measured 2026-08-27:

| table | rows | date range |
|---|---|---|
| `daily_glimpse_daily` | 1,431 | 2026-07-01 .. 2026-08-25 |
| `sales_ledger_daily` | 1,512 | 2026-07-01 .. 2026-08-25 |
| `cash_sheet_daily` | 1,431 | 2026-07-01 .. 2026-08-25 |
| `qsr_sales_mix` | 25,042 | 2024-01-01 .. 2026-08-27 |
| `qsr_cash_sheet` | 25,042 | 2024-01-01 .. 2026-08-27 |
| `qsr_service_stats` | 24,866 | 2024-01-01 .. 2026-08-25 |
| `qsr_daily_activity_rollup` | 25,036 | -- |
| `qsr_labor_summary` | 25,062 | -- |

1,512 = 56 days x 27 stores exactly (`sales_ledger_daily`'s full expected count for its window).
`daily_glimpse_daily` and `cash_sheet_daily` are both **81 rows short of that** (1,431 = 53 days x
27) -- the API siblings all run 2024-01-01 forward, confirming CLAUDE.md's backfill rule: the
2026-07-01 floor is a stream artifact, not a data floor.

**Where the 81-row gap is:** per-date breakdown (`select=loc,date`, full August + July windows)
shows `daily_glimpse_daily` and `cash_sheet_daily` **both missing all 27 stores for 2026-07-02,
07-03, and 07-04** -- zero rows on any of those three dates in either table. `sales_ledger_daily`
has full 27-store coverage for the same three days (confirmed: 31 distinct dates in July, none
short). August (08-01 .. 08-25) is fully covered in all three emailed tables (25 dates x 27 stores
each, no short days) -- this gap is historical, not current-day.

**The API siblings already close it.** `qsr_cash_sheet`, `qsr_service_stats`, `qsr_sales_mix`, and
`qsr_daily_activity_rollup` were each queried for 2026-07-01 .. 07-06 and every one returned the
full 27 stores on 07-02/07-03/07-04 with real field values (spot-checked `qsr_cash_sheet` row for
loc `0003708`, dt `2026-07-03`: `promo_amt: 239.03, cash_over_or_short: -9.85, net_sales_amt:
12405.63`, not a placeholder/null row). This is the exact #347 pattern (`memory/pm-handoff-
2026-08-15.md`'s corrections register: *"sales_ledger_daily measured at zero rows for Aug 12-16
while qsr_sales_mix held 135 rows for the same window... the data was never missing"*) reproducing
live, on a different table pair, on 2026-08-27. Per CLAUDE.md's backfill standing rule this is not
a gap to file -- it's already closed by the sibling stream; noted here as the clearest evidence for
why these streams are largely redundant, not as an open item.

## 2. Field-level reconciliation (same report, two pull paths -- do the numbers actually agree?)

Reconciliation is NOT uniform across fields. Measured on real rows, several ways:

### Exact matches (safe to treat as fully interchangeable)

- **`sales_ledger_daily` channel-mix fields vs `qsr_sales_mix`** -- checked on two separate days
  (2026-07-03 and 2026-08-01, store `3708`), every shared field matched to the cent:
  `dtSales`==`net_sales_dthru_amt` (8311.22), `dtGC`==`net_sales_dthru_qty` (743), `bfSales`==
  `net_sales_bfast_amt` (3707.04), `bfGC`==`net_sales_bfast_qty` (347), `kioskSales`==`kiosk_amt`
  (577.80), `mopSales`==`mobile_amt` (1878.38, confirming "mop" = mobile order & pay), `delivSales`
  ==`delivery_amt` (1155.21), `eatInSales`==`net_sales_eatin_amt` (667.39), `allNetSales`==
  `net_sales_amt` (11555.94). `dtPctTotal` (0.7192) == `net_sales_dthru_amt / net_sales_amt`
  exactly. `inStoreSales` (3244.72) == `net_sales_amt - net_sales_dthru_amt` exactly (derivable,
  not a raw field on either side). `fcSales`/`fcPctTotal` have no obvious 1:1 raw counterpart in
  `qsr_sales_mix` and were not reconciled -- not currently read by any METRIC_SOURCES chain either
  way, so this doesn't affect the verdict below.
- **`glimpseRows.promoAmt` vs `qsr_cash_sheet.promo_amt`** -- 133 of 135 store-days matched exactly
  (27 stores x 5 days, 2026-08-10..08-14).
- **`glimpseRows.posOverAmt` vs `qsr_cash_sheet.overring_amt`** -- 132 of 135 matched exactly, and
  `posOverCnt`==`overring_qty` matched on the same sampled row (17==17) -- confirms "overring" is
  QSRSoft's own name for what Meridian calls "POS Over."

### Partial / imperfect reconciliation (NOT safe to treat as redundant without more work)

- **`glimpseRows.cashOS` vs `qsr_cash_sheet.cash_over_or_short`** -- only **1 of 135** sampled
  store-days matched (same window/stores as above). This is not noise -- it's a near-total,
  systematic disagreement between two fields that are conceptually "the same number." Neither
  side was investigated further (out of this audit's scope); flagged as a genuinely unresolved
  discrepancy, not evidence of redundancy.
- **`cashRows.cash_os` (from `cash_sheet_daily`) vs `qsr_cash_sheet.cash_over_or_short`** -- 101 of
  135 matched (75%), max observed diff 2,592 (one outlier day/store, not investigated).
- **`cashRows.posOverAmt` vs `qsr_cash_sheet.overring_amt`** -- 106 of 135 (79%).
- **`cashRows.cashRefAmt` vs `qsr_cash_sheet.cash_refunds_amt`** -- only 60 of 135 (44%) -- the
  weakest reconciliation measured in this audit.

The pattern: **channel-mix ($ sales split) and promo/POS-over fields reconcile essentially
exactly; cash-handling fields (cash O/S, refunds) do not**, and the emailed `cash_sheet_daily`
reconciles worse against the API source than `daily_glimpse_daily` does on the same conceptual
fields. This is the same shape as the already-documented `laborPct` gap (#327: crew-labor-$-over-
DAR-sales derive matches Glimpse's real Punched Labor % only 89.8% of the time, day-specific, not
per-store) -- a real, measured, non-trivial disagreement between two pull paths of "the same"
number, not yet explained. Do not read the cash-field percentages above as "mostly redundant" --
79% match with a 2,592-unit outlier is a live discrepancy, not rounding noise.

## 3. METRIC_SOURCES chain analysis -- is each stream ever actually REACHED, and by what

Read in full from `src/engine/metric-source.js`. Every chain that names `glimpseRows`, `cashRows`,
or `salesLedgerRows`:

| metric | chain order (first wins) | emailed stream's real role |
|---|---|---|
| `gc` | qsrActSummaryRows (DAR) → **glimpseRows** → laborRows (manual) | Redundant in practice -- DAR is auto-pulled daily and backfillable; Glimpse only wins on a DAR gap. |
| `oepe` | **glimpseRows** → qsrActSummaryRows (DAR-derived) → opsServiceRows (API) → opsRows (manual) | Glimpse checked FIRST, but the code's own comment cites an r=0.9958 reconciliation against DAR -- functionally interchangeable with the two API fallbacks beneath it, so losing Glimpse would not create a gap. |
| `kvst`, `kvsHealthy`, `park` | **glimpseRows** first, then opsServiceRows (API) / qsrActSummaryRows (DAR), then manual | Same shape as `oepe` -- full API backstop already in the same chain. |
| `laborPct` | **glimpseRows** → ctrlRows (manual) → laborRows (manual), *then* a derive (crew$/DAR sales) | **Not redundant.** The derive is the only non-manual, non-Glimpse path, and it only matches Glimpse 89.8% of the time (#327, measured). Losing Glimpse measurably degrades this metric on ~10% of days. |
| `cashOSPct` / `cashOSAmt` | **glimpseRows** → **cashRows** → opsCashRows (API) / ctrlRows (manual), plus a derive | **Not provably redundant** -- see §2's cash-field reconciliation numbers above. Both emailed sources sit ahead of the API source and a derive, but the three do not agree closely enough to say any one safely substitutes for another. |
| `cashRefAmt`/`Cnt`, `cashlessRefAmt`/`Cnt` | opsCashRows (API) → **cashRows** → ctrlRows (manual) | API source already checked FIRST here -- `cashRows` is a fallback of a fallback. Given §2's 44% cash-refund reconciliation, this ordering (API first) already reflects the right caution; no change needed. |
| `posOverAmt`/`Cnt` | **glimpseRows** → **cashRows** → ctrlRows (manual) | No API entry in this chain at all, despite `qsr_cash_sheet.overring_amt` reconciling 97%+ against Glimpse (§2). A same-shape fix to the one below is possible future work -- not done here (see §5). |
| `promoAmt`/`promoPct` | **glimpseRows** → ctrlRows (manual) | Same story as posOver -- no API entry despite a 98% field-level match, and `qsr_cash_sheet.promo_amt` is not even aliased to camelCase in `loadOpsCashSheet` yet. Flagged, not fixed. |
| `avgCheck` | **glimpseRows** → **cashRows** → **salesLedgerRows** → laborRows (manual), plus a derive (sales/gc, DAR-based) | Three emailed sources stacked ahead of an always-available DAR-based derive. Functionally low-risk to reorder, but not touched -- out of this audit's contained-fix bar. |
| `dtMixPct` | **salesLedgerRows** → laborRows (manual) — **NO auto/API fallback at all** | **Fixed in this dispatch** -- see §4. This was the one chain matching the dispatch's own example of a genuine, contained bug: a metric whose only non-manual source is an emailed stream, with zero API backstop, despite an already-reconciling sibling sitting unwired in the same codebase. |
| `empMealAmt`/`mgrMealAmt`/`empMealCnt`/`mgrMealCnt` | **glimpseRows** → ctrlRows/auditRows (manual) | `qsr_cash_sheet` DOES carry `emp_meal_discount_amt`/`mgr_meal_discount_amt` in its raw payload (confirmed in the §2 sample rows), but no chain reaches it and no camelCase alias exists. Same class of gap as promo/posOver -- flagged, not fixed. |
| `digitalPctSales`, `appPctSales`, `kvsItems`, `brkCarCnt`/`luCarCnt`/`dnCarCnt` (Glimpse); `doorDashSales`/`uberEatsSales`/`grubhubSales`, `mopEatIn`/`mopTakeout`, `kioskEatIn`/`kioskTakeout` (cash_sheet_daily) | Not in METRIC_SOURCES at all | These fields are read by NEITHER a chain nor (as far as this audit found) any API-pulled sibling -- `qsr_sales_mix`/`qsr_cash_sheet` have no 3rd-party-delivery-vendor split or eat-in/takeout split, and no per-daypart car counts. If genuinely unique, they're unique-but-currently-unused; "redundant" doesn't apply either way since nothing resolves them through the shared resolver today. |

A separate, already-shipped, PANEL-LOCAL precedent for the exact fix below already exists:
`src/views/at-a-glance.js`'s `mixToChannelShape()` (dispatch #11) already maps `qsr_sales_mix`
onto the same shape `salesLedgerRows` produces, for the Digital Sales tile specifically, and its
own comment already states the #347 finding almost verbatim. That fix bypasses `metric-source.js`
entirely (a local `mergeFresh` merge inside one panel) -- which is itself a mild violation of
CLAUDE.md's "source data through the shared helpers" standing rule, though out of scope to change
here. It's strong independent evidence the field mapping used in §4's fix is correct and
owner-endorsed, since it already shipped once.

## 4. The one fix landed alongside this audit

**`dtMixPct`** (DT % of sales, read by `src/views/store-analytics.js`'s `metricSeries(ds, loc,
range42, 'dtMixPct')`) had `salesLedgerRows` as its *sole* non-manual source -- zero API fallback,
the exact single-point-of-failure #347 already found once for this same table. Given §2's exact
field-level reconciliation between `salesLedgerRows` and `qsr_sales_mix` (already loaded into `ds`
as `opsSalesMixRows`, currently used by nothing in `metric-source.js`), this was squarely a
"small, contained bug" per this dispatch's own charter -- not "ordered wrong," but "missing
entirely," which is the more severe version of the same failure mode.

Changes:
- `src/lib/supabase.js` -- `loadOpsSalesMix` now aliases `dtSalesAmt`/`netSalesAmt` (camelCase) on
  top of the existing raw snake_case spread, mirroring `loadOpsCashSheet`'s existing pattern.
- `src/engine/metric-source.js` -- two new chain entries (`dtSalesAmt`, `mixNetSalesAmt`, both
  sourced from `opsSalesMixRows`) and a `kind:'ratio'` derive added to the existing `dtMixPct`
  chain, so it now falls back to `dtSalesAmt / mixNetSalesAmt` on any day neither
  `salesLedgerRows` nor `laborRows` covers. `srcs` are still checked first -- no behavior change on
  a day either existing source already answers.
- `scripts/gen-loader-emits.mjs` -- added `opsSalesMixRows: 'loadOpsSalesMix'` to the `LOADERS`
  map so the chain-validation test's field list stays derived, not hand-maintained; regenerated
  via `node scripts/gen-loader-emits.mjs --write` (ran live against Supabase, observed real
  columns).
- `src/__tests__/metric-sum-ratio.test.js` -- added `dtMixPct` to `rollupCapableMetricKeys()`'s
  expected list and to `RATIO_METRIC_ROWS` (gets the same derive.fn/Sum-Sum-vs-mean-of-daily test
  coverage every other ratio metric in that file has).

## 5. Explicitly NOT fixed (future work, flagged not chased)

- **`promoAmt`/`promoPct` and `posOverAmt`/`posOverCnt`** -- same shape as the `dtMixPct` fix
  (a real field on `qsr_cash_sheet`, 97-98% reconciled, needs a camelCase alias in
  `loadOpsCashSheet` plus a chain entry/derive). Left separate to keep this PR's blast radius
  contained to one metric; a natural next dispatch.
- **`empMealAmt`/`mgrMealAmt`/counts** -- same class of gap; `qsr_cash_sheet` carries the raw
  fields but they were not reconciliation-tested in this audit (unlike promo/posOver), so a fix
  here should re-verify field-level agreement first, the same way §2 did for the others.
- **Cash O/S and refund fields** (`cashOSAmt`/`cashOSPct`, `cashRefAmt`/`Cnt`,
  `cashlessRefAmt`/`Cnt`) -- explicitly NOT a redundancy candidate. §2's numbers show real,
  unexplained disagreement between all three pull paths on these specific fields. Investigate the
  disagreement itself before touching any chain ordering here.
- **Deprecating any of the three emailed streams, their pull script, or their tables** -- out of
  scope by dispatch charter; a hard-to-reverse action needing explicit owner sign-off, not an
  audit-and-report deliverable.

## Verdict per stream

- **`sales_ledger_daily` -- mostly redundant (with the fix above), for the fields actually routed
  through the shared resolver.** Its one load-bearing chain (`dtMixPct`) now has a full,
  byte-exact API fallback. `avgCheck` (its other chain entry) sits behind two other emailed
  sources and a DAR-based derive already. No current coverage gap in the audited window, but its
  own floor (2026-07-01) makes it entirely dependent on `qsr_sales_mix` for anything earlier --
  which already has the data (2024-01-01 forward).
- **`daily_glimpse_daily` -- partially redundant, metric by metric.** `gc`, `oepe`/`kvst`/
  `kvsHealthy`/`park` are already fully backstopped by API/DAR sources in the same chain (safe to
  treat as redundant today). `promoAmt`/`promoPct`/`posOverAmt`/`posOverCnt` are redundant *in
  value* (97-98% exact match) but not yet redundant *in the chain* (no fallback wired) --
  low-risk future work. `laborPct` and `cashOSAmt`/`cashOSPct` are genuinely NOT redundant:
  laborPct's derive-based alternative measurably underperforms Glimpse (89.8% match), and
  cashOSAmt's API alternative essentially never agrees with Glimpse's own number (1/135) for
  reasons this audit did not chase down.
- **`cash_sheet_daily` -- the weakest redundancy case of the three.** Its cash-handling fields
  (cash O/S, refunds) reconcile worse against `qsr_cash_sheet` than Glimpse's do (44-79% vs
  97-98%), so treating them as safely redundant would be premature. Its 3rd-party-delivery-vendor
  and eat-in/takeout-split fields have no counterpart in any API-pulled stream this audit found --
  potentially genuinely unique, though currently unused by any METRIC_SOURCES chain either way.

Per CLAUDE.md's "API over email" standing rule, this audit's findings are consistent with an
eventual retirement of the emailed pipeline in favor of the API one *for the fields that reconcile
cleanly* -- but the cash-handling discrepancy in §2 is a real, open question that should be
resolved BEFORE anyone decides to act on that, not waved through by this report.
