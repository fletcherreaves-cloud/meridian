# Backlog — Open Items (cut 2026-09-06)

> **What this is.** `memory/backlog-master-2026-08-19.md` grew to ~1670 lines after three PM
> review passes layered verification essays, corrections-to-corrections, and full evidence trails
> on top of the original ~150-item sweep. That file is now the **archive** — the record of what
> was checked, when, how, and by what evidence. This file is the **working list**: every item
> still genuinely open as of this cut, stripped down to what it is and why it's not done, with a
> pointer back to the archive section for the full verification trail if you need it.
>
> **Do not delete the archive file** — dispatches, code comments, and test files across `src/`
> cite `backlog-master-2026-08-19.md` by name as provenance (e.g. `review-engine.js`,
> `at-a-glance.js`, several changelog entries). It stays at its current path, unchanged.
>
> **How to keep this file honest going forward:** when an item below gets resolved, move its line
> to the archive file's own "Already confirmed done" section (with the evidence that settled it)
> and delete it from here — don't just check it off and leave it. This file should only ever
> contain items that are actually still open, not a status board. Re-verify before trusting an
> unannotated line's status if it's been sitting a while — the same "measure it" discipline that
> produced the three archive passes still applies here.
>
> **Not a re-verification pass.** This cut did not re-check every item against current code — it
> mechanically carried forward everything the archive's own three passes (2026-08-19 ×2,
> 2026-09-05) left unchecked/open, plus the same-day 2026-09-06 PM sweep's own residuals. Treat an
> item here the same way the archive tells you to: "last known status: open," not "verified open
> today."

---

## 0. Normalization plan

- [ ] **F — role-based voice.** First slice shipped (Visit Readiness verdict line).
  ✅ **Count Cycle DONE 2026-09-08 (v5.409).** `buildCycleVerdict()` (`count-cycle.js`) answers
  "so what do I do" in one imperative line ("Count Food and Condiment today — N days since the
  last complete count," "Finish the Condiment count from [date]") — shown alongside (not
  replacing) the existing diagnostic exceptions text, in both the in-app `StoreCard` and the
  shareable weekly report. This was the dispatch's own cited evidence of the gap: "Count Cycle
  said 'No complete weekly count on record' to a store that had counted." 8 new tests.
  **DI Compare — the dispatch's other evidence string ("Not Dialed-In is better — recalibrate")
  — still needs the same treatment.** Deliberately not attempted in the same pass: DI Compare
  (`DialedInComparisonReport`, `analytics.js`) is `kind:'test-kitchen'` (not yet promoted to a
  real user-facing surface) and is inherently a forecast-model-QA tool aimed at whoever's
  validating Dialed-In calibration, not an operator mid-shift — worth confirming its actual
  audience before writing "restaurant words" for it, rather than assuming the same treatment
  applies unchanged.
- [x] ✅ **Both gaps closed (v5.422, 2026-09-10).** (1) `dispatch-labor-allocation-panel-render
  .test.js` renders the REAL `LaborAllocationPanel` (mocking only its two Supabase loaders,
  not the engine) across all 3 tabs with a realistic 24-hour_slot/2-store/2-day fixture built
  from `labor-standard.js`'s own documented row/config shapes — District's real deficit/
  surplus totals, By Store listing both fixture stores, Overnight's Open-branch (TPPH) and
  Closed-branch (standard verdict) rows both exercised, plus the genuine zero-rows placeholder
  case a fresh cloud session sees before its 90-day fetch resolves. Not a literal live-browser
  session (no such session available in this sandbox), but a real render through the actual
  component tree, which is what the gap asked for. (2) The file's 4 `useMemo` calls
  (`allocationDistrict`/`allocationByStoreDaypart`/`overnightOpenness`/`overnightExcessByStore`,
  running over up to 90 days × 27 stores × 24 hour_slots) now wrapped in `_mark()`, matching
  the same `click-trace.js` idiom other heavy-compute panels (at-a-glance.js's
  `compute:weekProjections`) already use.
- [ ] **C2 — idempotent partition replace.** Fully greenfield, no implementation found. (C1, the
  pipeline-contract module + 2 script adopters + ratchet, already shipped — 18 scripts remain
  unconverted, tracked by `ratchet-pipeline-contract-coverage.test.js`'s `CEILING`.)

*(Archive: §0)*

## 1. Strategic roadmap

- [ ] P2 UX coherence pass — the panel *content/flow* scorecard (distinct from modal-chrome
  consistency, already done via the panel contract) is still open.
- [ ] P3 Differentiators — Profit-Leak Index, Operational Coherence Score: still just named ideas,
  not built. (Visit Readiness / Graded-Visit Predictor already shipped.)
- [ ] P4 Deployment — multi-tenant design not started (same-org multi-user already works via
  existing RBAC).

*(Archive: §1)*

## 2. UI/UX Redesign

- [ ] #261 Phase 0 render-instrumentation capture — blocks the virtualization-vs-tile-split
  decision for the rest of this plan.
- [ ] #192 P2 panel scorecard — consistency checklist across all panels.
- [ ] #225 viewport-scroll lock — fix applied, **unverified on a real phone** (devtools emulation
  is insufficient per the issue itself; needs an actual device, not more grep).
