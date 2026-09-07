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

- [ ] **F — role-based voice.** First slice shipped (Visit Readiness verdict line). Count Cycle and
  DI Compare — the dispatch's own two evidence strings — still need the same treatment.
- [ ] **G — shift dimension (`src/views/labor-allocation.js`).** Panel is live (Scheduling hub,
  District/By Store/Overnight sub-views). Two confirmed gaps: (1) live-browser verification still
  needed — no code-level way to check the District/By Store/Overnight views render correctly; (2)
  zero perf instrumentation (no trace/span/performance-mark idiom in the file).
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
- [ ] `labor_rows` sweep — 20 files under `src/views`+`src/engine` still read `ds.laborRows`
  directly instead of through the resolver (tracking number; falls as the sweep proceeds).
- [ ] Route `compute6wk` through the metric-source resolver (15 resolvable fields still read raw
  arrays); fix `avg6`'s zero-skip bug.
- [ ] ❓ `dt-speedofservice.js`'s second "PM" daypart label — needs owner confirmation before
  renaming.
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

- [ ] `[Violation] click handler 1382ms` on nearly every click — root cause not diagnosed.
- [ ] React render ≈100% of main-thread blocking (older trace) — fix direction known (coalesce
  `setDs` sites, defer `ds` to heavy views), not implemented. Possibly overlaps the render-storm
  item in §14 below — check before treating as separate.
