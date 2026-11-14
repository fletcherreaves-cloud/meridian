# Task #152 — app-wide metric/formula reconciliation (status, 2026-11-14)

Owner's standing ask (verbatim, from this session): *"let's add to our growing list a
reconciliation with a description of what every displayed result, app wide, actually
represents. Formulas included if used. I know that will be a long list, but worthwhile in the
end to have documented."* Explicitly authorized as multi-session/incremental — this file exists
so the next pass (including a future me) doesn't re-derive what's already settled.

## Where the documentation actually lives

`src/engine/metric-provenance.js`'s `METRIC_PROVENANCE` registry, surfaced in-app via the
**Metric Lineage** panel (`src/views/metric-lineage.js`, Calculated / Direct-Source Data tabs —
both already shipped this session, see `v5.766`-era commits). Two tiers:

- **Auto-generated** (`autoProvenanceFor()`) for every key in `metric-source.js`'s
  `METRIC_SOURCES` — a metric added there gets a Lineage entry for free, no second manual step.
- **Hand-curated** (`CURATED_PROVENANCE`) for anything where exact field-reconciled math or a
  composed (multi-metric) formula is worth writing in prose. Curated always wins on collision.

**Before this pass:** 97 METRIC_SOURCES chains + ~14 curated entries = ~111 total. Covers
everything routed through the app's own auto-first resolver — the large majority of what's
actually displayed, since that resolver is the house standard every panel is supposed to use.

## What this pass added

1. **Fixed two real, independently-diagnosed bugs** feeding into the GM Daily Review's Service
   daypart breakdown (`src/engine/daily-review.js`'s `DAYPART_FIELDS`), input from
   `memory/finding-signals-liveops-mislabels-2026-11-13.md` #2 (left unfixed there deliberately,
   out of scope for that dispatch):
   - `r2p`'s `fc_untilcloseddrawer` (two d's — typo) → `fc_untilclosedrawer` (one d, the real
     column). Also added that column to `loadDtHistory`'s select list in `src/lib/supabase.js`
     — it was never fetched at all, so the daypart breakdown silently returned zero R2P
     dayparts for every store, every day, indistinguishable from "no matching rows" (exactly
     the trap the test suite's own existing empty-case test couldn't catch — it only proves the
     empty-case *handling* works, not that the real fields resolve).
   - `kvst`'s bare `mfy_time`/`mfy_trans_cnt` (don't exist on `qsr_daily_activity` at all) →
     `mfy1_untilserve`/`mfy2_untilserve` summed, `mfy1_trans_cnt`/`mfy2_trans_cnt` summed (the
     real side-suffixed columns, already selected by `loadDtHistory` — confirmed before editing).
   - New test: `src/__tests__/daily-review.test.js` — `'computes real R2P and KVS dayparts from
     their actual qsr_daily_activity field names'`, asserting a non-empty, correctly-summed
     result from realistic rows (the gap the pre-existing "no matching rows" test couldn't close).
   - `dt-speedofservice.js`'s own Front Counter station has the *same* un-subtracted-R2P issue
     (raw `fc_untilserve/fc_trans_cnt`, no `fc_untilclosedrawer` leg) — **left untouched**, per
     that file's own dispatch #128 comment explicitly scoping it as future work, and per this
     dispatch's own scope (daily-review.js was the named, already-diagnosed bug; dt-speedofservice
     is a *different*, separately-flagged one).

