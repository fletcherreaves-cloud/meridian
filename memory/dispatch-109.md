---
name: dispatch-109
description: Owner's Performance Review metric batch, checked against the real review-engine.js/performance-reviews.js code before scoping (not assumed). Mixed findings -- some asks are already-wired (Digital App GC/Rest/Day, Delivery GC/Rest/Day, Shift Cert Managers, Headcount, 0-90 Crew Turnover actuals all already flow into autoPopulateKPIs), some are real gaps (Delivery Wait Time actual+target unwired, Labor% bypasses the app's own auto-first metric-source.js standard, Total Profit's derivation function exists and is tested but never called, none of the 6 newer metrics have a target auto-fill mapping), and a structural discovery (no ingestion path exists anywhere for 5 of the underlying Supabase tables -- must be measured live before any of this is presented as "now showing real data").
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #109 — Performance Review: wire the gaps, fix the stale ones, confirm what already works

## Owner's ask, in full

- *"For Performance Reviews > Need to add metric for Delivery Wait Time (Actual and Target) I believe already being pulled, if not let me know."*
- *"Digital App GC/Rest/Day, Delivery GC/Rest/Day > same as above"*
- *"Labor % and targets are in the app, lets get these wired right"*
- *"Note for all months previous to April, I have not uploaded targets > We have discussed previously. I can give some targets and we can use a combination of those and actuals"*
- *"Total profit > A calculation of other 3 metrics in Profitability tab on review"*
- *"Shift Cert Managers, Total Headcount, 0-90 crew turnover all in yearly targets, and we should have data pulls for actuals > wire up"*
- *"# Shift Verifications by GM and Execution of Retention Prg. > Not currently using. > can wire up later"*
- *"Need to pre wire any other metric that can or could be selected to include in customizing review form"*

**A background investigation (not a live engineer) checked every one of these against the real
code before this dispatch was written** — several are already built, several are real gaps, and one
is a structural issue this dispatch's fixes all run into. Read this whole dispatch before assuming
any item is a straightforward "wire it up."

## ⚠️ CORRECTION (PM, 2026-08-24, after this dispatch was already in progress) — the "no ingestion
path" claim below was WRONG. Real automated pulls exist and are populating these tables TODAY.

The original structural finding (kept below, struck through in spirit not in markdown, for the
record) claimed no ingestion path exists for `digital_app_monthly`/`mcdelivery_monthly`/
`roster_statistics`/`roster_role_counts`/`turnover_monthly`. **That was based on an incomplete
grep** (searched `src/views` and general `.mjs` script content, but missed the actual pull
scripts' filenames). Directly queried production with the service-role credential
(`content-range` header, not a guess) and found:

| table | row count | most recent `updated_at` |
|---|---|---|
| `digital_app_monthly` | 214 | 2026-08-24, real varied values |
| `mcdelivery_monthly` | 214 | 2026-08-24 |
| `roster_statistics` | 214 | 2026-08-24 |
| `roster_role_counts` | 214 | 2026-08-24 |
| `turnover_monthly` | 370 | 2026-08-24, multi-month history back to April |

Real, varied, current numbers — not placeholders, not a single test row repeated. The actual
ingestion scripts are `scripts/qsrsoft-digital-app-pull.mjs`, `scripts/qsrsoft-mcdelivery-pull.mjs`,
`scripts/qsrsoft-roster-stats-pull.mjs`, `scripts/qsrsoft-employee-roster-pull.mjs`,
`scripts/qsrsoft-turnover-pull.mjs` — each with its own scheduled GitHub Actions workflow (e.g.
`qsrsoft-mcdelivery-pull.yml` runs daily at 12:00 UTC / ~7am CDT). **These are real, live,
already-automated pulls, already watched per CLAUDE.md's sync-failure-watch checklist** (verify
that specifically if scoping any further work here, but do not re-raise "does an ingestion path
exist" — it does).

**Revised implication for this dispatch:** items #2 and #6's "actuals already flow" claim is now
CONFIRMED, not merely plausible-pending-verification — the data is real and current. The remaining
work for those items is exactly what the dispatch already scoped: the missing
`REVIEW_METRIC_TARGET_FIELD` mappings and the stale `src:'manual'` config metadata, nothing more.
**Do not spend further effort re-checking whether these 5 tables have data — they do.** If you
already verified this independently before reading this correction, good — this just confirms it
in the written record for whoever reads this file next.

## Original structural finding (superseded by the correction above — kept for the record)

`review-engine.js` never imports `metric-source.js`. Its `autoPopulateKPIs()` is a separate,
hand-rolled sourcing mechanism (`byMonth`/`byLocMonth` closures reading raw `ds.<rows>` arrays)
that predates the app's own standing auto-first rule (CLAUDE.md: *"Source data through the shared
helpers — never filter raw rows for a metric... Use `metric-source.js`'s
`metricDaily`/`metricSeries`/`metricAvg`"*). This part of the finding still stands — it's the
ingestion-path claim right below it that was wrong.

~~Several of the metrics below already read from real Supabase tables (`digital_app_monthly`,
`mcdelivery_monthly`, `roster_statistics`, `roster_role_counts`, `turnover_monthly`) via loaders
already wired in `App.js` — but no ingestion path (upload UI or automated pull) exists anywhere in
the codebase that writes to any of these five tables. Grepped the full `src/views` tree and every
`.mjs` script; found none. This means the read-side code is real and correct, but these tables may
hold zero rows in production — the auto-populate could be silently doing nothing today, not
because of a bug, but because there's no data to read.~~ **See the correction above — wrong.**

## Per-item findings and scope

### 1. Delivery Wait Time — real gap, both actual and target unwired

**Actual data exists but isn't used.** `mcdelivery_monthly` (`saveMcdeliveryMonthly`/
`loadMcdeliveryMonthly`, `src/lib/supabase.js`) carries `mcdelivery_time_sec`/`restaurant_time_sec`
(→ `mcDeliveryTimeSec`/`restaurantTimeSec`), sourced from `people-reports.js`'s
`parseMcDelivery3PO()`/`parseMcDelivery3POApi()`. `App.js` loads it into `ds.mcdeliveryRows`. But
`autoPopulateKPIs()` only reads `dlv.deliveryGcRd` off that same row — never
`mcDeliveryTimeSec`/`restaurantTimeSec`. The review's `delivWait` metric
(`DEFAULT_REVIEW_CONFIG.metrics.rgr`) is still `src:'manual'` with a hardcoded
`'Target = 240 sec (4 min)'` note, and the methodology modal documents it as manual entry.