- [ ] White-alpha token adoption — `light-mode-white-alpha.test.js`'s `CEILING = 241`, **zero
  slack, zero sites absorbed since the ceiling was seeded.** The background/boxShadow follow-up
  sweep (the ~197-site remainder the test's own header calls out) is the open scope here.
- [ ] ❓ Home-screen redesign (fewer/deeper widgets around the "learning loop") — 3 open design
  questions: owner's actual first move of the day; dynamic vs. user-customized vs. hybrid; widget
  count.
- [ ] #289 — three target blocks (Customer Satisfaction, Digital Execution, People) missing from
  `DEFAULT_TARGETS`, gating VOICE-grading work (#288). Real blocker: the owner's "2026 Restaurant
  Targets" workbook was never committed to the repo — building values without it means fabricating
  numbers. Needs either the workbook landing in-repo, or routing through the existing Monthly
  Targets Excel drop (`monthly_targets`) as an alternative.
- [ ] **Spine 1** — one copyable panel design (District View → Location-tile pattern), pilot =
  Inventory Control, extend to Food Cost/FOB/Inventory.
- [ ] **Spine 2** — unify `count-cycle.js`/`lastCountAnchor`/`inv_count_sessions` behind one cycle
  selector.
- [ ] ❓ Menu restructure (owner's proposed IA) — parked, needs a planning session with the owner.
- [ ] SAGE persistent top-bar placement — parked UI-placement decision.
- [ ] Deferred: startup data-load gradient cue, loaded-data-strip repositioning, dev-mode
  diagnostic screen.
- [ ] Naming: Pace tab (collides with McDonald's internal "PACE" term), Help rename, Troubleshooting
  mode (End User/Dev).
- [ ] **IA/navigation reorganization** (`notes-67-queue.md` §1) — new top-level groupings (Reports,
  Inventory and Food Cost, Forecasting and Labor Projections, Analysis, HR); URL-view conversion
  for most standalone panels with an explicit modal-exception list (SAGE, Knowledge Base, About,
  Metric Lineage, Feature Requests, Local News) needing a minimize-and-close option that doesn't
  universally exist today; District Overview needs a back button; Lifelenz Bridge rename to
  "Recommended WFM Forecast Adjustments"; make all data tables filterable/sortable. **Not scoped
  against current code yet** — needs a real panel/routing inventory before it becomes a dispatch.
- [ ] Side-by-side LifeLenz-forecast-vs-Meridian-forecast comparison view (`notes-67-queue.md` §3)
  — check against existing Lifelenz Gap / DI Compare items first, may be partially covered.

*(Archive: §2)*

## 3. Data Pipeline / Sourcing Correctness

- [x] ✅ **RE-VERIFIED 2026-09-07 — stale, all three already fully migrated; do not re-raise.**
  This item was undated and describes work finished well before this backlog snapshot's cut date.
  - **Scheduling Intelligence** (`src/views/scheduling.js`): main table reads `ds.schedRows`
    (auto-loaded via `loadLifeLenzSchedule()` in `App.js`), not `ds.laborRows`; its
    `OpportunityReport` sub-view already goes through `metricDaily()` (`engine/metric-source.js`),
    whose own comment states `laborRows`/`ctrlRows` are "only a LAST-RESORT fill." Confirmed by
    changelog `5.029.js` (dispatch #348, 2026-08-16): "pulled directly from lifelenz_schedule."
  - **Schedule Summary** (`engine/schedule-summary.js`, `computeScheduleSummary`): header comment
    states "all derived from the lifelenz_schedule data Meridian already syncs daily." This panel
    is where **the actual "labor% bug"** this item's "same root cause" referred to lived — a
    mid-day partial-actual day dominating the dollar-weighted average (72% instead of ~24%) —
    already fixed in changelog `4.505.js` (2026-07-24) by restricting the average to completed
    days. Not open.
  - **Labor Analysis** (`engine/labor-analysis.js`): `deriveBand1FromSchedule` sources from the
    LifeLenz schedule; `mergeAutoManualWeek` only gap-fills stores/weeks the auto source misses
    (UI badges `week.source==='auto'`/`'manual'`). Confirmed by changelog `4.485.js`
    (2026-07-23): "weekly Fixed-Labor-Hours inputs now derive automatically from the daily
    LifeLenz schedule... a manual MBI upload only gap-fills."
- [x] ✅ **BUILT 2026-09-07 (v5.388) — do not re-implement.** Full pull shipped:
  `scripts/lifelenz-attendance-pull.mjs` (direct-token only, no Playwright fallback yet — see
  its own header for why, a reasonable low-risk follow-up not attempted) rolls each store's
  per-employee `attendance_report` CSV rows up to a rolling-28-day summary in
  `lifelenz_attendance_summary` (`supabase/schema-lifelenz-attendance.sql`, tenant + `my_locs()`
  RLS). Daily workflow, watched in `sync-failure-watch.yml`, checked in `stream-freshness.js`
  `STREAMS` + `scheduled-pull-registry.mjs`. `scheduling.js`'s "Missed Shifts" tile (the only one
  of `TA_DATA`'s 6 fields the UI actually rendered — the other 5 were dead data) now sources from
  `sum(unexcused absences)` per store, auto-first with the frozen snapshot as a per-store
  fallback until that store's first live pull lands.
  ✅ **RESOLVED 2026-09-07 (v5.391).** Owner confirmed the definition directly: *"any shift
  scheduled but not worked would be a missed shift."* Was unexcused-only; now sums EXCUSED +
  UNEXCUSED absences per store — do not re-raise this as needing confirmation. 10 tests against
  the real captured CSV shape.
- [ ] `labor_rows` sweep — was 20 files under `src/views`+`src/engine` matching a grep for
  `ds.laborRows`. **⚠️ The raw count likely over-states real violations** — several confirmed
  false positives found across this session, not chased into a full per-file audit (that's real,
  individual-judgment work, not a quick grep-and-fix pass): `forecast.js`'s `compute6wk()` only
  touches `ds.laborRows` as a `locRows()` fallback parameter and for genuinely-bespoke derived
  metrics (t2w, avgCheck, depositVsSalesRatio) with no resolver equivalent — its actual per-field
  averages already all route through `metricAvg()` (see the compute6wk/avg6 correction above);
  `record-day.js` already reads auto-first, with its own `ds.laborRows` reference only cleaning
  period-summary rows before handing off to the resolver (`// Auto-first (data-integrity sweep
  signature #2)`, its own comment); `eom-supervisor.js`'s `monthLaborRows` is a documented,
  deliberate LAST-RESORT fallback behind autoFob/qsr_labor_summary, matching the standing
  auto-first rule, not a violation; `sage.js`'s `ds.laborRows?.length` is a presence-only OR'd
  existence check (`sageHasData`), not a metric-value read.
  ✅ **One real, confirmed violation FIXED 2026-09-07 (v5.398).** `store-analytics.js`'s
  `ShiftAnalysisTab` (Store Analytics > Shift Analysis) DID average `ds.laborRows` directly for
  sales + all 5 channel-mix percentages (DOW breakdown table, Weekday-vs-Weekend cards, 3 Peaks x
  Labor Gap same-day lookup, Competitive Intelligence same-day/DOW-avg lookup) with zero auto
  fallback — the whole tab went blank on a cloud-only device. Routed through metricSeries/
  metricDaily; added `bfMixPct`/`mopMixPct`/`kioskMixPct`/`delivMixPct` chains to
  `metric-source.js` (manual Labor → emailed Sales Ledger, `mode:'any'` per the kvsHealthy/park
  zero-vs-missing precedent) alongside the existing `dtMixPct`. Both ratchet CEILINGs
  (`ratchet-raw-metric-rows.test.js`, `ratchet-week-day-arithmetic.test.js`) lowered to match. 2
  new tests render the real `ShiftAnalysisTab` against a cloud-only fixture.
  ✅ **A second real violation FIXED 2026-09-07 (same PR).** `signals.js` had 3 separate
  store-picker/location-filter dropdowns (`SignalBuilder`'s Scope select, `ScannerTab`'s scope
  select, and — widest blast radius — `SignalsPanel`'s panel-wide location filter that gates
  every Signals tab including LiveOps, which reads the fully-automated `qsr_daily_activity`
  stream and never touches `laborRows`/`opsRows`/`schedRows` at all) each built by unioning
  presence across those 3 manual/legacy sources only, so a cloud-only store never appeared in its
  own filter. Fixed to `Object.keys(STORE_NAMES)`, matching the same file's own pre-existing
  `ParkOepeTab` pattern (`LOCS`, ~line 2028). `CsatDriversTab`'s `availLocs` (scoped to stores
  with real SMG rows) is correctly left alone — SMG has no auto-first source, so presence-scoping
  there is the right behavior, not the bug.
  **Deliberately NOT touched — `SignalsPanel`'s `filteredDs`** (feeds `computeInsights` only when
  a location filter is active, still built from `laborRows`/`schedRows`/`opsRows`/`fobRows`/
  `exceptionRows`/`smgFullscale` only). `computeInsights` (`engine/insights.js`) fans out to ~30
  `sig_*` functions with a mix of raw-row and `metricSeries` reads — auditing which `ds` fields
  each actually needs is real, separate work, not a safe quick extension of the picker fix.
  ✅ **Several more files audited 2026-09-07, confirmed clean — not violations, don't re-flag:**
  `scheduling.js` (its 2 hits pass `ds.laborRows`/`ds.ctrlRows` into `OpportunityReport` as
  last-resort fallback props alongside real cloud sources — glimpseRows/qsrActSummaryRows — same
  already-verified-clean pattern as the compute6wk/record-day corrections above); `store-dash.js`
  (its 1 real code hit is a `useMemo` dependency-array entry, `[stores,ds.laborRows,
  ds.qsrActSummaryRows,DR.s,DR.e]` — only triggers recompute, the memo body itself calls
  `matchedVsLY`/`lyQuality` from `engine/vs-ly.js`, already auto-first; its other hits are
  comments documenting past fixes); `engine/backtest.js`'s `calibrateStore` — its raw
  `ds.laborRows` read is **deliberate and already reverted once**: its own comment says routing
  through `metricSeries('sales')` in v4.904 broke calibration for all 27 stores (mismatched row
  universe fed to `detectCleanDataStart`/`fetchLY`) and was reverted in v4.906. Do not re-attempt
  this conversion without re-reading that comment in full first.
  ⚠️ **Real gap in `engine/why.js`, RE-MEASURED 2026-09-07 — the "pure overreach" theory below
  is WRONG, corrected the same day it was written.** Read `forecastDay` (`engine/forecast.js:1535`)
  and `diagnoseMiss` (`why.js:89`) directly before touching anything here again:
  - `forecastDay`'s `_aeAct`/`_ewmaAct` actual-sales lookup (via `locRows`/`fetchRecentActual`,
    `forecast.js:411-429`) is genuinely **manual-`ds.laborRows`-first, auto-DAR-fallback** —
    this is the OPPOSITE order of the standing auto-first BI-display rule, but it is a separate,
    already-reviewed, explicitly documented decision (dispatch22 Workstream A comment) for
    calibration consistency, not the anti-pattern this backlog item is about. `locRows` handles
    an empty/absent `ds.laborRows` safely (`fallbackRows||[]`), so a cloud-only device still
    falls through to the auto DAR correctly — `forecastDay` itself is NOT the blocker.
  - **The real blocker is `ds.loaded`, confirmed still `ds.laborRows.length>0` verbatim**
    (`engine/pipeline.js:129,790` — `ds.loaded=ds.laborRows.length>0;`). `diagnoseMiss`'s
    "Single-store anomaly" cause (`why.js:152`, `if(ds&&ds.loaded&&missPct>8...)`) is gated on
    this, and only becomes reachable via `ds.loaded` being true in the first place — so
    **relaxing `runWhyEngineScan()`'s own `!ds.laborRows` gate alone would unlock nothing**;
    the deeper `ds.loaded` check inside `diagnoseMiss` (and `runWhyEngineScan`'s own use of
    `ds.lastActual`, likely the same family) still silently disables it on a cloud-only device.
  - **This is the SAME already-tracked systemic item as §14's `ds.storeIds`/`ds.loaded`
    line below** ("both manual-labor-derived... 10+ `if(!ds.loaded)` gates in `analytics.js`
    alone are unaudited") — `why.js` is one more confirmed consumer of that root cause, not a
    separate bug. Fix `ds.loaded`'s definition there (make it auto-first-aware — e.g. true if
    ANY real data source has rows, not just `laborRows`) and `why.js`'s gate very likely clears
    itself as a side effect; do not patch `why.js` in isolation first.
    ✅ **RESOLVED (v5.421, 2026-09-10) — see §14's `ds.storeIds`/`ds.loaded` line for the fix.**
    `ds.loaded` is now auto-first-aware; `diagnoseMiss`'s "Single-store anomaly" gate clears on a
    cloud-only device as predicted, with no `why.js`-local change needed. Not independently
    re-verified against a live cloud-only session (no such session available in this sandbox —
    see the standing "measure it" rule) — the derivation itself is unit-tested exhaustively.
  - `crossStoreCheck()` (`why.js:9`) is a genuinely separate, harder conversion regardless of the
    `ds.loaded` fix: it directly filters `ds.laborRows` to build a same-day-of-week peer baseline
    (mean/std across ALL other stores) with no bound on history, plus `fetchRow(ds.laborIdx,...)`
    for the "actual" value — both manual-only, no auto fallback, and NOT downstream of `ds.loaded`
    (it has its own independent `!ds.laborRows` gate at line 10). Converting this needs
    `metricSeries` bucketed by DOW (same pattern used in this session's store-analytics.js fix)
    but ALSO needs a deliberate choice of lookback window, since the original code implicitly
    uses unbounded history — don't invent a window without checking what "enough peer data"
    (`peers.length<4`) implies about the original's effective sample depth.
  ✅ **Two more engine files audited 2026-09-07, confirmed clean:** `engine/promo-roi.js`'s
  `buildDailyRecords()` already sources sales/GC glimpse→salesLedger→laborRows→qsrActSummaryRows
  and discount opsCashRows(auto)→ctrlRows(manual) — its raw `ds.laborRows`/`ds.ctrlRows` reads
  are deliberate fallback legs in an already-hardened, heavily-documented matched-day engine
  (dispatch-113, dispatch-111, the promo-roi-denominator-bias finding — read that history in
  full before touching this file's split logic, it has burned two prior "obvious" fixes already
  measured biased in opposite directions). `engine/review-engine.js`'s `laborM =
  byMonth(ds.laborRows)` (~line 1582) is explicitly kept as a **documented fallback AFTER**
  auto-first resolution (dispatch #174/#142/#109's own comments spell out exactly what still
  reads `lr` and why) — not a fresh violation.
  ✅ **Sweep effectively complete 2026-09-07 — the remaining files audited, one more real find
  fixed, rest all clean.** `engine/vs-ly.js` (`autoFirstDaily`, the shared matched-day helper
  `store-dash.js`'s `gcVsLYMap` memo and others call) checked directly, not just inferred: reads
  `laborRows` first then fills current-day gaps + supplies same-date LY from `qsrActSummaryRows`
  — a deliberate, documented consolidation of 4 previously-buggy reimplementations (its own header
  comment), not a violation despite the manual-first order. `graded-visits.js`'s per-visit
  `contextData()` already prefers glimpse (auto) first, `ctrl`/`lab` (manual) only as later
  fallbacks (dispatch20). `smart-targets.js`'s only hit is a comment. `at-a-glance.js`'s and
  `labor-tools.js`'s hits are either dependency-array/`.length` presence checks (legitimate,
  same category as `sageHasData`) or — `labor-tools.js`'s `locStats`, checked in full — already
  migrated to `metricAvg`/`metricRate` for every metric that HAS a registered auto source
  (dispatch #324/#323/#309/#155); the one remaining raw read, `crewHrs`, is a real, narrow,
  **already-documented** gap (`metric-source.js` has no auto chain for it at all yet — not
  negligence, a stated scope cut) rather than a fresh find.
  ✅ **One more real violation FIXED 2026-09-07 (same PR) — genuine dead code, not an auto-first
  gap.** `analytics.js`'s `generateInsights()` (District View "AI Insights" button) declared
  `laborRows`/`ctrlRows`/`opsRows` (raw-filtered from `ds`) plus an `avg` helper, then never
  referenced any of them again anywhere in the function — the AI prompt's `ctx` object is built
  entirely from already-computed `p.`/`t.`/`store.` fields. Confirmed via a search of the full
  function body (not an unused-import guess) before deleting. `ratchet-raw-metric-rows.test.js`
  `CEILING` lowered 149 → 143 to match.
  **This closes the `labor_rows` sweep as a backlog item** — every file the original grep flagged
  has now been read and classified. Final tally: 2 real UI violations fixed (store-analytics.js's
  ShiftAnalysisTab, signals.js's 3 location pickers), 1 real dead-code cleanup (analytics.js), 1
  real but deliberately-deferred systemic gap identified (`why.js`/`ds.loaded`, cross-linked to
  its own tracked item below), 1 narrow documented gap left as-is (`labor-tools.js`'s `crewHrs`,
  no auto source exists), and roughly a dozen files confirmed already correct with real
  documented history. The original "20 files" grep count was, as suspected from the start,
  overwhelmingly false positives — do not re-run this sweep from scratch; if a NEW raw-row hit
  shows up later, treat it as its own fresh finding; don't assume the old audit still applies to
  code that's changed since.
- [x] ✅ **RE-VERIFIED 2026-09-07 — stale, already fully done; do not re-raise.** Read
  `compute6wk()` directly (`engine/forecast.js:992-1117`): every one of its 28 per-field averages
  (the full `r={...}` literal, `oepe` through `oppCostDollar`, including the "manual-only" ones —
  their own comment explains they go through the resolver too, since `metricAvg` for a
  MANUAL_ONLY_METRICS key just resolves to the same manual read, not a separate raw-array scan)
  already reads through `M(key) = metricAvg(ds,[loc],_range,key) ?? 0` — the auto-first resolver
  (`engine/metric-source.js`), not raw `ds.opsRows`/`ctrlRows`/`laborRows`. The remaining raw
  array reads below that literal (`kvsu`, `t2w`, `avgCheck`, `depositVsSalesRatio`, etc.) are
  genuinely bespoke DERIVED metrics (window comparisons, ratios, a null-vs-zero presence fix with
  its own dated writeup) that don't fit `metricAvg`'s single-field-average shape in the first
  place — not raw reads standing in for ones the resolver could serve.
  **`avg6()` itself is dead code** — still defined and exported (`forecast.js:433`), imported in 3
  files, but never actually *called* anywhere in `src/` (confirmed: `avg6(` as a call, not a
  comment/import, matches zero real call sites). `compute6wk` reimplements the same trailing-avg
  shape inline for performance (its own header comment explains why) rather than calling the
  function. So "fix avg6's zero-skip bug" would patch code nothing runs — not worth doing on its
  own. If the zero-skip *concept* (treating a real 0 observation as "no data," per `obs6()`'s own
  note on this) is still suspected live somewhere, it would have to be chased in `metricAvg`
  itself or a specific metric's chain — a different, real investigation, not this line.
  ✅ **Follow-up done 2026-09-07:** removed `avg6()` and its 3 dead imports (`labor-tools.js`,
  `smart-targets.js`, `App.js`) — confirmed fully unused per the above, and safe to delete per
  `metric-chains.test.js`'s own text-scan ratchet (still passes — it greps `compute6wk`'s source
  for `field:avg6(...)`, which now simply never matches, closing the loop that ratchet exists
  for). `obs6()` (still live, called by `compute6wk`'s own `_cov` map) kept as-is; its and 2
  other comments' now-dangling references to the deleted function reworded.
- [x] ✅ **DONE 2026-09-07 (owner-confirmed).** `dt-speedofservice.js`'s 2-4pm daypart label
  renamed 'PM' → 'Snack', matching `morning-brief.js`/`store-analytics.js`'s own naming for the
  same daypart (`id:'pm'` unchanged, internal only).
- [ ] **Metric Registry/Resolver unification** — merge `signal-registry.js` (~110 metrics) and
  `metric-source.js` (~50), add lineage, aggregation metadata, catalog UI, CI enforcement. Named
  independently in `notes-57`/`notes-60`/`notes-61`.
- [x] ✅ **MEASURED 2026-09-07 — settled.** A service-role read of `public.qsr_field_definitions`
  (bypasses RLS, so this is a real count, not an anon-key ambiguity) returned `content-range:
  */0` — **zero rows, across every `page_key`.** `backlog-master-2026-08-19.md`'s "done
  v4.386/v4.387" claim describes the scraper SCRIPT + table + RLS shipping, which is true, but
  no report has actually been scraped into it in production — the coverage question this item
  asked ("which reports have actually been scraped") is answered: none. Whether that's because
  the scraper was never run live, ran and wrote nowhere, or the table was later cleared is not
  determinable from this environment; if the info-icon dictionary is wanted, the scraper
  (`scripts/qsrsoft-field-scraper.mjs`) needs an actual interactive run against QSRSoft (owner
  DevTools/browser session), not a code fix.

*(Archive: §3)*

## 4. Correctness Bugs

- [ ] `[Violation] click handler 1382ms` on nearly every click — **attempted with a real live
  click trace 2026-09-10, does NOT reproduce; redirects the next attempt, doesn't close the item.**
  Ran the dev server + a headless Playwright/Chromium driver (`/opt/pw-browsers/chromium`, same
  pattern `e2e/smoke.spec.js` uses) with a `PerformanceObserver({entryTypes:['longtask']})`
  installed plus a console listener filtering for `[Violation]`, then clicked through 11 real
  top-bar controls (SAGE toggle, location pills, date range, settings, dark mode) AND 11 real
  left-nav panel switches (Home, District View, Needs Attention, Daily Brief, Date-Range Report,
  Org Summary, Leaderboards, Planning, Events, 3PO Delivery, Graded Visits) — every click
  registered, every panel mounted, zero longtask entries and zero console violations across all
  22 clicks. Most likely explanation: this sandbox's Supabase credentials return zero rows for
  every tenant table (`e2e/README.md`'s own documented limitation), so every panel here mounts in
  its genuine "0 stores, no data" shape — a click-handler cost this specific is very plausibly
  data-volume-dependent (a large real DAR/labor/FOB row set driving a render the empty state never
  exercises), which a headless container with no real tenant data structurally cannot reproduce.
  **Next step, if this is still worth chasing: capture the same trace from a REAL loaded session**
  (the owner's own browser, DevTools Performance panel or the same PerformanceObserver snippet
  pasted into the console, against real production data) — that is the only environment that can
  actually contain the click volume this bug needs to show up.
- [ ] React render ≈100% of main-thread blocking (older trace) — fix direction known (coalesce
  `setDs` sites, defer `ds` to heavy views), not implemented. Possibly overlaps the render-storm
  item in §14 below — check before treating as separate. Same data-volume caveat as the item above
  likely applies to reproducing this one too.
- [ ] "SAGE Scheduled Runs" tile appears twice as the single worst-cost click — unexplained.
  Re-checked 2026-09-05: only one `SageRunsTile` render call site in code, which doesn't rule out a
  double-fetch-on-click. **Also attempted 2026-09-10 alongside the click-handler item above** (the
  same driver clicked the SAGE toggle) — zero longtasks recorded, but that run never opened the
  actual At-A-Glance tile grid this specific item is about (SAGE was only toggled from the top
  bar), so this one specifically is NOT resolved by that measurement — still needs a live click
  trace against the real tile, ideally with real data loaded.
- [x] ✅ **BUILT 2026-09-07 (v5.389) — do not re-implement.** `fetchAll()`
  (`src/lib/supabase.js`) now wraps every page attempt in `_withPageTimeout()` (30s), which
  races the real request and resolves with a synthetic no-`.code` error on timeout —
  classified retryable by dispatch #218's own `_isRetryablePageError`, so a hung page reuses
  that exact retry-then-give-up path (no new UI, no new failure mode). 6 new tests
  (`dispatch-fetchall-page-timeout.test.js`).
- [ ] Yearly Planning YTD — if the owner's numbers genuinely look wrong, needs fresh diagnosis
  (`monthly_targets` coverage, `dayFrac`/current-month proration math, or a location-mapping
  mismatch). **The Jan-Mar manual-upload-gap hypothesis is refuted** (measured: DAR-sourced,
  2367/~2430 rows, 97.4% coverage) — don't re-chase that specific mechanism.
- ✅ **FIXED 2026-09-08 (v5.401).** Re-investigated the lead directly: `darByLoc`'s own
  accumulator (`morning-brief.js`) already gates `sales`/`projSales` to the SAME hour-slot rows
  (`if(product_sales>0){sales+=...;projSales+=...}`), so `salesVsExp` is a proportional ratio of
  elapsed-hours-only sums, not vulnerable to the #153-style always-24-slot dilution — and
  `gcVsExp` only ever reads `labor?.gc` (no DAR/auto GC field exists), so it stays `null` and the
  alarm can't fire at all on a cloud-only device. The REAL bug was one level up:
  `getLatestBriefDate()` only checked `laborRows`/`ctrlRows`/`peaksSvcRows` (all manual-upload)
  and fell back to literal `new Date()` — today, in-progress — whenever a device had none of
  those, which is exactly the cloud-only case this backlog cut's own "6+ weeks stale ctrl_rows"
  observation describes. That silently selected an in-progress business day for EVERY rule in
  the evaluate() set (T-Reds, OEPE, staffing gap, not just GC_SALES_DIVERGE), risking false
  RED/AMBER flags on partial-day data. Fixed: also reads `ds.qsrActSummaryRows` (auto DAR
  rollup) and clamps the result to `lastClosedBusinessDay()` (`src/utils/date.js`). 4
  new/updated tests in `morning-brief-geo.test.js`.
- [x] District View compound claim — **re-verified 2026-09-07: 3 of 4 sub-claims were stale,
  already fixed; only the TPPH one is real.** (`src/views/store-dash.js`, wired via
  `src/views/store-analytics.js`'s `StoreDash` tab dispatch.)
  - ✅ Stale — Forecast Table missing Goal/OEPE/TPPH/Labor%: `ForecastTable` (`store-dash.js:608`)
    already renders all four columns (`Goal`/`OEPE`/`TPPH`/`Labor%` headers ~909-914) with real
    per-day + period-total values from each `ForecastRow` (~355, populated ~529-534). Not missing.
  - ✅ Stale — Scorecards→Controls missing data: `CtrlScorecard` (`store-dash.js:1157-1276`)
    renders all 5 grouped tables (Cash Integrity/POS Integrity/Refund & Discount/Meal
    Activity/Overtime) with explicit `_cov` observation-count guards (~1205-1227) that suppress
    fabricated zeros rather than showing missing data — the opposite of the claim.
  - ✅ Stale — Forecast Accuracy "Scheduled Projection" reads too high: this was the real
    unpaginated-1000-row-cap bug, already fixed 2026-08-08. `loadQsrProjections()`
    (`src/lib/supabase.js:2933-2952`, see its own header comment ~2922-2932) now reads the
    pre-summed rollup table via `fetchAll` pagination instead of a bare capped select.
  - [x] ✅ **DONE — already merged (#1185, "District View Action Plan TPPH"), stale here.**
    `generatePlan()` (`store-dash.js`, ~line 1526) now has a sixth block: `if((t.tTpph||0)>0&&
    (p.tpph||0)>0&&(p.tpph||0)<t.tTpph*0.9)` pushes a HIGH-priority "Labor Productivity" (⚡) action
    item, matching the OT/Cash O/S/OEPE/T-Red/Labor% pattern exactly. Covered by
    `store-dash-action-plan-tpph.test.js` (3 tests). This backlog line was not updated when #1185
    landed — confirmed live in code 2026-09-07, do not re-build.
- [x] ✅ **RESOLVED — stale, already shipped and merged (v5.311, PR #1009, 2026-09-01); do not
  re-raise.** This line asked for exactly what v5.311 already did: dispatch #88's original fix (PR
  #633) shipped without a reachable live Supabase session and never verified wall-clock; v5.311
  re-measured against real production `qsr_daily_activity` with a live `SUPABASE_SERVICE_ROLE_KEY`
  and found the real remaining defect — `_pagedParallel`'s `count:'exact'` head-count query could
  itself hit a Postgres `57014` statement timeout on cold cache (measured ~8.1s), which fell back to
  the strict-sequential `fetchAll` and reproduced the original "15+ second" complaint end to end
  (measured ~17.5s total). Fixed by switching the head-count to `count:'estimated'` (immune to the
  same timeout, measured 330-520ms) plus a safety-extension loop that keeps fetching past the
  estimate until a short/empty page proves the true end (measured live: closed a real 42,105-vs-
  45,136-row undercount, returned all rows). Live wall-clock, same 90-day query, cache-warm: old
  sequential 9,575ms → PR #633's fan-out 2,177ms (but with the timeout tail risk) → this fix's
  2,666ms with no tail risk. Re-confirmed 2026-09-10: `src/__tests__/dt-history-pagination.test.js`
  (11 tests) passes on current `main`, and the changelog entry is present at
  `src/app/changelog/5.311.js` on `origin/main`.
- [ ] `diffUserEventsForCloudSync` multi-day-span label-suffix gap — deliberately deferred.
- [ ] Production RLS — no concrete sign anything is broken (re-investigated 2026-09-06; everything
  measurable points away from RLS as a cause, and the actual "FOB shows stale/empty" symptom this
  was probably filed against already has a real, unrelated, confirmed fix). Only reopen with a
  fresh, dated measurement if the owner has actually seen an authenticated session return empty
  `qsr_fob`.

*(Archive: §4)*

## 5. New Data Sources / Automation

- [ ] `productMixDiscount` pull (`disc_amt` reconciliation) — endpoint shape never captured, needs
  a real DevTools capture. (PMIX itself, the multi-store `loc` field question, the scheduled
  Action, and the failure-watch entry are all already shipped — don't re-scope those.)
- [ ] Graded Visits auto-pull from McDonald's (currently manual).
- [ ] Demographics per location (Census/ACS API).
- [ ] Register Audit **engine** (searchable, smart detection, SAGE+Signals integrated) — whole
  workstream, not started. (The Register Audit *pull* itself is live — see §15/§14, different
  scope: this is the analysis layer on top.)
- [ ] Local News → event discovery, promoted into candidate Calendar events.
- [ ] Calendar Manager smart insights (news-discovered events → forecast flag → owner accept).
- [ ] **Online Reputation module** — 3-phase build plan ready, nothing built: Phase 1 (Google
  Business Profile API application, DoorDash Reporting API request, direct-RSS local news), Phase
  2 (GBP backfill + real-time alerts, DoorDash nightly, SerpApi gap-fill ~$25/mo), Phase 3 (Uber
  Eats manual CSV, Apple Business Insights). Explicitly skip: Facebook, TripAdvisor, Yelp, Bing,
  Grubhub, Postmates, Google Places, Instagram (no viable path).
- [ ] Write-back to QSRSoft (push Targets, two-way sync) — exploration only.

*(Archive: §5)*

## 6. EOM / Inventory / Food Cost

- [ ] Inventory Control weekly-count completeness rules — **cannot be built on the current table**
  (`qsr_raw_item_detail` is $50-threshold-biased, zero Condiment rows); needs a switch to
  `qsr_onhand` + a mid-month concept that doesn't exist yet + paper-count inclusion. (A separate,
  already-fixed Condiment `active_in_recipe` flag bug in `count-cycle.js` does NOT touch this item
  — different table, different root cause.)
- [x] ✅ **RE-MEASURED 2026-09-07 — stale, already shipped, do not re-build.** Both halves of this
  line are already live in `eom-dashboard.js`'s Weekly Count Cadence panel (click a store to
  expand): (1) `lastCountAnchor()` + `fobDailyTrace(fobRows, { loc, period, since: anchor })`
  anchors the loopback on the last actual physical count, not the calendar-month boundary
  (labeled "Notes 58 #2" in the code's own comment, clamped to the period start since `qsr_fob`
  is month-to-date cumulative and can't diff across a month reset); (2) the per-item chart IS
  rendered — `VarianceTraceChart` (the day-by-day FOB trace) plus a "Biggest between-count
  variance windows" per-item list (`itemVarianceWindows`, `weekly-cadence.js`) both render in the
  drill-down. `store-cockpit.js`'s separate Food Cost Cockpit tab has its OWN `fobDailyTrace` call
  that deliberately stays calendar-month-anchored (documented inline as a scoped deferral — real-
  count bracketing needs `weekly-cadence.js` session data that tab doesn't otherwise load), which
  is not a gap in this item, a different, intentionally-simpler view.
- [x] ✅ **DONE 2026-09-07 (owner-directed: "put it into effect for weekly counts as well").**
  `ItemsRecountedTile` (`at-a-glance.js`) was gated to a district-wide EOM close window (last 3
  days of month + first week after); now always-on, with a per-store window anchored to each
  store's own most recent complete weekly count (`weeklyRecountWindows()`, new,
  `engine/count-cycle.js`, reusing `cycleCompliance()`'s own `lastWeekly`). Subsumes the EOM case
  rather than running alongside it — a store's close-window count IS also its most recent weekly
  count. `eom-ledger-baseline.js`'s `itemCloseWindowRecount`/`ledgerBaselineDiff`/`ledgerScopeDiff`
  gained an additive, backward-compatible `closeWindowEnd` param (defaults null = unbounded,
  unchanged EOM behavior) so a per-store window doesn't bleed into the FOLLOWING week's regular
  count. 7 new tests (2 component-level against the real `AtAGlance` call site, 4 on
  `weeklyRecountWindows` directly, 1 pre-existing suite re-verified).
  **Also raised `COVER_FRAC` 0.75 → 0.95** (same PR, owner-directed: *"they are expected to
  perform a full weekly count each week. Not partial. So the bar should be the higher
  threshold."*) — this is what "complete weekly count" means EVERYWHERE it's used (Count Cycle's
  own overdue-grading included), not just this tile. Live-measured before landing on 0.95: 0.98
  (EOM's own bar) flips 21/27 stores (78%) to overdue for a single real period — most genuine
  full counts never hit exactly 98% of the active-item universe, reading as noise; 0.95 flips a
  real, actionable 7/27 (26%). Full numbers in the PR body. 2 existing test fixtures
  (`count-cycle.test.js`) bumped from their old borderline counts to genuinely-full counts to
  keep demonstrating their own point (independent-flags mechanism) at the new bar.
  ⚠️ **SUPERSEDED 2026-09-08 (v5.405→v5.407) — the `weeklyRecountWindows()`/`qsr_onhand` design
  above missed a real case and was replaced.** Madill (loc 13113) counted a Partial weekly on
  09-07 (~7% FOB) and fully redid it on 09-08; the tile never showed it, because `qsr_onhand`
  upserts on `(loc,period,wrin)` — a live snapshot, not a log — so the 09-07 date was overwritten
  in place by the 09-08 recount before the tile could ever see two distinct sessions. v5.405
  first fixed this by reading a new append-only log (`inv_count_sessions`); v5.406 simplified it
  further per owner follow-up ("the different count data should be easy to get from the raw item
  detail... thought we already were") — the tile now derives its recount window INTRINSICALLY
  from `qsr_raw_item_detail`'s own per-item count-day clustering (`autoWindowDays`,
  `eom-ledger-baseline.js`), no `qsr_onhand`/`inv_count_sessions`/store-level session concept at
  all. v5.407 then hardened `qsr_raw_item_detail` itself: its per-pull upsert was a blind
  full-array REPLACE (an item dropping out of the daily top-50 actionable selection had its
  stored history frozen with no trace of what happened while excluded) — now merges via
  `mergeRawItemHistory()`. Full writeups: `memory/finding-recount-window-onhand-overwrite-2026-09-08.md`,
  `memory/finding-raw-item-detail-merge-2026-09-08.md`.
- [x] ✅ **RE-MEASURED 2026-09-07 (v5.390) — this line was stale; 3 of 4 spots were already done.**
  Re-checked against current code before touching anything (per the "measure it" rule): the
  Change Monitor Baseline-diff box, **ItemJourneyView** (`csOf`, `eom-dashboard.js:1338`), and
  **FOB Report "Top item losers" + its printable HTML** (`fobCaseSuffix`, `eom-dashboard.js:2219`,
  used in both the on-screen table and `fobRepPrintHtml`) all already carry the case-pack suffix.
  Only the **🔬 FOB Root-Cause Analysis modal's Recount Impact drill-down** (`riddleOpen` in
  `eom-dashboard.js`, fed by `recountImpactByStore`) was genuinely still missing it — that engine
  function computed `unitVar`/`caseSz` internally (via `storeVarianceProgressions`) but never
  passed them out to its `items` array. Threaded through (`fob-recount-analysis.js`) + rendered
  (`rcCaseSuffix`, same shape as `csOf`/`fobCaseSuffix`) — do not re-implement any of the 4 spots.
- [x] ✅ **DONE 2026-09-08 (v5.404) — it did NOT tie out, and now does.** The reconciliation this
  item asked for was run for real: the owner compared Meridian's Item Journeys panel against
  QSRSoft's own "Variance Stat/Yields" screen for Madill (loc 13113) and found every sign
  flipped. Root cause: QSRSoft's `raw_detail/{itemId}` API returns `variance`/`difference`
  sign-INVERTED relative to `qsr_variance_stat` and its own UI for the same number — confirmed
  three independent ways (physical on-hand math, `qsr_variance_stat`, the QSRSoft UI itself) and
  reproduced on a second item. `mapRawItemHistory()` (`eom-parsers.js`) now negates both fields
  at the source, so Item Journeys/Swing Ledger/`reconstructMissingProducts` all tie out to
  `qsr_variance_stat`'s convention now, not just directionally. Full writeup:
  `memory/project-eom-item-journey.md` #3 (closed) and the PR body for #1205.
- [ ] Remaining EOM list: Inventory-Summary/Physical-Inventory endpoint capture; wire
  `monthly_targets` into fob-components + variance threshold; on-demand raw-item-timing drill;
  store yield BAND; CoachQ curated prompts; notification-settings UI.
- [ ] FOB day-by-day curve through the month (early-month skew theory) — needs historical mapping.
- [ ] Custom reports for non-QSRSoft panels (SMG/Voice, LifeLenz, calendars) — PACE done as first
  slice, rest open.
- [ ] ❓ Inventory troubleshooting/variance-window engine with crew narrowing — explicitly never a
  verdict, confidence-scored only; parked, sensitive.
- [ ] ❓ Original Food Cost panel — auto-source or merge into the newer area; decision needed first.

*(Archive: §6)*

## 7. Performance Reviews

- [ ] Personnel moves (loc↔loc, patch reassignment) tracking, editable override.
- [ ] Location-attribution rule tightening (day-weighted split + ≥70%-of-days flag) — AI
  recommendation given, not built.
- [x] ✅ **BUILT 2026-09-07 (v5.392) — do not re-implement.** `missingReviewTargets()`
  (`review-engine.js`) already existed, engine-tested, but had zero UI consumer. `ReviewEditor`
  now shows a persistent banner (visible on every tab, not just Summary) naming every scored
  metric with no resolvable target, plus a "Set Targets →" button that jumps straight to
  Customize > Targets (reusing the existing `perfReviewsEntry`-style deep-link mechanism,
  now made re-triggerable from inside the panel via `customizeEntrySection` state, not just
  App.js's one-shot mount prop). "One-click Smart-Targets seed" was scoped down to "jump to the
  real Targets editor" rather than auto-filling a guessed value — most of these metrics (OEPE,
  KVS, FOB%, etc.) have no sales-forecast-style model to seed a sensible default from, and
  writing a fabricated number into a scored review is worse than an honest "no target set" flag.
  3 new tests (`missing-review-targets-banner.test.js`), renders the real
  `PerformanceReviewsPanel → ReviewEditor` chain per this repo's own "verification must touch
  the call site" rule.
- [ ] DM/shift-role review wiring — link a review to `geid`, decide which manager-attributed
  metrics score it. (The underlying report pull already shipped, v4.550 — this is the only real
  open piece of that item.)
- [x] ✅ **BUILT 2026-09-06 (v5.386) — do not re-implement.** Toggle-gated, off-by-default,
  separate pass/fail gate (Labor −0.25pts of target / FOB −0.15pts of target), fully additive —
  `computeScores`/`computeScoreBreakdown` never read `cfg.bonusEligibility` at all, proven by a
  same-output-on-vs-off regression test. New `bonusEligibilityForMonth`/`bonusEligibilityForPeriod`
  in `review-engine.js`; toggle in Customize → Weights; badge on the review Summary tab. 16 tests
  (`bonus-eligibility-module.test.js`).
- [ ] **FS Completion T-60** (`fsTablet`) — still `src:'manual'`, no existing API research or
  credentials for either vendor (FL = Jolt, OK = Squadle). Needs a dedicated session per vendor;
  confirming the owner even has all-locations API access to either is itself an open question.
  (Shift-Certified Mgrs, Headcount, Turnover90, and FS EcoSure are all already `src:'auto'` — don't
  re-flag those.)
- [ ] FS EcoSure/Audits/Tablet **scoring mechanism** — still genuinely open (owner: "figure out
  together + TEST," no %-of-target design settled yet).
- [ ] "2026 PACE" review template — blocked pending the full current-year Sales/Profit/People PACE
  weights from the owner (only RGR-category weights known so far).
- [ ] Performance Reviews Phase 2 punch list: Dev Plan tab, wage-review-section wiring, YoY trend
  view, hourly-manager reviews, tag/search by score.

*(Archive: §7)*

## 8. Leadership One-Pager

- [ ] Operator→DO pulse — 5-tile "any fires" card (design given, not built).
- [ ] Promotions/Training/Other-Initiatives area — not built.
- [ ] Top-of-Discussion report — pre-populate relevant names for scope.
- [ ] ❓ Labor% current-day DAR fallback — deliberately deferred pending owner's explanation of
  FL-vs-OK labor-usage differences.
- [x] ✅ **RESOLVED 2026-09-06 — do not re-open.** Re-measured live: FL district FOB% YTD 2026 is
  **4.03%** (dollar-weighted, using the real `fobByRange()` function against real `qsr_fob` rows),
  every FL store in a sane 3-5% range. The ~14.88% anomaly is gone under the current
  `prodSalesAmt<=0` guard + per-month snapshot-differencing. Full measurement:
  `memory/finding-fl-fob-ytd-normalized-2026-09-06.md`.

*(Archive: §8)*

## 9. SAGE Enhancements

- [ ] **Tool-breadth expansion** — give SAGE the metric resolver as a generic query tool. Flagged
  as the single biggest available win; SAGE itself, asked directly, independently named the same
  gap as its own top pick. ⚠️ **Re-inventoried 2026-09-07: SAGE already has 7 live tools, not the
  4 CLAUDE.md documented** (`query_labor_summary`/`query_eom_recount_impact`/`query_smg` had all
  shipped with no CLAUDE.md update — corrected there). This item's actual remaining ask is
  narrower than "SAGE has no query tools" might read: a GENERIC resolver covering the ~50 metrics
  `metric-source.js` knows, vs. today's per-source hand-built tools. Still genuinely unbuilt, and
  a real architecture question (the existing tools query Supabase directly server-side;
  `metric-source.js` is a client `ds`-based module that can't run as-is inside the Deno Edge
  Function — porting its per-metric sourcing logic server-side is the actual scope here, not a
  quick wire-up).
- [ ] Feed CLAUDE.md/memory standing rules into the system prompt.
- [ ] Pass active panel state as context (not screenshots).
- [ ] Personality tuning (system-prompt only).
- [ ] ❓ Outbound web access — needs a cost/abuse-boundary decision first.
- [ ] Conversation persistence / self-learning loop.
- [ ] Document/forms access — the eBOS form library or Resource Library exposed as a queryable
  source (SAGE's own ask; currently none of it reaches SAGE).
- [ ] Deeper history / longer lookback windows for trend and YoY work (SAGE's own ask — its tools
  are fixed ~60-day summaries today). ⚠️ **Partially stale, re-measured 2026-09-07 alongside the
  tool-breadth re-inventory above.** Most tools already take an arbitrary `start_date`/`end_date`
  with no window cap in their own schema (`query_daily_activity`, `query_labor_summary`,
  `query_forecast_snapshots`, `query_promo_roi`) — `query_labor_summary` specifically exists as
  the fix for this exact complaint on OT/staffing questions (its own prompt: "ALWAYS use this...
  never the fixed 60-day LABOR & STAFFING summary above"). **What's still genuinely fixed-window:
  the auto-injected "LABOR & STAFFING summary" context block** (`aggregateLaborSummary`,
  `sage-chat/index.ts`) — a pre-computed block added to every conversation regardless of the
  question, not a tool SAGE chooses to call. Whether that block itself needs a longer/adjustable
  window, or whether `query_labor_summary`'s existence already makes it moot for date-range
  questions, wasn't re-scoped here.
- ⚠️ **STALE 2026-09-08 — this whole item was already substantially built (dispatch #80,
  2026-08-23), the "designed but not built" framing was wrong.** `supabase/functions/sage-chat/`'s
  `search_project_memory` tool + `memory-kb.js` already implement admin-only role gating,
  fail-closed frontmatter classification (`open`/`restricted`/`excluded`, unclassified = invisible
  to everyone), and a hard SQL-level filter (not a prompt instruction) — verified live in code,
  not from the design doc. The genuinely-missing piece (the design's own "mandatory
  handling-notice templates," explicitly listed as out of scope in dispatch #80's own text) was
  built today: the owner-approved notice wording now prepends to every restricted excerpt at the
  tool-output layer. **Still genuinely open:** subject-based gating (`subject_locs`/
  `subject_people`) — narrower than originally framed, since role-gating alone already prevents
  the owner's named failure mode (a GM/supervisor seeing a restricted finding about their own
  store); the remaining gap is only an admin-tier person implicated in a finding about
  themselves. Full detail: `memory/dispatch-80.md`'s "Mandatory handling notice" section.

*(Archive: §9, §14)*

## 10. Signals / Visit Readiness / Attention

- [ ] ❓ Visit Readiness rethink — "how to get ready and stay ready" diagnostic ruleset, needs a
  design session.
- [ ] Graded Visits — more correlation analysis (open-ended).
- [ ] ❓ Scoring-system revisit (Ops/Controls/Combined/District/Model Health) — needs a joint
  owner session, findings already ready.
- [ ] Multi-user startup-load tiering (core vs. extended fetch by role) — design decision needed
  before P4 rollout, not urgent solo.
  **Owner Q 2026-09-07: "should we load data per-panel as it's needed instead of front-loading
  almost everything on hard refresh?"** Answered inline, logged here to revisit rather than act on
  now. Current state (confirmed by reading `App.js`'s startup loader): it's already tiered — staggered
  `Promise.all` batches, core data first, bulkier streams following — but tiered by *what*, not
  *who's asking*: every role gets close to the full 27-store dataset regardless of which panel they
  land on first. **Recommendation: tune the existing tiers by role, don't go fully lazy-per-panel.**
  This is a power-user tool where one session hops Analytics → Store Dash → Labor Tools → Signals,
  and those panels share a lot of the same underlying rows (`laborRows`, `schedRows`, etc.) — full
  per-panel lazy fetching would trade one upfront wait for a stutter on every panel switch, likely
  worse for that usage pattern. The higher-leverage version: scope the *existing* tiers by role (a
  GM probably never needs the district-wide rollup tier at all) rather than deferring data to
  first-click. Revisit alongside the P4 multi-tenant/multi-user rollout, when role-scoped startup
  actually has a second concurrent user to matter for.
- ✅ **MEASURED 2026-09-08 — confirmed NOT built, via direct code read (Explore agent).**
  Detection (`detectSwing()`/`buildSwingFeed()`, `src/engine/swing-detect.js`+`swing-feed.js`)
  and ack (`acknowledge()`/`ackKey()`/`partitionAcked()`/`buildAckHistory()`, same file,
  persisted to `user_settings.swing_acks`) are both real and more built than the note implied.
  Cross-metric report and AI-scour-for-causes are genuinely absent: the swing UI's only
  "explain this" mechanism is `src/engine/swing-context.js`'s `newsContextFor()`, which scores
  pre-populated local-news headlines (`news_mentions` table) — it never reads labor%, OEPE,
  weather telemetry, or other-store data from Meridian's own metric stores, and never calls an
  AI. `why.js`'s `lookupMissEvent` (the actual Anthropic-API causal-lookup feature, Haiku 4.5)
  is a separate, unconnected system wired to forecast-miss flows (`store-dash.js`/`calendar.js`)
  — `SwingAlarm.js`/`swing-context.js` never import or call it. Both enrichment asks are real,
  scoped, unbuilt work — not yet sized or picked up.

*(Archive: §10)*

## 11. Bullseye Tile & State-of-Business Engine

- [ ] ❓ State-of-business walkthrough engine (evidence-first, learning loop) — presentation
  format still undecided, not built. (The Bullseye distribution chart itself already shipped —
  don't re-scope that.)

*(Archive: §11)*

## 12. Staged Experiments / Risk Tracking

- [x] ✅ **MEASURED 2026-09-07 — settled, do not re-open as "needs a live read."** A service-role
  `Authorization: Bearer` read (not the anon key — this session's `SUPABASE_SERVICE_ROLE_KEY` was
  live, see CLAUDE.md's own note that env access is per-session and can't be assumed from a prior
  session's measurement) against `public.store_assessments` returned **`PGRST205` — "Could not
  find the table 'public.store_assessments' in the schema cache."** That is a genuinely different
  finding than the anon key's old "zero rows": service-role bypasses RLS entirely, so PGRST205
  means the table **was never created in Supabase at all**, not that it exists with restricted/no
  rows visible. So the "8/20 stores rated as of 2026-08-14" figure this item originally tracked
  was never persisted anywhere the app (or this database) can read — it lives only wherever the
  owner was tracking it by hand.
  ✅ **BUILT the same day (owner: "panel built") — do not re-implement.** Real `store_assessments`
  table now exists (`supabase/schema-store-assessments.sql`, tenant + `my_locs()` RLS, `for all
  to authenticated` like `sched_retention_marks` — this is a manual/user-editable table, not a
  pull-written one) plus a panel (`src/views/store-assessments.js`, "🗒️ Store Assessments") that
  reads/writes it: per-store status (Pending/Rated), rating, assessed date/by, due date, notes,
  inline edit, and a rated/total progress card, scoped by the shared `LocationSelector`.
  Deliberately generic (`assessment_type`, default `'scheduling-workshop'`) rather than hardcoded
  to a specific 20-store cohort — tracks every store in scope, not a guessed membership list.
  `kind:'test-kitchen'` per the standing rule (every new panel starts there regardless of who
  requested it); real `section:'operations'` already set, so promotion later is a one-field flip.
  ✅ **Owner ran the SQL 2026-09-07 — confirmed live** (service-role read: `content-range: */0`,
  table exists, zero rows — no assessments entered yet). 7 new tests (`store-assessments.test.js`)
  on the two pure helpers (`mergeAssessmentRows`/`assessmentProgress`); a real live-data round-trip
  still couldn't be verified from this sandbox (its browser can't complete a TLS handshake through
  the environment's proxy to reach Supabase) — worth a real click-through to enter a rating.
- [ ] Living risk-factor engine for food cost + labor (computed track vs. assessed track, stored
  for trending) — owner suggests starting as a chip.

*(Archive: §12)*

## 13. Docs / Deployment / Ops

- [ ] Internal docs repository / KB expansion + accuracy audit.
- [ ] Document uploads (Supabase Storage bucket + RBAC).
- [ ] Generalized form-builder (weights/scoring) — deferred, own workstream.
- [ ] "Where's my data?" catalog.
- [ ] **Multi-tenant deployment path** (same as P4, §1) — per-tenant isolation, credentials,
  onboarding, ops monitoring, billing posture.
- [ ] Backup/rollback story for Supabase.
- [ ] Telemetry/usage DB (panel usage, error logs, pipeline health, tamper detection) — schema
  cheap, build is a real project; auto-shutdown should be flag-first, not automatic.
- [ ] ⚠️ **RE-MEASURED 2026-09-06, UPDATED 2026-09-07 — the `can_see_loc()` design named here is
  dead; a newer redesign already shipped.** RLS Phase 1 (closing anonymous-access tables) is done.
  Phase 2 was redesigned as `public.my_locs()` (not `can_see_loc()`, which now 404s live) and the
  helper function is confirmed live in production. **Step 1 now settled (2026-09-07):** the owner
  ran `select count(*) from pg_policies where permissive='RESTRICTIVE'` — **68**, confirming the
  RESTRICTIVE per-loc policies genuinely attached (more than `schema-rls-phase2-loc.sql`'s own
  "expect 51," which is expected — ~10 more schema files have shipped their own per-store
  RESTRICTIVE policy since that file was written). **Still open — the more important gap:** **no
  real profile today is restricted to a subset of stores** (measured: 3 profiles, 2 null, 1 with
  the full 27-store list), so per-loc isolation has never been exercised live even though the
  policies are attached. Full measurement + the concrete remaining step (a live login test with a
  genuinely-restricted profile): `memory/finding-rls-phase2-my-locs-2026-09-06.md`.
- ✅ **DONE 2026-09-08 — indexed into CLAUDE.md's own Dev Rules, do not re-index.** Pulled the
  x-auth-token sequencing rule, the `storePeoplePunches`/`employeeRoster` PII field lists, the
  service-role-key handling rule, and the TLS/proxy rule out of `pm-handoff-2026-08-15.md` §8 and
  `qsrsoft-report-catalog.md`'s two PII notes into one consolidated, checkable block in
  CLAUDE.md's Dev Rules section (deliberately did NOT index that file's stale
  "PM never pushes to main" line — it contradicts CLAUDE.md's current, more recent standing merge
  rule, so carrying it forward would create a real contradiction rather than a small omission).
  ❓ **The roster-workbook deletion itself remains a genuine owner-only open question** — confirmed
  via `git log --all --diff-filter=A` that no such workbook was ever committed to this repo (so
  there's nothing to find or fix here), but whether the owner has deleted the actual local files on
  their own machine can't be checked from this environment. On the owner-input list, not
  re-investigable from the repo side.
- [ ] App Store readiness roadmap (deliverable = roadmap doc only).
- [ ] ❓ Capacity-review questions (usage/dev-pace vs. growth; onboarding readiness for new users).
- [ ] ❓ Needs clarification from owner: "Aug 19-21 JR" note; Google Reviews "fun for now"
  confirmation.
- [ ] ❓ Run the v4.839 retail-event seed/measure scripts — blocked on owner go-ahead
  (production-writing).
- [ ] Sooner Rd/Tinker AFB event tagging; broader Event Lookup (major-retailer proximity, pop-up
  event detection).
- [ ] Task Queue + Feature Requests panel merge (IA decision).
- [ ] Panel Manager — list every panel with a locked "core" reference section.
- [ ] Data Manager — show source report per data type, extend to auto-synced sources.
- [ ] Save/Restore Session — verify it backs up what's needed, relocate in nav.
- [ ] ❓ LifeLenz AOS — needs an explicit owner decision (rescope vs. close); should NOT be picked
  up as originally filed.
- ✅ **RESOLVED 2026-09-08 — NO, traced end to end, both consumers confirmed correct.** Checked
  the two real places `sales_proj`/`tProdSales` gets consumed: (1) `CurrentMonthPaceSection`
  (`analytics.js`, the engine behind both the Planning→Monthly pace view AND the standalone Pace
  to Target panel) reads `(effMt[loc]||{}).tProdSales` where `effMt` is `ds.monthlyTargets` (or a
  fresh `loadMonthlyTargets()` call for a different month) — both correctly map the DB's
  `sales_proj` column, confirmed via `src/lib/supabase.js`'s `loadMonthlyTargets`/
  `loadAllMonthlyTargets`. (2) Smart Targets' own `officialFor(loc)` (`smart-targets.js:253-258`):
  the `sales` metric has no `officialVal` override (unlike every other metric in that list), so it
  falls through to the same `ds.monthlyTargets[loc].tProdSales` read. **Sales genuinely does not
  have the bug.** What DOES exist, and is what the code comment citing "#153's defect"/"#164"
  actually describes: `laborpct`/`oepe`/`fob`/`tpph`/`r2p`/`avgCheck`/`promo` (every OTHER Smart
  Targets metric) read `DEFAULT_TARGETS` directly via their own `officialVal`, bypassing the
  `settings.targets`/monthly-overrides merge chain — but that's a real, ALREADY-TRACKED, separate
  issue. Originally tracked under GitHub #164 ("Labor basis rollout: migrate all 69 t.tLabor
  readers to the resolver"), whose own detailed triage-first plan named `smart-targets.js:115`'s
  `officialVal` as one of the 69 readers to triage. **#164 itself closed 2026-09-10** (core
  migration + its finding-1 persistence gap both shipped, v5.414/v5.415) — the `officialVal`
  sourcing bug specifically was spun off as its own issue, **#177 (open)**, per #164's own triage
  note to keep it a separate commit. Not a new find — just the backlog's "#153/#167" citation
  pointing at the wrong bug for the wrong metric. No new item filed; #177 already covers the real
  remaining gap, sales excluded.
- [x] ✅ **FIXED 2026-09-07 (owner go-ahead given directly) — do not re-raise.** `package.json`'s
  `"xlsx"` dependency now points at `npm:@e965/xlsx@^0.20.3` (an npm alias — every existing
  `import ... from 'xlsx'` call site across all 14 files is untouched, zero import-site changes)
  instead of the unpatched `^0.18.5`. `npm audit` confirms both CVEs (prototype pollution, ReDoS)
  are gone from the report post-install; full suite (481 files/4608 tests) and build both clean.
  The remaining 5 high-severity `npm audit` findings (brace-expansion, browserslist, nanoid,
  pdfjs-dist, postcss) are unrelated transitive-dep CVEs, not part of this item.

*(Archive: §13, §14)*

## 14. Data pipeline / correctness / unbuilt features (from the coverage-sweep section)

- [ ] `parseLaborExceptions` parser exists (missed breaks, minors violations) with **zero**
  table/loader/pull wired to it. Report path likely exists
  (`/reports/mcd/people/laborExceptions`) but needs an owner DevTools capture to confirm the real
  endpoint.
- [x] ✅ **RESOLVED (v5.344, PR #1105, 2026-09-04) — stale, already shipped, do not re-raise.**
  The owner captured the real endpoint live (`GET /api/inv/{nsn}/inv_summary/rawitems`) —
  `scripts/qsrsoft-inventory-summary-pull.mjs` runs daily (12:30 UTC), watched in
  `sync-failure-watch.yml`. Re-measured 2026-09-07: the workflow has run 3 times, all
  `conclusion:"success"`, most recently 2026-09-06; a live service-role read of
  `qsr_inventory_summary` confirms **10,560 real rows** — genuinely populated, not just
  "running green with no effect." Not wired into `stream-freshness.js`'s `STREAMS` (deliberate,
  documented scope cut in #1105 — it's fetched panel-locally by `InventoryIntelligence`, not
  loaded into the global `ds` at startup like every other `STREAMS` entry); that remains a real,
  small follow-on if per-stream freshness coverage is wanted here, not a reason to reopen this.
- [ ] QSRSoft's own Alerts/Notifications GraphQL API (`api.sso.myqsrsoft.com/alerts/graphql`,
  discovered alongside CoachQ) — pulling QSRSoft's own operational alerts into Signals is unbuilt.
- [ ] Hourly-grain MOP (mobile-order/app) transactions — a real, open gap, needs a different,
  unconfirmed QSRSoft endpoint. (Daily-grain MOP GC is already covered via
  `sales_ledger_daily.mop_gc` — don't re-attempt the `mop_transactions`-on-`daily-activity-raw`
  approach, it's a measured dead end.)
- [x] ✅ **RESOLVED 2026-09-07 — measured against real production run logs, not a doc re-read; do
  not re-raise.** Read the actual `pull` job logs (real credentials, real network, not something
  this sandbox can reproduce itself) for both scripts across 3 separate dates: `qsrsoft-ebos-pull`
  on 2026-09-05 (`[auth] SSO exchange HTTP 403 — token may not work for eBOS`, falls to Playwright,
  succeeds) and 2026-09-02 (same script, same run pattern); `qsrsoft-variance-pull` on 2026-09-07
  (`[auth] SSO exchange HTTP 403`, falls to Playwright, succeeds). **SSO-token-exchange 403s every
  single time measured, for both scripts** — `qsrsoft-onhand-pull.mjs`'s "confirmed 403 dead end"
  comment is the accurate one; `ebos-pull`/`variance-pull`'s Path A/B framing is stale-optimistic
  code that never actually short-circuits Playwright in production. No functional bug — Playwright
  fallback runs and succeeds every time, so daily pulls are unaffected — this was a doc-vs-reality
  question, now settled. Not touching the scripts: the SSO attempt is a harmless ~1-2s first try
  that costs nothing if McDonald's/QSRSoft ever re-enables that path server-side; removing it isn't
  needed to close this item.
- [ ] #263/#265 pull-completeness ledger system — ⚠️ **"schema never run in production" is now
  stale (measured 2026-09-07): `data_completeness_incidents` exists and holds a real row** (a
  genuine detected→backfilled incident, `qsr_service_stats`/loc 0035242, 2026-09-03/04 — service-
  role read, `content-range: 0-0/1`). The rest of the item still holds — no `TOLERANCE`/tolerance
  config or restricted-handling UI/SAGE gating exists anywhere in `src/`: only 2 of 7 pull
  streams have tolerance rules, and the `notes` column has no UI/SAGE consumer yet.
- [x] ✅ **FIXED 2026-09-07 — app code shipped; ⚠️ needs a one-statement SQL run to fully work,
  see below.** `uploadReportFile()` (`src/lib/supabase.js`) now actually uploads to the `'reports'`
  Storage bucket (created for exactly this, per `schema.sql`'s own comment, but never used) instead
  of base64-encoding into `pending_reports.file_data`; the cross-device-sync read side (`App.js`)
  downloads from Storage first, falling back to `file_data` only for rows uploaded before this fix
  (so already-queued files aren't stranded). 3 new tests against a mock Supabase client, full suite
  484/4617, build clean.
  **⚠️ RETRACTED 2026-09-07 — the "second bug" claimed here was a diagnostic error; do not
  re-cite it.** Original claim: `pending_reports` has no INSERT policy for any client role,
  measured via an anon-key-only synthetic probe. **The probe methodology was the mistake** — it
  tested as a logged-out visitor, not as the app's real authenticated upload path. A live
  `pg_policies` read (owner-run) showed this table already carries a `tenant_insert` policy
  (`schema-multitenant-phase2-rls.sql`'s generic template: `tenant_id = current_tenant_id()`)
  plus a `tenant_id` column defaulting to the single-tenant UUID
  (`schema-multitenant-phase1.sql`) — so a REAL, logged-in user's upload likely already passes
  RLS via that policy; it was never actually exercised by the anon-only probe.
  `supabase/schema-pending-reports-insert-policy.sql` (added the same day) is now a retraction
  record with a `drop policy` statement, since the fully-open policy it originally added (a) was
  broader than needed — anonymous, logged-out writes — and (b) oddly still didn't pass even a
  fresh anon-key re-test after being confirmed live, which wasn't chased further (not worth
  fighting unauthenticated `curl` against the new opaque `sb_publishable_...` key format). **If
  cross-device sync for new manual uploads is later found to still be broken, start the next
  diagnosis from a REAL logged-in session, not the anon key** — that gap in method is exactly
  what produced this false alarm.
  ✅ **What's still real and unchanged:** the Storage-vs-base64 fix itself (`uploadReportFile()`
  now uploads to the `'reports'` bucket instead of base64-encoding into `file_data`) stands —
  unrelated to the RLS question, and the 12.37 MB timeout it fixes was independently observed.
- [ ] Store-events material-changes date-formatting bug — could not locate in live code on the
  last pass (every `sheet_to_json`/`XLSX.read` call already guards `raw:true`/`cellDates:false`
  project-wide, so the described mechanism should already be structurally prevented). Needs a live
  repro (an actual uploaded file producing the two wrong store numbers) before this is actionable.
- [ ] **Coaching loop #208's core verify mechanism is nonfunctional in production.**
  `src/engine/coaching-loop.js`'s `NOISE_THRESHOLDS = {}` is still empty, so `computeVerdict()`
  returns `null` for every cycle. District-differencing was tested as the fix and measured to not
  work (~0.98-1.07× reduction, essentially none). Next candidate (longer measurement windows, or
  confidence-based non-binary verdicts) has no decision or build. Called "the single genuine
  differentiator on the table" in its own shipping changelog.
- [x] ✅ **RE-MEASURED 2026-09-07 — stale, already fixed under dispatch #139, do not re-raise.**
  `LocationSelector`'s patch tier (`buildLocationHierarchy`, `PanelControls.js`) resolves via
  `supervisorOf()` → `whoRan()` → `orgAssignments()`, which reads the SAME module-scoped
  `_liveAssignments` timeline (`constants.js`) Inventory Control's own patch filter
  (`supervisorGroups()`) is built on — one shared live source, not two independent ones. Both the
  `PanelControls.js` and `eom-dashboard.js` comments cross-reference each other on this exact
  point (dispatch #139, "Mary missing in Crew Schedule"). `INV_ORG_COORDS[loc].sup` is read only
  as a last-resort fallback for a loc the live timeline doesn't cover at all, never as the primary
  source either place.
- ⚠️ **RE-SCOPED 2026-09-08 — the security half is very likely already mitigated by a different,
  more robust mechanism; do not "fix" `.org` without re-checking this first.** Live service-role
  read of `pending_reports` (514 rows) confirms `.org` is genuinely null on every row, matching
  the claim — but `tenant_id` is populated on every row (`'00000000-...0001'`, the single-tenant
  default), and `pending_reports` IS in `schema-multitenant-phase2-rls.sql`'s tenant-scoped-RLS
  table list (`tenant_id = current_tenant_id()`, replacing the table's original wide-open
  `using(true)` policy). A live anon-key read returns `content-range: */0` — zero rows visible
  unauthenticated — consistent with that RLS flip being live (though not fully conclusive on its
  own, since the anon key format also changed independently, per this file's own dispatch #89
  history). **If Phase 2 has run, tenant-level isolation is already real and `.org` is dead code,
  not a live cross-tenant leak** — wiring it up would be solving an already-solved problem and
  risks confusing which field is the actual isolation boundary. Confirm Phase 2's live status
  before touching this (a live login test with a genuinely second-tenant profile, same
  verification `memory/finding-rls-phase2-my-locs-2026-09-06.md` already calls for, would settle
  it). **The 30-day-window half is real and separate** — confirmed in code (`App.js`'s
  email/auto-ingest auto-sync cutoff is 30 days; the manual-upload cross-device-sync cutoff is
  180 days, a different, wider window) — a new device/user genuinely won't backfill an
  email-sourced report older than 30 days. Minor, not urgent; unclear if intentional.
- [x] ✅ **FIXED (v5.421, 2026-09-10).** `ds.storeIds`/`ds.loaded` were both manual-labor-derived
  (set from `laborRows`) — the same silent-failure-on-cloud-only-device shape #270 was supposed
  to fix for SAGE, never generalized. `engine/pipeline.js` now has `dsHasData`/`dsAutoStoreIds`/
  `annotateAutoFirstFlags`, deriving true/populated from laborRows OR any `stream-freshness.js`
  `STREAMS`-tracked cloud/emailed source (qsrFobRows's zero-pad quirk normalized so it doesn't
  create a spurious duplicate store). The harder half: `buildDS`/`mergeDS` only run at manual-
  upload time, but ~32 of `App.js`'s own `setDs()` calls merge a cloud/auto stream straight into
  `ds` without ever touching either — so fixing only those two functions could not have unlocked
  anything. `App.js`'s `setDs` itself is now wrapped to re-derive both fields after every call
  (function or plain-value updater), which covers all ~32 inline call sites plus
  `configureLazyFill`'s lazy-fill hook and `session.js`'s `mfRestoreSession` (both already
  receive this same `setDs` reference). `why.js`'s "Single-store anomaly" diagnosis and the 10+
  `analytics.js` `if(!ds.loaded)` gates named above are unlocked as a side effect of this one
  fix, not touched individually — do not re-audit them file-by-file, the root cause is closed.
  18 new tests (`dispatch-ds-loaded-auto-first.test.js`), all confirmed failing against the
  pre-fix `pipeline.js`. `sage.js`'s own `sageHasData` comment (which named this exact bug and
  explained why it deliberately avoided `ds.loaded`) updated to reflect the fix — `sageHasData`
  itself left as-is, not swapped to `dsHasData`, since it also checks `ctrlRows` (manual-only,
  not in `STREAMS`) as a deliberate SAGE-specific signal, a real behavior difference.
- [ ] **Four independently-maintained reimplementations of manual-first/auto-first merge logic**
  (`analytics.js`, `store-dash.js`, `smart-targets.js`, `promo-roi.js`) need a consolidation pass —
  distinct from the Metric Registry/Resolver unification item in §3 (that's about merging
  `signal-registry.js`/`metric-source.js`, not this). Confirmed still genuinely open even after a
  concurrent session characterized the source doc as fully delivered — the source file has its own
  explicit "still open" section naming this exact item.
- [ ] **Render-storm remainder.** The tiered startup loader batches 22→3 renders, but ~19 renders
  remain unbatched across 5 effects: IDB restore, `loadLaborRows` merge, 6 `org_config` syncs,
  email/PDF auto-ingest, cross-device sync. Flagged by its own prior author as higher-risk to touch
  than the already-shipped part, and unverifiable in a sandbox with no live Supabase session and no
  React-effect test harness — a real fix needs a live browser session to validate against.
- [ ] Canonical loc-identity normalization (a single `normLoc()` at every boundary) and "make
  silence loud" (parser contracts + loaders distinguishing no-data/error/row-cap) — named
  structural fixes for recurring bug classes, explicitly marked "❌ not planned" in their source doc.
- [ ] Events redesign (owner signed off 2026-08-11): confirm/dismiss anomaly-tagging queue (the
  core new build), a Competition/baseline-shift forecast mechanism (owner: "changes everything
  potentially" — never filed as its own issue), an LTO-asymmetry check, and a school-calendar
  LY-alignment fix.
- [ ] Food Cost / Labor enhancement set, researched and prioritized, nothing built: data-discipline
  score (Missing Waste/Counts insight cards), low-supply depletion projection, masking-detection
  surfacing, labor 3-way split (Needed→Scheduled→Actual), rate/hours/sales labor-% decomposition,
  intraday deployment heat map, role-based-routine UX organizing principle.
- [ ] Insight ledger step 2 — persistence table + writers, dedupe by situation, close the loop by
  re-measuring after a fix. Step 1 instrumentation shipped and returned a first real reading (142
  distinct situations/day); step 2 is explicitly gated on more data, not started.
- [ ] Printable Forms — extend from 8 pinned forms to the full ~60-form QSRSoft library (pull-filter
  widen + scored-form field renderers + self-serve "add form" button).
- ⚠️ **RE-SCOPED 2026-09-08 — the blocking input this item was waiting on already landed (dispatch
  #124, unrelated at the time), the daily-grain version of the test is now runnable, and a first
  real sample has been pulled.** `qsr_punch_times` (QSRSoft per-employee shift punches, live,
  151,512 rows back to 2026-05-27) makes the "does this employee's register activity match a real
  punch" contradiction test runnable at daily grain today — joined against `audit_rows` for a
  30-day sample: 75.6% of exception-bearing audit rows have a matching punch, **24.4% do not**,
  with some employee/store pairs recurring across consecutive days. Explicitly NOT diagnosed,
  scored, or built into anything — this is the raw "pull a sample and look at it together" the
  owner asked for before any `clean`/`contested`/`unknown` state design gets built, per
  `memory/attribution-validity-register-login.md`'s own standing sequencing. The finer
  within-shift-window test (transaction time vs. punch window, not just same-day presence) still
  needs #275's transaction-detail probe. **Next step is the owner's — review the sample, decide
  whether/how to build the state design**, not more engineering work first.
- [ ] VLH guide-based needed-hours calculation (DAR guest counts vs `actual_punched_hours`, per
  store per hour) — `store_vlh_config` was explicitly built as its foundation; the calculation
  itself isn't built.
- ⚠️ **RE-SCOPED 2026-09-08 — a large chunk of this is already built; not greenfield.** Checked
  step (1) directly: `lifelenz_schedule`'s per-shift position/job-code detail is NOT the source
  — but a separate, already-live pipeline covers most of what was asked for.
  `scripts/lifelenz-pull.mjs`'s `pullJobHours()` (a second GraphQL endpoint,
  `ShiftsForSchedulePeriod`, distinct from the CSV `lifelenz_schedule` pull) already rolls up
  every SCHEDULED shift by `businessRoleId`/station into `lifelenz_job_hours`
  (loc/week_start/role_name/category/code/hours/cost/reg_hours/ot_hours/n_shifts), loaded into
  `ds.jobHours` at startup (`App.js`) and **already rendered** in `schedule-summary.js`'s
  `StationBreakdown` component (Weekly Schedule Summary panel, per-store per-week, expandable) —
  Station / Category / Shifts / Reg / OT / Hours / Cost / $-per-hr, one row per job code. So the
  per-position **scheduled** hours ask is done, at the weekly grain, and has been live since
  before this backlog cut (not a new find — just never connected to the owner's Sept 7 request
  in this doc).
  **What's still genuinely missing, now correctly scoped down from "ambitious project" to 3
  specific gaps:** (1) no ACTUAL/worked hours by position — `lifelenz_job_hours` sources from
  scheduled shifts (`shiftType: ['offer','offer_to_all','roster','time_off','open']`), not
  punches, so there's no per-role actual-vs-scheduled comparison yet, only scheduled; (2) no
  forecast/NEEDED hours by position (a labor-guide-derived target per role) to compare the
  schedule against — `lifelenz_job_hours` is the "what's scheduled" side only, not "what's
  needed"; (3) weekly grain only — no daily or hourly breakdown by position, which is what the
  owner's own phrasing called out as needed "to be fully effective." Any follow-up should build
  on `lifelenz_job_hours`/`StationBreakdown`, not start over.
- [ ] Inventory Control redesign's Labor instantiation of the generic Food-Cost shell
  (owner-approved, "it must host Labor too") is on hold pending an owner-run measurement of
  `qsr_labor_summary` that resolves a contradiction in what "Crew Labor %" actually contains.
- [ ] Org-assignment Tier 2 — route perf-review/analysis rollups through `whoRan(loc,date)` for
  true historical attribution instead of today's flat current-map.
- [x] ✅ **DONE 2026-09-08 (v5.408).** The per-day hours-of-operation figure (Mon→Sun,
  deciphered from the sheet) is now a small editable box per day in `labor-analysis.js`'s Config
  tab, matching the existing maint/prep/lobby inputs' edit/save pattern. Editing one day
  preserves every other day's value on save (the whole `hours_json` blob is written each time) —
  `open`/`close` (used independently by `labor-standard.js`'s overnight-standard math, not shown
  in this table) stay untouched. 3 new regression tests against the real `LaborAnalysisPanel`
  call site.
- [ ] Lazy-fill: dedupe duplicate startup requests (`auth`/`org_config`/`user_settings`); the
  gap-scoped `(stream,loc,dateRange)` demand queue was never built beyond a simpler whole-table
  version.
- ✅ **MEASURED 2026-09-08 — run, and the result is a clean null, not a confirmation.** Replicated
  `engine/labor-gap-split.js`'s exact formula over a trailing 12 complete pay-weeks (27 stores,
  live `qsr_daily_activity_rollup` + `turnover_monthly` service-role reads) and correlated
  against turnover multiple ways (Pearson + Spearman, signed + magnitude, latest + 3-month-avg).
  Pearson showed a weak 0.11–0.36 on the full sample, but Spearman (outlier-robust) was uniformly
  ~0 (-0.01 to 0.06), and excluding the single most extreme store collapsed every Pearson r to
  ~0 too — the signature of one data point driving an otherwise-null result. **This does not
  refute the underlying over-scheduling finding** (that rests on the owner's own operational
  read + the dollar mechanics, not on this test) — it specifically closes "does it show up in
  turnover" with a real negative answer on this window. Full methodology + numbers:
  `memory/finding-overscheduling-is-chaos-not-cost.md`.
- ✅ **BOTH RESOLVED 2026-09-08 — the register-leak theory is not testable pre-2025-09 through
  either route; a fresh in-repo credential or endpoint would be needed.** (1) `qsr_daily_activity`
  does NOT carry register-level controls at any date — a schema fact, not a coverage gap: its
  full field mapping (`scripts/qsrsoft-dar-pull.mjs`) has zero refund/promo/void/T-Red/POS-over
  fields, and every one of those loss-prevention metrics in `signal-registry.js` sources from
  `ctrlRows`(manual)/`glimpseRows`/`cashRows` (both floored 2026-07-01) instead. (2) The
  `inventory_history` step-0 probe (issue #257) was dispatched and read in full — both probed
  stores hit an identical retention floor at 2025-09-08 (exactly 365 days before the run date),
  which the probe's own header identifies as the signature of a real server-side 1-year rolling
  window, not a per-store adoption date. So it's a forward-only stream too. Full measurements:
  `memory/finding-padding-and-cash-hunt-2026-08-13.md` §8.
- ✅ **§8 addendum RESOLVED 2026-09-08 — same answer as the §13 duplicate of this question above:
  NO.** Both real consumers of `sales_proj`/`tProdSales` (`CurrentMonthPaceSection` and Smart
  Targets' `officialFor()`) correctly resolve it from `ds.monthlyTargets`, traced end to end. The
  actual DEFAULT_TARGETS-bypass pattern the code comment referenced is tracked separately —
  GitHub issue #164 closed 2026-09-10 (its core migration + finding-1 persistence gap both
  shipped, v5.414/v5.415), the specific DEFAULT_TARGETS-bypass sub-issue it spun off lives on as
  #177 (open) — and doesn't touch `sales`. See the §13 entry for the full trace.

*(Archive: §14)*

## 15. Security & Loss Prevention Build

- [ ] **Deposit lapping** — invisible in current QSRSoft-sourced data (a deposit counts as
  accounted the moment it's entered, so no detection rule against that data would ever fire).
  Owner is actively exploring bank-data access; two realistic paths once banking setup is known: a
  bank API feed (standing, daily, backfillable) or manual bank-statement upload.
- [x] ✅ **RESOLVED (stale, re-measured 2026-09-07) — do not re-raise the 403.** The 2026-08-20
  auth/permissions blocker is gone: the daily `QSRSoft Register Audit Pull` workflow has run 37
  times, all `success` except one transient failure on 2026-09-05, and a live service-role read
  of `audit_rows` confirms **59,393 real rows**, most recent date 2026-09-05 (2 days behind
  "today," normal ingestion lag). Whatever fixed the service account's role happened without a
  dedicated dispatch entry recording it — the pull is simply live and has been for a while.
- [ ] **Any Transaction Tier B** — a `transaction_detail` endpoint is captured and confirmed
  viable (full line-item + tender + operator/manager detail per transaction), but not yet built.
  The camera/video linkage question (plan §7) is still genuinely open. (Tier A is settled dead —
  no exception-type filter exists on the endpoint; don't re-probe it.)
- [x] ✅ **RESOLVED — this whole trio is badly stale, re-measured 2026-09-07, do not re-raise.**
  All three items below describe a system that has, in fact, been fully built and is live in
  production (dispatches #39 through at least #143), with zero mention anywhere in this backlog
  file until now:
  - **Phase 1 MVP** — `security-rules-run.yml` (dispatch #39) runs daily at 11:00 UTC, scoring
    `audit_rows` against every active `security_rules` row into `security_findings`. Live
    service-role reads confirm **9 rules** (`CASH-001..004` / `INV-001..005`, 7 active/2
    inactive — cash-drawer variance AND TvA inventory variance, the exact two Phase 1 domains)
    and **84,073 real findings rows**. Peer ranking and explanation surfacing are both built too,
    in `src/engine/security-drilldown.js`: `flagRateByStore`/`crossStorePrevalence`/
    `compositionVsEstate` (peer comparison) and `corroboratingFlags`/`classifySubjectShape`/
    `buildSubjectTimeline` (explanation, grouped by subject not by rule — the panel's own header
    comment explains why: "a subject flagged on three of four independent signals is a lead;
    flagged on one is noise").
  - **Rule-evaluation compute cadence** — decided and shipped: daily at 11:00 UTC, one hour
    after `QSRSoft Register Audit Pull`'s own 10:00 UTC run (its input), so it never scores a
    day's data before that day's pull lands (`security-rules-run.yml`'s own header comment).
  - **Phase 4 GM-access gate** — also shipped, as an org-level config toggle:
    `org_config.gm_identity_reveal_enabled` (`loadGmIdentityRevealEnabled()`,
    `src/lib/supabase.js`), read by `securityPanelAccess()` (`src/views/security-panel.js`) to
    decide whether a manager-role caller gets identity-revealed findings. Not the per-case/
    DO-granted design this item speculated about — a simpler org-wide setting — but a real,
    live, wired decision, not an open design question.

  A full read-only investigation UI ships too — `src/views/security-panel.js`
  (`kind:'nav'`, `perm:'security.view'`, live in the People section today, dispatch #43+),
  with date-range + `LocationSelector` scoping, subject timelines, export, and print. **What
  genuinely remains open** (confirmed still unbuilt): "Any Transaction Tier B" (below, correctly
  described as not yet built) and **Deposit lapping** (also below, correctly described as
  blocked on bank-data access). Those two keep their own entries; this trio does not need one.

*(Archive: §15)*

---

## Cross-file duplicates — still worth checking before filing any of these as "new"

Carried forward from the archive verbatim (nothing here has changed):

1. **Metric Registry/Resolver/Lineage** — `notes-57` (full plan), `notes-60`, `notes-61` — same
   ask as §3's Metric Registry item above.
2. **Panel Manager "show everything + core list"** — `notes-25` #9, `notes-27` #7, `notes-60` —
   same ask as §13's Panel Manager item above.
3. **Data Manager per-source labeling** — `notes-25` #8, `notes-27` #9 — same ask as §13's Data
   Manager item above.
4. **Backup/disaster-recovery** — `notes-54-56` §1.3, `notes-61`, `notes-24` §5 — same ask as §13's
   Backup/rollback item above.
5. **Visit Readiness "rework/rethink"** — `notes-26` #7 and `notes-60` — same ask as §10's Visit
   Readiness item above.
6. **"Where's my data?" source catalog** — `notes-26` #3 and `notes-24` §3(a) — same ask as §13's
   catalog item above.

*(Archive: "Cross-file duplicates" section, full list)*