- [ ] "SAGE Scheduled Runs" tile appears twice as the single worst-cost click — unexplained.
  Re-checked 2026-09-05: only one `SageRunsTile` render call site in code, which doesn't rule out a
  double-fetch-on-click. Needs a live click trace, not another grep.
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
- [ ] `GC_SALES_DIVERGE` (Morning Brief) — real remaining lead: an owner-selected "today" or
  DAR-only date (via the panel's own date picker) hits `assembleBriefStoreData`'s
  `darSales`/`darProjSales` fallback, which hasn't been checked against a live in-progress DAR day
  the same way dispatch #153 checked OEPE/R2P/TPPH for `qsr_daily_activity_rollup`'s always-24-slot
  trap. The auto-default-date partial-day theory is ruled out (both `labor_rows`/`ctrl_rows` are
  6+ weeks stale, so auto-default can't land on a still-open day). `ctrl_rows` being that stale is
  itself worth flagging — either abandoned in favor of auto sources, or broken.
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
  - [ ] **Still open — Action Plan missing TPPH.** `generatePlan()` (`store-dash.js:1424-1576`,
    consumed by `ActionPlanTab` ~1578) only builds action items for OT Hours (~1436), Cash O/S
    (~1459), OEPE (~1481), T-Red After (~1504), Labor % (~1529) — no TPPH item exists. Genuinely
    still broken; a real but narrowly-scoped follow-on (add a TPPH gap item to `generatePlan`,
    matching the pattern of the existing five).
- [ ] Speed of Service — DT History takes 15+ seconds to load (`notes-67-queue.md` §2). A
  performance bug, not a design ask — needs a real before/after measurement if scoped.
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
- [ ] ❓ Items Recounted tile hidden ~21 days/month — needs an owner decision (widen window /
  dormant state / leave as-is).
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
- [ ] Item Journey flow reconciliation to tie out exactly to the Variance Stat report (currently
  directional only).
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
- [ ] **SAGE knowledge-grounding sensitivity gating** — restrict personnel-sensitive findings to
  DO+ role, gate by subject not just caller role, fail-closed frontmatter. Designed but not built —
  safety-relevant: at least one memory file already names a GM by name and nothing stops that
  reaching SAGE's context today.

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
- [ ] Swing alarm's cross-metric report + AI-scour-for-causes sub-asks — detection/ack shipped,
  these two enrichment asks unconfirmed as built.

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
  ⚠️ **Owner action still needed:** run `supabase/schema-store-assessments.sql` in the Supabase
  SQL editor — until then the panel's own error state names the exact file to run. 7 new tests
  (`store-assessments.test.js`) on the two pure helpers (`mergeAssessmentRows`/
  `assessmentProgress`); a real live-data round-trip couldn't be verified from this sandbox (its
  browser can't complete a TLS handshake through the environment's proxy to reach Supabase) —
  worth a real click-through once the SQL has run.
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
- [ ] PII/credential-handling human-process capture — the content already exists in
  `pm-handoff-2026-08-15.md` and `qsrsoft-report-catalog.md` (x-auth-token sequencing rules, the
  `storePeoplePunches`/`employeeRoster` PII field lists), it's just not indexed into CLAUDE.md's
  own standing rules yet. ❓ Whether the roster-workbook deletion this repo has a standing
  instruction for actually happened is still a real open question.
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
- [ ] Open question, never resolved: does the discarded-targets bug (#153/#167) also hit
  Projections' `sales_proj`?
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
- [ ] **eBOS/variance/onhand SSO-exchange contradiction** — `qsrsoft-ebos-pull.mjs` and
  `qsrsoft-variance-pull.mjs` both try SSO-token-exchange first (via `getFreshToken()`);
  `qsrsoft-onhand-pull.mjs`'s own comment says that exchange is a "confirmed 403 dead end" and
  skips straight to Playwright. Three scripts, two contradictory beliefs about whether SSO-exchange
  for an eBOS token works at all. Needs a live diagnostic run (`QSRSOFT_EBOS_DEBUG=1`) reading
  whether Path B actually succeeds or silently falls through every time — not a doc re-read.
- [ ] #263/#265 pull-completeness ledger system — ⚠️ **"schema never run in production" is now
  stale (measured 2026-09-07): `data_completeness_incidents` exists and holds a real row** (a
  genuine detected→backfilled incident, `qsr_service_stats`/loc 0035242, 2026-09-03/04 — service-
  role read, `content-range: 0-0/1`). The rest of the item still holds — no `TOLERANCE`/tolerance
  config or restricted-handling UI/SAGE gating exists anywhere in `src/`: only 2 of 7 pull
  streams have tolerance rules, and the `notes` column has no UI/SAGE consumer yet.
- [ ] `pending_reports` stores report base64 blobs directly in a Supabase column instead of
  Storage (a 12.37 MB row observed) despite a code comment claiming a bucket upload.
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
- [ ] `pending_reports.org` column exists but is never written or filtered — a second org would
  see the first org's uploaded files; also a 30-day window means new users miss old uploads.
- [ ] `ds.storeIds` and `ds.loaded` are both manual-labor-derived (set from `laborRows`) — the same
  silent-failure-on-cloud-only-device shape #270 was supposed to fix for SAGE. 10+
  `if(!ds.loaded)` gates in `analytics.js` alone are unaudited.
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
- [ ] Attribution-confidence state (`clean`/`contested`/`unknown`) on employee-attributed exception
  metrics, detecting register logins that don't match punch times — needs a LifeLenz punch-
  timestamp extension (raw shifts currently never stored) or QSRSoft transaction-detail.
- [ ] VLH guide-based needed-hours calculation (DAR guest counts vs `actual_punched_hours`, per
  store per hour) — `store_vlh_config` was explicitly built as its foundation; the calculation
  itself isn't built.
- [ ] Inventory Control redesign's Labor instantiation of the generic Food-Cost shell
  (owner-approved, "it must host Labor too") is on hold pending an owner-run measurement of
  `qsr_labor_summary` that resolves a contradiction in what "Crew Labor %" actually contains.
- [ ] Org-assignment Tier 2 — route perf-review/analysis rollups through `whoRan(loc,date)` for
  true historical attribution instead of today's flat current-map.
- [ ] Labor Analysis Config tab's hours-of-operation editor is still read-only (only the
  maint/prep/lobby fixed-hours inputs are editable).
- [ ] Lazy-fill: dedupe duplicate startup requests (`auth`/`org_config`/`user_settings`); the
  gap-scoped `(stream,loc,dateRange)` demand queue was never built beyond a simpler whole-table
  version.
- [ ] Correlate the Planning/Execution over-scheduling gap against `turnover_monthly` (already
  pulled) — named as "the strongest available test" to convert the overscheduling-is-chaos-not-cost
  finding from qualitative to measured.
- [ ] Two open probes from the register-leak/cash-hunt investigation: whether
  `qsr_daily_activity` carries register-level controls back to 2025-01 (would make the deposit-
  lapping theory testable pre-dating `cash_sheet_daily`'s 2026-07-01 floor), and probing
  `inventory_history` retention depth via `workflow_dispatch`.
- [ ] **§8 addendum:** whether the discarded-targets bug (#153/#167) also hits Projections'
  `sales_proj` — never resolved, no follow-up filed.

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
