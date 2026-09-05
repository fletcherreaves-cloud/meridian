# Dispatch #229 — Metric Registry/Resolver unification: route signal-registry.js's manual-only metrics through the auto-first resolver

**Origin:** live-caught, not theoretical. Trend Explorer (shipped this session, `src/views/trends.js`)
picked "OEPE (sec)" for store 3708 over a 7-day window and rendered **0 daily periods, an empty
sparkline, and an empty day-of-week chart** — while its own "Moves together with" section, on the
same store, found a real correlation (`+0.58 r, n=344`) in the same session. Traced live: OEPE's
registry entry (`src/engine/signal-registry.js`, `key:'oepe'`) is `source:'opsRows'` — the manual
Operations-Report upload, whose most recent row for that store is older than 7 days. The n=344
correlation is real because Scanner sweeps the metric's *entire* loaded history, not the selected
window — so a stale manual source reads as "broken" in Trend Explorer's date-scoped view and
"fine" in Signals' Scanner, for the identical metric, in the identical session. This is exactly
the class of bug **backlog-master-2026-08-19.md's own §3 item already named** ("Metric
Registry/Resolver unification — merge signal-registry.js (110 metrics) and metric-source.js
(~50 now); add lineage, aggregation metadata, catalog UI, CI enforcement") and this dispatch is
that item, scoped down to something actually shippable rather than the full merge.

## What actually exists (measured this session, not assumed)

- **`src/engine/metric-source.js`** is the mature, tested, auto-first resolver — `METRIC_SOURCES`
  (78 raw keys incl. `derive` sub-chains; genuinely ~50-60 distinct metrics per its own header
  comment) lists cloud/emailed streams first and manual streams (`laborRows`/`opsRows`/`ctrlRows`/
  `auditRows`) **last, as fill-only**, per its header's standing rule. `metric-source-order.test.js`
  already asserts, mechanically, that no chain violates that ordering. `metricDaily`/
  `metricSeries`/`metricAvg`/`metricSumRatio`/`metricRate` are the read API.
- **`src/engine/signal-registry.js`**'s `METRIC_CATEGORIES` is a *much* wider catalog (measured
  directly: **101 metric entries carry a static `source` field**, not counting the calendar/
  price-event derived ones) built for Signals' Scanner/Signal Lab — it has NO concept of
  auto-first fallback per key. Each entry reads exactly one `ds[source]` array, always, forever.
- **Measured split of those 101:** `44` (~44%) are sourced from a manual-only array
  (`opsRows`/`laborRows`/`ctrlRows`/`fobRows`) with no fallback — the exact list is `oepe, kvst,
  r2p, parkPct, dtMixPct, sales, gc, avgCheck, salesVsLY, laborPct, tpph, avgRate, otHrs, fobPct,
  baseFoodPct, compWaste, rawWaste, condiment, empMeal, statVar, unexplained, discCoupon,
  pLFoodPct, pLPaperPct, discPct, discCnt, discAmt, promoPct, promoCnt, promoAmt, cashOSPct,
  cashOSAmt, drawerOpens, posOverCnt, posOverAmt, manualRefAmt, cashRefCnt, cashRefAmt,
  cashlessRefCnt, cashlessRefAmt, tRedBPct, tRedBCnt, tRedAPct, tRedACnt`. Every one of these
  goes empty in Trend Explorer/Scanner the moment its manual upload lapses, exactly like OEPE did
  live in this session.
- **Some of the 44 already have a same-quantity cloud sibling *elsewhere in the same registry*,**
  via `METRIC_CONCEPT` (e.g. `oepe`↔`glOepe`, `sales`↔`qaSales`/`slSales`, `cashOSPct`↔
  `glCashOSPct`/`csCashOSPct`, `posOverCnt`↔`glPosOverCnt`/`csPosOverAmt`) — for these, a user
  CAN get live data today, just not under the label they're most likely to pick first (the plain
  name, not the "· cloud" variant), and Trend Explorer surfaces both as unrelated picker entries
  with no hint that one is the auto-fresh version of the other.