**Scope:** wire `delivWait` in `autoPopulateKPIs()` to read `restaurantTimeSec` (or
`mcDeliveryTimeSec` — confirm which one matches "Delivery Wait Time" against
`people-reports.js`'s own field semantics before picking) from `ds.mcdeliveryRows`, flip
`src:'auto'`. For the target: `ds.targets` already carries `tMcdWait` (yearly workbook, dispatch
#107) but `REVIEW_METRIC_TARGET_FIELD` has no `delivWait` entry — add
`delivWait: 'tMcdWait'`. **Verify `mcdelivery_monthly` has real rows in production first** (the
structural finding above) — if it's empty, say so and scope the ingestion gap as a separate,
explicit follow-up rather than declaring this "wired" when it will show blank in practice.

### 2. Digital App GC/Rest/Day, Delivery GC/Rest/Day — actuals ALREADY wired; targets are the real gap

**Correct the owner's premise here — the actual side already works**, unlike Delivery Wait Time.
`digital_app_monthly`/`mcdelivery_monthly` carry `app_gc_rd`/`delivery_gc_rd`, and
`autoPopulateKPIs()` already reads both (`mo.digitalGC = dig.appGcRd`, `mo.delivGC =
dlv.deliveryGcRd`), with both config metrics already `src:'auto'`. **Do not rebuild this.**

Two real things to fix:
- **Stale UI documentation**: `performance-reviews.js`'s methodology modal still lists both under
  "Manual Entry Required" even though the code auto-fills them. Fix the copy to match reality.
- **No target mapping**: same gap as Delivery Wait Time — `ds.targets` already has
  `tDigAppGCRD`/`tMcdGCRD` (dispatch #107), but `REVIEW_METRIC_TARGET_FIELD` doesn't map
  `digitalGC`/`delivGC` to them. Add both mappings.
- **Same "verify live data exists" caveat as #1** — the read path is real, but confirm
  `digital_app_monthly`/`mcdelivery_monthly` actually have rows before calling this done.

### 3. Labor % and targets — target side is fine; actual side bypasses the app's own standard

Target: `REVIEW_METRIC_TARGET_FIELD.labor = 'tLabor'` already correctly wires to
`mergedTargetsForLoc()` (yearly-then-monthly precedence). **Leave this alone.**

Actual: `autoPopulateKPIs()` reads Labor % **exclusively from `ds.laborRows`** — the manual Labor
Excel upload — never through `metric-source.js`'s `laborPct` chain, which is explicitly auto-first
(glimpse → controls → labor-upload, plus a derive fallback) and whose own header comment documents
the exact failure mode this bypass reproduces (a real incident: labor_rows stale while the auto
stream had current data for all 27 stores). The same bypass pattern applies to `oepe`/`r2p`/`kvs`
in the same function, sourced only from `ds.opsRows`. **Scope:** repoint these four metrics'
actual-sourcing in `autoPopulateKPIs()` to call `metric-source.js`'s `metricAvg(ds, loc, range,
'laborPct'/'oepe'/'r2p'/'kvst')` instead of hand-filtering `ds.laborRows`/`ds.opsRows` directly —
this is the CLAUDE.md-mandated pattern, and it directly satisfies "let's get these wired right."
Verify the review's month-range shape is compatible with `metricAvg`'s expected `range` argument
before assuming a drop-in swap; adapt if not.

### 4. Pre-April targets — real design gap, needs an owner decision on mechanism, not just code

Confirmed: **no month-aware target fallback exists anywhere.** `mergedTargetsForLoc()` and
`tolMergedTarget()` are both flat, non-month-aware 3-way spreads (DEFAULT_TARGETS < `ds.targets` <
`ds.monthlyTargets`) — neither takes a date/month argument, and `autoPopulateKPIs()` computes the
merged target object **once, outside the per-month loop**, applying one snapshot uniformly across
the whole review period. `ds.allMonthlyTargets` (the real per-month history, already used by the
Planning > Yearly panel) is never consulted by either review function.

The owner's own proposed fix — *"I can give some targets and we can use a combination of those and
actuals"* — describes blending a manually-supplied target with real actuals for the pre-April
gap, which is a genuine design choice (how exactly should a partial/manual target combine with
measured actuals month-to-month?), not something to invent unilaterally. **Scope:** build the
month-aware lookup (route through `ds.allMonthlyTargets` keyed by year-month, matching how Planning
> Yearly already does it, instead of the current single-snapshot merge) so a target that exists for
some months and not others behaves correctly per month — that part is a clear code fix. **Then ask
the owner directly** what "a combination of those and actuals" should mean operationally for the
specific months with no uploaded target (a flat number they'll supply per store? an estimate
derived from nearby months' actuals? something else) before building the fallback-value logic
itself — don't guess the blending rule.

### 5. Total Profit — the hard part is already built; this is a pure wiring task

`review-engine.js` already exports `deriveTotalProfitVsTarget({fobPctActual, fobPctTarget,
laborPctActual, laborPctTarget, opSuppliesActual, opSuppliesTarget, netSales, prodSales})` —
computes exactly `Σ (target − actual) × basis` across the Profitability tab's other 3 controllable
metrics (`foodOB`, `labor`, `opSupplies`), matching the owner's ask verbatim ("a calculation of
other 3 metrics in Profitability tab"). It is unit-tested
(`src/__tests__/review-target-autofill.test.js`) but **never called** from `autoPopulateKPIs()` or
`performance-reviews.js` — confirmed by grep, zero call sites outside its own test. **Scope:** wire
it into `autoPopulateKPIs()`, computing `totalProfit`'s auto-filled actual/target from the other
three's already-resolved monthly values, and flip `totalProfit`'s config `src` from `'manual'` to
`'auto'`. No new formula design needed — reuse the existing, already-correct function.

### 6. Shift Cert Managers, Total Headcount, 0-90 Crew Turnover — actuals ALREADY wired; targets are the gap; config metadata is stale

**Actuals already flow.** `roster_statistics`→`rosterActive` (headcount), `roster_role_counts`→
`shiftMgr` (shift-certified managers), `turnover_monthly`→`turnover090Pct` — all three loaded into
`ds` by `App.js` and already consumed by `autoPopulateKPIs()` (`mo.headcount`, `mo.shiftCert`,
`mo.turnover90`). **Do not rebuild the read side.**

Two real gaps:
- **Config metadata is stale**: `DEFAULT_REVIEW_CONFIG.metrics.people`'s `headcount`/`shiftCert`/
  `turnover90` are still declared `src:'manual'` even though the code already auto-fills them —
  flip to `src:'auto'` to match reality (this alone may fix a UI element that hides/shows an
  "auto-filled" badge or similar; check how `src` is consumed in the render before assuming it's
  purely cosmetic).
- **No target mapping**: despite dispatch #107 landing `tShiftLeaders`/`tHeadcount`/`tToCrew090`
  into `ds.targets`, `REVIEW_METRIC_TARGET_FIELD` has no entries for `shiftCert`/`headcount`/
  `turnover90`. Add all three mappings (confirm `tShiftLeaders` is the right target field for
  "Shift Cert Managers" — the naming isn't a perfect match, verify against the yearly workbook's
  own column header, "Shift Leader Target", before assuming it's the same concept as
  shift-*certified* managers; if it's actually a different field, say so rather than wiring a
  mismatch).
- **Same "verify live data exists" caveat as #1/#2** for `roster_statistics`/`roster_role_counts`/
  `turnover_monthly` — check real row counts before calling this "now showing real numbers."

### 7. Shift Verifications by GM, Execution of Retention Prg. — confirmed correctly deferred; do nothing

Both are entirely unbuilt (config-only entries, no loader, no parser, no Supabase table anywhere),
and this was a **deliberate, documented decision**: `memory/notes-32-queue.md` already states
*"# Shift Manager Verifications by GM — future; form-based... Not currently used by this org"* and
*"Execution of Crew Retention Prg. — subjective/effort-based; almost certainly never
auto-populate. Keep manual/optional."* This matches the owner's own "can wire up later" exactly.
**No action in this dispatch** — leave both as manual-entry, optional metrics, already correct.

### 8. Pre-wire other metrics for the customization picker — audit + selective registration, not blanket automation

The picker (`KpiAddPicker` in `performance-reviews.js`) draws from `KPI_REGISTRY`
(`kpi-registry.js`), built by flattening `DEFAULT_REVIEW_CONFIG.metrics` plus a hand-maintained
`EXTRA_KPIS` array. Adding a metric to the picker is one line; making it genuinely **auto-sourced**
additionally requires a hand-written lookup inside `autoPopulateKPIs()` (since that function
doesn't use `metric-source.js`) and a `REVIEW_METRIC_TARGET_FIELD` entry if it needs a target.

**Scope:** audit `metric-source.js`'s `METRIC_SOURCES` registry for metrics with a real, working
auto-first chain that aren't yet in `KPI_REGISTRY`/`EXTRA_KPIS` at all, and add the clearly
review-relevant ones (operational/financial KPIs a store review would plausibly want — use
judgment, this doesn't need an exhaustive 1:1 port of every metric in that registry) to
`EXTRA_KPIS` so they're selectable even if not scored by default. **Prioritize metrics that already
have BOTH a real actual source AND a real target** (post dispatch #107's yearly-targets expansion,
several newly-available fields like `tVoiceEAD`, `t1800Contacts`, `tMcdStars` may qualify) — a
metric with only one side wired is a worse addition to the picker than a documented gap, since it
would silently show a blank half. Do not attempt to fully auto-wire every candidate found in this
audit inside this dispatch; registering it in the picker with an honest source annotation (auto
where real, manual where not yet built) is enough for "pre-wire" — full auto-population for
anything beyond items #1–6 above can be its own follow-up dispatch if the audit turns up
promising candidates.

## Verification bar

- For every "already wired" claim in this dispatch (items #2, #6's actual sides): render the real
  Performance Review, click Auto-fill, and confirm real numbers actually appear for at least one
  store/month with genuine underlying data — not just that the code path exists. If the underlying
  Supabase table is empty in production, say so explicitly rather than treating code-level
  correctness as proof of a working feature.
- For every "real gap, now fixed" item (#1, #3, #5, #6's target side): same live-render
  verification, plus confirm the specific number matches a hand-computed check against raw data for
  at least one store, the same discipline used earlier this session for dispatch #102/#103.
- For #4: confirm the month-aware lookup change doesn't alter behavior for any month that already
  has a real monthly target (regression risk — this touches the core merge function every other
  review metric depends on).
- For #8: render the customization picker, confirm newly-added `EXTRA_KPIS` entries appear and are
  addable, and that their source annotation (auto vs. manual) is honest about what's actually wired.
- Full suite green, `npm run build` clean, before/after entry-chunk gzip numbers in the commit body.

## Do NOT

- **Do not claim items #2 or #6's actuals are "now fixed"** — they already worked before this
  dispatch; only their target-mapping and (for #6) config-metadata staleness are real fixes here.
  Misreporting an already-working feature as newly fixed is worse than leaving it unmentioned.
- **Do not invent the pre-April target-blending rule (#4) without asking the owner** — the code fix
  (month-aware lookup) is clear; the blending policy for genuinely missing months is not.
- **Do not build #7** — it was deliberately deferred by the owner both previously (per
  `notes-32-queue.md`) and again in this exact request ("can wire up later").
- **Do not assume any of the five underlying Supabase tables flagged in the structural finding
  above have real rows** — measure before reporting any of #1/#2/#6 as displaying genuine data.
- **Do not do a blanket, unscoped port of every `metric-source.js` metric into the review picker
  for #8** — prioritize as instructed, and leave a documented remainder rather than over-building.