2. **6 new hand-curated `METRIC_PROVENANCE` entries** for displayed numbers that are composed
   from MULTIPLE already-resolved `metric-source.js` values and so were never covered by
   `autoProvenanceFor()` (which only sees single `METRIC_SOURCES` chains):
   - `visitReadinessSpeed` / `visitReadinessAccuracy` / `visitReadinessQuality` /
     `visitReadinessLeadership` — the 4 sub-scores feeding `visitReadiness` (the composite
     already had its own entry; the 4 numbers the panel actually prints per-area did not).
     Formulas traced directly from `engine/visit-readiness.js`'s `scoreMetric()`/`subScore()`
     and the real `SPEED`/`ACCURACY`/`QUALITY`/`LEADERSHIP` spec arrays — summarized (mean of
     each metric's 0-1 target-grade) rather than restated field-by-field, since the live panel
     already prints each metric's own actual/target/score ("drivers") better than a static
     registry entry could.
   - `dailyReviewRefundAmt` (`cashRefAmt + cashlessRefAmt`) and `dailyReviewEmplMgrMeal`
     (`empMealAmt + mgrMealAmt`) — the GM Daily Review's two `sumMs` composed lines
     (`engine/daily-review.js buildLine()`). Every other line on that panel names a single
     `metric-source.js` key and so is already auto-covered — these two were the only gap.
   - New test coverage: `src/__tests__/metric-provenance.test.js`'s new
     `'METRIC_PROVENANCE — task #152 curated additions (2026-11-14)'` block — asserts all 6 are
     present/composed/Meridian-derived, the two `sumMs` entries name their real legs, and the 4
     Visit Readiness keys don't collide with a real `METRIC_SOURCES` chain.

3. **Confirmed Location Dossier needs NO new entries.** Read `location-dossier.js`'s
   `DOSSIER_METRICS` end to end — all 9 keys (`sales`, `gc`, `laborPct`, `tpph`, `oepe`, `kvst`,
   `cashOSPct`, `fobPct`, `primeCostPct`) already resolve through `METRIC_SOURCES`/curated
   entries. Worth stating plainly rather than silently skipping, since "I checked and it's
   already covered" is itself real progress on a task this broad — otherwise the same ground
   gets re-walked next pass.

## Pass 2 (2026-11-14, same day) — `signal-registry.js`

The previous pass's "mostly already covered" characterization of `signal-registry.js` was
**checked directly, not accepted as-is** — it was half right. Read the file end to end (1199
lines) and classified every `METRIC_CATEGORIES` key:

- **Most ARE already covered**, exactly as the previous pass said — bridged through that file's
  own `AUTO_FIRST_KEY_MAP` to a real `METRIC_SOURCES` chain, so `autoProvenanceFor()` already
  generates a Lineage entry. No action needed on these (service/controls categories are 100%
  covered this way; most of labor/sales too).
- **But 20 keys genuinely had NO `METRIC_SOURCES` chain at all** (confirmed by `grep` against
  `metric-source.js` before writing anything — zero hits for every one of them), so they were
  silently undocumented:
  - 4 FOB sub-items the file's own `AUTO_FIRST_KEY_MAP` header comment already named as having
    "NO matching METRIC_SOURCES chain today": `baseFoodPct`, `discCoupon`, `pLFoodPct`,
    `pLPaperPct`. Direct parser pass-throughs (`src/parsers/index.js`) of the uploaded Monthly
    Projections/FOB report's own columns — no in-app formula exists because none is computed.
  - 11 SMG/VOICE customer metrics, previously unflagged by anything: `osat5`, `osatTop2`
    (composed: 5★+4★), `osatB2B`, `accuracyB2B`, `dtProblem`, `overallProblem` (FullScale
    scorecard, `smg_fullscale`) and `vpDtSat`/`vpIrSat`/`vpQualityB2B`/`vpFriesB2B`/`vpSnackB2B`
    (the separate monthly VOICE Performance upload, `smg_voice_performance` — confirmed via
    `src/lib/supabase.js`'s own `.from('smg_voice_performance')` calls and
    `src/parsers/index.js`'s VOICE column-name list).
  - 5 real-formula LifeLenz Data Explorer metrics, also previously unflagged: `schedGap`
    (`crewHrs − idealTotHrs`, computed upstream, read as-is — table `lifelenz_schedule`),
    `scheduleEditCount`/`scheduleCostVariance` (`engine/schedule-discipline.js`'s
    `dailyScheduleVariance()` — count and Σ$ of post-publish schedule edits, table
    `lifelenz_schedule_variance`), `complianceViolationCount`/`complianceCostPenalty`
    (`engine/compliance-audit.js` — count and Σ$ of labor-compliance violations, table
    `lifelenz_compliance_audit`).
  - All 20 added to `CURATED_PROVENANCE` (`src/engine/metric-provenance.js`), formulas traced
    directly from the real parser/engine code (not guessed from field names), with 4 new tests
    (`src/__tests__/metric-provenance.test.js`'s `'task #152 signal-registry.js additions'`
    block) asserting each is present, correctly marked composed/direct, and doesn't collide with
    a real `METRIC_SOURCES` key.

### Finding (not fixed): `salesVsLY` is two different, same-named metrics in two unrelated registries

`signal-registry.js`'s `salesVsLY` key (Sales category) reads `fobRows.salesVsLY` directly — a
raw monthly field, straight from the uploaded Monthly Projections/FOB report, no in-app
computation. This is a **completely different number** from `metric-provenance.js`'s existing
curated `salesVsLY` entry, which documents `vs-ly.js`'s `matchedVsLY` — a daily, DAR-sourced,
matched-day Σcurrent/ΣLY calculation. Same string key, two unrelated real metrics, in two
registries that don't cross-reference each other.

**Not currently a live bug** — checked directly: `metric-lineage.js`/`metric-provenance.js`
never import or read `signal-registry.js` at all (confirmed by grep), so a user browsing Metric
Lineage for "salesVsLY" only ever sees the DAR-matched-day description; `signals.js`'s Signal
Lab/Scanner never link out to Metric Lineage for any metric today (checked — the panel's only
`InfoIcon` is one generic `signals_guide` KB link, not per-metric). So the two `salesVsLY`s
never actually collide in front of a user today. **But the moment anyone wires Signal Lab
metrics into Metric Lineage lookups** (a natural next step for exactly the kind of
"what does this represent" transparency this whole task is about), this collision would make
the FOB-sourced monthly `salesVsLY` silently show the wrong (DAR-matched-day) formula. Flagging
here rather than renaming anything — renaming either one is a real product decision (which name
is "the" Sales vs LY metric going forward), not something to resolve unilaterally mid-pass.

### Explicitly deferred from pass 2

- **The ~30 "cloud-leg" direct-read duplicates** (`glSales`, `glGC`, `csCashRefCnt`, `slSales`,
  `qaSales`, etc. — the `glimpse`/`cash`/`ledger`/`daractivity` categories) are real, separately
  user-visible Signal Lab picker entries, each a simple single-table/single-field read with no
  formula. Not added this pass: there are ~30 of them, each mechanically identical in shape
  (`{table: <one source table>, field: <name>}`), and `METRIC_CONCEPT` in `signal-registry.js`
  already documents inline which manual-key counterpart each one is the "same underlying
  quantity, different leg" of. Worth a dedicated bulk pass (genuinely mechanical, low risk,
  lower value per entry than what's covered above) — next priority for `signal-registry.js`
  specifically, separate from the `forecast.js` deferral below.
- Weather/Calendar/Logged-Events/Pricing/Product-Mix-item categories — judged as NOT needing
  `METRIC_PROVENANCE` entries. These are synthesized Scanner/Signal-Lab correlation inputs with
  no source table and no panel-displayed KPI number in the traditional sense (a 0/1 day-of-week
  flag, a per-item dynamic resolver) — `signal-registry.js`'s own extensive inline comments
  already document what each one is and why, better than a registry entry could. This is a
  judgment call, stated plainly rather than silently skipped, per this task's own standing rule.

## Still deferred from pass 1 — unchanged

- **`forecast.js`'s named models (`simple`/`dow`/`ae`/`ewma`/`di`) — NOT attempted.**
  These are the Model Assignment / Forecast Accuracy panels' column headers and are heavily
  user-facing (the owner's own Smart Targets work lives here). Deliberately not rushed: the
  file is 2918 lines with intricate per-model branches (`forecastDay()`'s `_assignedModel`
  dispatch, `forecastDayparts()`, the holiday-adjustment paths), and CLAUDE.md's own standing
  rule is to "cautiously protect" the engineered models — a wrong formula written into a
  transparency registry is worse than no entry, since it would look authoritative. This needs a
  dedicated pass with time to trace each branch correctly, not a rushed add at the end of this
  one. Still the single highest-value remaining item.
- **`paperCost` (FOB_LINES in `daily-review.js`) — a genuine, already-flagged data gap, not a
  documentation gap.** `DEFAULT_TARGETS` carries a real `tPaperCost` target but `metric-source.js`
  has no actual-value key for it at all. The panel already surfaces this honestly (target-only
  line, no actual, per that file's own comment) — there is no formula to document because none
  exists yet. Not touched here; inventing one would be exactly the kind of guess CLAUDE.md's
  "measure, don't reason" rule forbids. Flagging it here so it isn't mistaken for an oversight.

## Mislabel candidates checked — none renamed

Per this dispatch's own instruction (and the session's standing "measure before renaming" bar,
already exercised this session on Accuracy→2nd Side Healthy Usage %, Prime Cost %→Labor + FOB %,
DT Speed→OEPE): traced several candidate labels while reading the above files and found none
that were actually wrong — `refundAmt`/`emplMgrMeal`/the 4 Visit Readiness sub-score labels all
accurately describe what they compute. **No renames made this pass.** If a future pass finds a
real mislabel, it goes through the same bar: trace the code first, rename only on confirmation,
write it up the same way `finding-prime-cost-rename-2026-11-13.md` etc. already do.

## Verification

Full suite (`npm test -- --run`) and `npm run build` both pass clean (see commit for exact
counts/KB — this file predates running them in sequence, so don't quote stale numbers from here;
read the commit message for the real figures). The two bug-fix changes were verified the same
way the rest of this session held to: realistic fixture rows with the REAL field names, not a
rename-and-hope pass.