- **The entire FOB family (12 of the 44) has NO cloud sibling anywhere in the registry at all —
  and a real one already exists and is unused.** `qsr_fob` is a genuinely auto-pulled table
  (`loadQsrFob()`, `src/lib/supabase.js:1508`, loaded into `ds.qsrFobRows` at startup, App.js
  T2 stage) with the exact same fields as manual `fobRows` (`prodSalesAmt`, `compWasteAmt`,
  `rawWasteAmt`, `condimentsAmt`, `empMgrMealsAmt`, `statVarianceAmt`, `unexplainedAmt`, per this
  session's own `QSR_FOB_FIELDS` dictionary work, `src/constants.js`) — confirmed via direct grep
  that `signal-registry.js` never references `qsrFobRows` anywhere. This is the single largest,
  cleanest, most concrete slice of this dispatch: real auto data, real matching fields, zero
  registry wiring.

## What's actually missing

1. No auto-first fallback path for ANY of signal-registry.js's 44 manual-only metrics — each is a
   single, unconditional `ds[source]` read (`extractMetricValues`, `src/engine/signal-registry.js`).
2. No cloud sibling in the registry for the FOB family specifically, despite the source table
   (`qsr_fob`) already existing and already loaded into `ds` every session.
3. No signal to the metric-picker UI (`MetricSelect`, `src/views/signals.js`, reused by Trend
   Explorer) that a manual-sourced metric may be stale, or that a fresher sibling exists under a
   different key — a user has no way to know "OEPE (sec)" and "OEPE (sec) · cloud" are the same
   real-world quantity from two different pipelines.

## Task 1 — measure the exact overlap before writing a fallback mechanism

Do not assume `metric-source.js`'s chains are a drop-in replacement for signal-registry's `source`/
`field` pairs — verify first, the same discipline dispatch #226's Task 1 used for a different reuse
question. For each of the 44 manual-only keys above:
- If `METRIC_SOURCES` already has a same-quantity chain (e.g. `sales`, `gc`, `laborPct`, `tpph`,
  `otHrs`, `cashOSPct`, `cashOSAmt`, `posOverCnt`, `posOverAmt`, `cashRefCnt`, `cashRefAmt`,
  `cashlessRefCnt`, `cashlessRefAmt`, `discPct`, `discCnt`, `discAmt`, `promoPct`, `promoCnt`,
  `promoAmt`, `drawerOpens`, `avgCheck`, `dtMixPct`, `oepe`, `kvst`, `r2p`, `parkPct` all *look*
  present in `METRIC_SOURCES`' key list above — confirm each one field-for-field, not by name
  match alone, since a same-named key could resolve a differently-defined quantity) — that's a
  **direct swap** candidate: route `extractMetricValues` for that key through `metricSeries`/
  `metricDaily` instead of the static `source` read.
- If no `METRIC_SOURCES` chain exists but an in-registry `METRIC_CONCEPT` cloud sibling does (the
  FOB-adjacent controls-family keys not already listed above, if any) — that's a **concept-merge**
  candidate: still two registry keys, but Trend Explorer/Scanner UI should visibly pair them.
- If neither exists (the FOB family, confirmed above; verify the remainder: `avgRate`,
  `manualRefAmt`, `tpph`, `otHrs` if not actually in `METRIC_SOURCES`) — that's a **new source**
  candidate, scoped separately per metric family, not blindly bulk-added.
Report the categorized list (direct-swap / concept-merge / new-source / genuinely-manual-only,
e.g. anything with truly no cloud equivalent anywhere in this app) before writing any code —
this dispatch's remaining tasks assume that categorization exists and is correct.

## Task 2 — direct-swap slice: route the confirmed metric-source.js overlaps

For the keys Task 1 confirms are field-identical to an existing `METRIC_SOURCES` chain, change
`extractMetricValues` (`signal-registry.js`) to call `metricSeries`/`metricDaily` for those keys
instead of reading `ds[meta.source]` directly — auto-first fallback, zero manual-upload
dependency, for free, on every metric that already has the machinery. Keep the registry's own
`source`/`field` as the fallback path for every key NOT in this slice (do not attempt the full 44
in one PR — ship the subset Task 1 actually confirms, and name the rest as explicit follow-on).
**This is the fix for the exact bug that motivated this dispatch** — once `oepe` routes through
`METRIC_SOURCES`' existing `oepe` chain (confirmed to already auto-fall-back to
`qsrActSummaryRows`/DAR data per that file's own header), Trend Explorer's "OEPE (sec)" (not just
its "· cloud" twin) should show real data for the trailing 7 days.

## Task 3 — wire `qsrFobRows` into the FOB metric family (the concrete, contained win)

Add `qsrFobRows` as the auto-first source for the 12 FOB-family registry keys, either as a new
`METRIC_SOURCES` chain family (preferred — keeps ALL auto-first logic in one file, matching this
repo's own "one place, not a ninth declaration site" precedent from dispatch #77) or, if that
proves awkward for FOB's own `%`-of-`prodSalesAmt` derived shape, as direct `ds.qsrFobRows` reads
in `extractMetricValues` with `ds.fobRows` as the explicit manual fallback — auto first, manual
last, matching the ordering rule either way. Field mapping is already fully documented in this
session's own `QSR_FOB_FIELDS` (`src/constants.js`): `compWasteAmt`/`rawWasteAmt`/
`condimentsAmt`/`empMgrMealsAmt`/`statVarianceAmt`/`unexplainedAmt`/`prodSalesAmt` on `qsrFobRows`
map directly to `fobRows`'s equivalent camelCase fields — confirm the mapping against real loaded
rows (not just the two field lists side by side) before wiring it, since a silent field-name
mismatch here would produce the exact "reads as broken, isn't" failure mode this whole dispatch
exists to close.

## Explicitly out of scope

- The full 110-metric merge / lineage metadata / catalog UI / CI-enforcement scope
  backlog-master's original item named — this dispatch is the auto-first-routing slice only.
- Any metric Task 1 categorizes as genuinely manual-only (no cloud source exists anywhere for
  that quantity) — leave those reading `ds[source]` exactly as today; there is nothing to fall
  back to.
- Changing Trend Explorer's or Signals' UI beyond what Task 2/3 require to keep working (no new
  picker redesign, no "this metric may be stale" badge — worth a follow-on FR, not this dispatch).
- Retrofitting `MetricSelect`/Trend Explorer to visually pair a manual metric with its cloud
  sibling — real, worth doing, but a UI-layer follow-on once the sourcing itself is fixed.

## Verification (required)

1. Task 1's categorized list, with evidence per key (chain diffed field-for-field, not name-matched).
2. Full test suite green, plus: does an equivalent of `metric-source-order.test.js`'s ordering
   guard need to extend to signal-registry's newly-routed keys, or does calling into
   `metric-source.js` inherit that guard for free? State which, and add a test if not automatic.
3. **Live reproduction of the motivating bug, closed**: Trend Explorer, store 3708 (or any store
   with a stale `opsRows` upload), metric "OEPE (sec)" (not "· cloud"), 7D range — should now
   render real daily periods instead of the empty state in this session's own screenshot.
4. `npm run build` clean, eager-payload budget unchanged (this touches `signal-registry.js`,
   already eagerly bundled in several panels — watch the budget check's own numbers, not just
   "did it pass").
