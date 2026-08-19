# Backlog Master — 2026-08-19

> **Purpose:** one consolidated, de-duplicated backlog across the whole project, assembled
> 2026-08-19 from a sweep of 20 memory files (`project-backlog.md`,
> `plan-backlog-and-redesign-2026-08-15.md`, and `notes-24` through `notes-66`) plus the
> `plan-normalization-2026-08-17.md` workstreams and `vision-and-roadmap.md`. Every item below
> was extracted from an existing memory file at that time — this file does not invent new scope.
>
> **Known limitation, stated plainly:** most items below were graded as "open" **by the file they
> came from, at the time that file was written** — not independently re-verified against current
> code. Two follow-up PM passes (below) are tasked with re-verifying status per item against
> actual code/git evidence, since a fair amount is likely already shipped or in progress and this
> file doesn't yet know it. **Do not treat an unchecked box below as proof something is unbuilt —
> treat it as "last known status: open, not yet re-verified this pass."**
>
> **Status legend:** ✅ Done · 🟡 In progress · ❌ Open, not started · ❓ Needs owner input/decision
> before work can start · — Needs re-verification (default state for everything below until a PM
> pass checks it)
>
> ---
>
> ## PM review pass 1 — 2026-08-19
>
> **Scope:** the entire file, all 13 sections plus both bottom lists. Pass 2 runs after this
> merges, independently over the same whole file. (The original plan of two *concurrent* passes
> over *disjoint* sections was changed; the stale description at the bottom of this file has been
> corrected rather than left to contradict itself.)
>
> **What "verified" means here.** Every status changed below cites the file, line, test, or PR that
> settles it. Where code alone cannot settle an item — it needs a live Supabase read, a real
> device, a workflow run, or an owner decision — it is marked ❓ with the *specific* next step,
> **not** guessed at. Items left unchanged were checked and are genuinely still open; those carry
> a `(re-verified pass 1)` note so pass 2 can tell "checked, still open" from "not yet reached."
>
> **Coverage, stated honestly.** ~150 checkboxes; roughly 25 had decisive code/git evidence either
> way and are now settled. The remainder are dominated by owner-decision items (❓), open-ended
> design workstreams, and multi-part items where one clause is verifiable and the rest is not.
> Those are marked for what they are rather than force-graded. **Pass 2 should not read an
> unannotated line as confirmed-open by pass 1.**
>
> **Pass-1 follow-up (same day): three items added from direct PM experience, marked ⚠️ inline.**
> Originally framed as "the sweep could not have found these — they only ever lived in
> conversation." **PM review of the resulting PR (#434) found that framing wrong for two of the
> three, and corrected both in place rather than deleting them:**
>
> - **The changelog monotonicity gap (§13) and the PII/credential-handling item (§13) were both
>   already written down** — in `memory/pm-handoff-2026-08-15.md` and `memory/qsrsoft-report-catalog.md`,
>   neither of which was in this file's original 20-file sweep list. The findings themselves are
>   accurate (independently re-verified against code/git); only "unwritten, exists only in
>   conversation" was wrong. **This means the original sweep's file coverage was incomplete, not
>   just its per-item status grading** — a sharper version of the same lesson §0/§11 already taught
>   below. If two files were missed, more may have been; a future pass that finds another item
>   "not previously written down" should grep the full `memory/` directory before trusting that
>   claim, not just this file's own source list.
> - **The At A Glance Act-vs-Need item (§4) was struck entirely** — checked directly against
>   `src/views/at-a-glance.js:2276`, the specific line cited was already fixed by `#296 step 2`
>   (merged **2026-08-15**, four days before this item was written, not concurrent with it as
>   framed). Quoting old code as current is a different failure mode than a coverage gap — this one
>   is a stale-read, and the corrected entry explains it in place.
>
> Nothing here was found to be speculative or fabricated — all three items reflected real, accurate
> content. The errors were both about *provenance* (claiming "unwritten" for things that were
> written, just not indexed) rather than substance.
>
> **Root cause of the staleness, worth recording:** the two largest corrections below (§0 C and
> §11) were not races. `scripts/_pipeline-contract.mjs` landed in **#431** and this file landed in
> **#432** — confirmed via `git merge-base --is-ancestor` — so Workstream C was already built when
> the sweep wrote "Never started." The Bullseye tile has been on `main` since **v5.012 (#274)**,
> four PRs of which touched it. Both were inherited verbatim from source memory files without a
> code check, which is exactly the failure mode this pass exists to catch.

---

## 0. Normalization plan (`plan-normalization-2026-08-17.md`) — re-verified 2026-08-19, current

This section IS current — verified today, not stale. See `MEMORY.md`'s dispatch #22–#32 entries
for full detail on each.

- [x] **A — forecast render path.** ✅ Shipped (`forecast_week_cache`). 🟡 Follow-up: real
  click-trace (dispatch #31) found cache coverage is 100% but 66% of `AtAGlance`'s render cost is
  still unexplained by any span; instrumentation to localize it just shipped (PR #431).
- [x] **B — event scope + recurrence.** ✅ Shipped, RLS-verified in production.
- [x] **C — pipeline contract.** 🟡 **CORRECTED pass 1 — this was NOT "never started"; the first
  slice shipped in PR #431.** All three parts of the dispatch #25/#32 brief are on `main`:
  (1) `scripts/_pipeline-contract.mjs` exists, 75 lines, exporting `logPartitionCoverage` +
  `checkFreshness`; (2) a bounded slice is converted — 2 adopters, `scripts/lifelenz-pull.mjs`
  and `scripts/qsrsoft-dar-pull.mjs`; (3) the ratchet is seeded —
  `src/__tests__/ratchet-pipeline-contract-coverage.test.js` (R8, dispatch #32) at `CEILING = 18`
  unconverted named scripts, plus a unit test `src/__tests__/pipeline-contract.test.js`.
  **Genuinely remaining:** the other 18 scripts (drive the ratchet down), and **C2 (idempotent
  partition replace), which is still fully greenfield** — re-verified, no implementation found.
- [x] **D — design-system adoption.** 🟡 Two hand-conversions + panel contract + ratchet R7
  (seeded at 78) shipped (PR #431). Rest is intentionally opportunistic, no discrete finish line.
- [x] **E — routing vs modals.** ✅ Shipped (4 panels URL-synced). Remount cost is NOT fixed by
  this — folded into A's perf investigation above, not a separate open item.
- [ ] **F — role-based voice.** 🟡 First slice only (Visit Readiness verdict line). Count Cycle
  and DI Compare — the dispatch's own two evidence strings — still need the same treatment.
- [ ] **G — shift dimension.** 🟡 Labor Allocation panel shipped, but: (1) never verified against
  live Supabase in a real browser, (2) the 1,716-hr pre-open-hours Breakfast correction isn't
  folded into the panel's own gap figure, (3) the panel itself has zero perf instrumentation.

## 1. Strategic roadmap (`vision-and-roadmap.md`, set 2026-07-21)

- [x] P0 Accuracy-integrity primitives — ✅ substantially built into the engines (dollar-weighting,
  ratio-of-sums, now standing rules enforced repo-wide).
- [x] P1 Smart Targets Model v2 — ✅ shipped (median-of-three trailing model, backtested).
- [ ] P2 UX coherence pass + panel scorecard — 🟡 in motion via Workstream D above; the panel
  *content/flow* scorecard (distinct from modal chrome, already done) is still open.
- [ ] P3 Differentiators — 🟡 Visit Readiness (Graded-Visit Predictor) shipped. Profit-Leak Index,
  Operational Coherence Score — ❌ still just named ideas, not built.
- [ ] P4 Deployment: same-org multi-user → multi-tenant — ❌ multi-tenant design not started
  (same-org multi-user works today via existing RBAC).

## 2. UI/UX Redesign (container plan — `plan-backlog-and-redesign-2026-08-15.md`)

- [ ] #261 Phase 0 render-instrumentation capture — blocks the virtualization-vs-tile-split
  decision for the rest of this plan.
- [ ] #192 P2 panel scorecard — consistency checklist across all 97 panels.
- [ ] #225 viewport-scroll lock — fix applied, **unverified on a real phone** (devtools emulation
  insufficient per the issue itself).
- [ ] Token adoption chain (#276→#286→#287, 111 sites → #296 step 2) — visual-foundation
  prerequisite before any palette change. 🟡 **Count corrected pass 1: 241, not 265.** Measured
  today (`rgba(255,255,255` across `src/**/*.js`, excluding `__tests__` and `changelog`), against
  the ratchet ceiling of **266** in `src/__tests__/light-mode-white-alpha.test.js` — so ~24 sites
  have been absorbed opportunistically since the ceiling was seeded. #296 step 2 is still open.
- [ ] Home-screen redesign (fewer/deeper widgets around the "learning loop") — ❓ 3 open design
  questions: owner's actual first move of the day; dynamic vs. user-customized vs. hybrid; widget
  count.
- [ ] #192 P0: FOB Report populates nothing; Change Monitor → Snapshot rename.
- [ ] Correctness bugs slotted opportunistically: #299, #300, #302, #303, #285, #228, #231, #289
  — status unconfirmed.
- [ ] **Spine 1** — one copyable panel design (District View → Location-tile pattern), pilot =
  Inventory Control, extend to Food Cost/FOB/Inventory.
- [ ] **Spine 2** — unify count-cycle.js / lastCountAnchor / inv_count_sessions behind one cycle
  selector.
- [ ] ❓ Menu restructure (owner's proposed IA) — parked, needs a planning session with the owner.
- [ ] SAGE persistent top-bar placement — parked UI-placement decision.
- [ ] Deferred: startup data-load gradient cue, loaded-data-strip repositioning, dev-mode
  diagnostic screen.
- [ ] Naming: Pace tab (collides with McDonald's internal "PACE" term), Help rename, Troubleshooting
  mode (End User/Dev).

## 3. Data Pipeline / Sourcing Correctness

- [ ] Finish auto-pull migration: Scheduling Intelligence, Schedule Summary, Labor Analysis (same
  root cause as the Schedule Summary labor% bug below).
- [ ] 🟡 **LifeLenz Time & Attendance — status advanced pass 1.** No longer "needs an owner
  DevTools capture": a read-only CI probe for the report-name slug shipped as **#350 / PR #355**
  (`571cfa6b`) — `scripts/lifelenz-ta-probe.mjs` + `.github/workflows/lifelenz-ta-probe.yml`, both
  on `main`. ❓ **Remaining, and it is not a code question:** the probe has to be *run* and its
  output read to learn the slug. Next step is a `workflow_dispatch` trigger and reading the job
  log — nothing here can be settled by grep. Source is still hand-transcribed until then.
- [ ] `labor_rows` (manual Labor Report) sweep — other raw `ds.laborRows` readers still hit
  staleness; only Dialed-In was rerouted through the resolver. ❌ **(re-verified pass 1, still
  open — measured: 20 files under `src/views` + `src/engine` still read `ds.laborRows` directly.)**
  That count is the tracking number for this item; it should fall as the sweep proceeds.
- [ ] Route `compute6wk` through the metric-source resolver (15 resolvable fields still read raw
  arrays); fix `avg6`'s zero-skip bug.
- [x] Ponce de Leon (43701) `detectCleanDataStart` returns a future date, breaking Dialed-In
  calibration for that store. ✅ **Done (high confidence) — CORRECTED pass 1.**
  `src/__tests__/calibrate-new-store.test.js` names this exact symptom in its header ("Notes 61
  #12: Ponce de Leon (43701) reported `recentOnly window starts 2027-04-16`") and was written
  against a live Supabase measurement on 2026-08-08 (133 rows). `src/engine/backtest.js` now
  carries an explicit future-date guard and applies `_windowStart` to `recentOnly` stores
  (`:145`, `:150`). ❓ *One residual for pass 2:* the test fixes the **generic** future-date class;
  whether Dialed-In now calibrates correctly for 43701 **against live data** is a browser/live
  check, not a code check.
- [ ] ❓ `dt-speedofservice.js`'s second "PM" daypart label — needs owner confirmation before
  renaming.
- [ ] **Metric Registry/Resolver unification** — merge `signal-registry.js` (110 metrics) and
  `metric-source.js` (~50 now); add lineage, aggregation metadata, catalog UI, CI enforcement.
  *(Named independently in 3 files — see Duplicates section.)* ❌ **(re-verified pass 1, still
  open — both `src/engine/signal-registry.js` and `src/engine/metric-source.js` exist as separate
  modules with no unification layer between them.)**
- [x] Info-icon field scraper (QSRSoft ℹ tooltips → `qsr_field_definitions`) + field dictionary.
  ✅ **Done — shipped v4.386/v4.387**, long before this file was written. `scripts/qsrsoft-field-
  scraper.mjs` (interactive ℹ-dialog capture) and `scripts/parse-field-defs.mjs`, both upserting to
  `qsr_field_definitions` on `onConflict:'page_key,field_label'`. Stale inheritance from the source
  note. *(If the intended remaining scope was **coverage** — which reports have been scraped — that
  is a live-table count, not a code question; re-file it as such rather than leaving this open.)*

## 4. Correctness Bugs (concrete, investigable)

- [x] 6-Week Performance chart can render 200,000–1,200,000% — `getDOWTrend` lacks a tiny-LY-
  denominator guard. ✅ **Done — CORRECTED pass 1.** The guard exists:
  `src/engine/forecast.js:642` `_yoyPoint(cur, ly)` returns `null` unless both are `> 0` **and**
  the growth sits inside `[YOY_MIN_GROWTH, YOY_MAX_GROWTH]`, applied at **both** call sites
  (`:659`, `:676`). Covered by `src/__tests__/yoy-trend-guard.test.js`, which drives the real index
  rather than the helper so it fails if either call site loses the guard. The ±300% bound is
  measured, not chosen: 39,357 of 40,000 store-days (98.4%) sit at or above 70% of their store's
  own median and only 76 fall below 25%.
- [ ] `[Violation] click handler 1382ms` on nearly every click — root cause not diagnosed.
- [ ] React render ≈100% of main-thread blocking in an older trace — fix direction known
  (coalesce `setDs` sites, defer `ds` to heavy views), not implemented. *(Possibly related to
  dispatch #31's fresh finding above — worth checking for overlap before treating as separate.)*
- [ ] "SAGE Scheduled Runs" tile appears twice as the single worst-cost click — unexplained.
- [ ] Smart Targets stuck on "Loading Sales History" indefinitely.
- [ ] Yearly Planning: YTD Actual/Targets likely wrong from a Jan–Mar upload gap.
- [ ] Morning Brief sales-divergence outliers — possible partial-day-vs-full-day artifact.
- [ ] District View: Forecast Table missing Goal/OEPE/TPPH/Labor%; Scorecards→Controls missing
  data; Action Plan missing TPPH; Forecast Accuracy "Scheduled Projection" reads too high.
- [ ] Labor Analysis week-start must follow the Wednesday setting — flagged as a **bug class**,
  needs an app-wide audit of every week-view.
- [ ] EOM Supervisor Summary: Op Supplies must pull actuals for the selected period.
- [ ] FOB Analysis panel capped at May 2026 — diagnosed (silent fallback to stale manual rows on
  cloud-read failure), **needs live verification it's actually resolved**.
- [ ] ❓ Food Cost Panel (`FOBAnalysisPanel`): `qsr_fob` returns empty under RLS for the
  anon/authenticated role. Root cause understood but unconfirmed — **needs a live `pg_policies`
  diff and explicit owner go-ahead before touching production RLS.**
- [ ] Two disagreeing Model Health Score implementations (`modelHealthScore` vs
  `computeModelHealth`). ❌ **(re-verified pass 1, still open — and confirmed live, not vestigial.)**
  Both are defined in the same file (`src/engine/forecast.js:847` and `:1868`), both are exported,
  and **each has its own consumer**: `src/views/at-a-glance.js` calls `modelHealthScore` (`:374`
  red-store filter, `:821` green/yellow/red tally) while `src/views/model-health-badge.js:10`
  imports `computeModelHealth`. So the same store can be graded by two different implementations
  depending on which surface you look at — that is the actual user-visible risk, and it is real today.
- [ ] District View 14-item visual-review punch list — mostly unconfirmed as fixed (Biggest Miss
  counting a partial day, missing labor at 10am, low-contrast Intelligence Brief, TPPH not
  populating in two panels, Tishomingo wrongly flagged "new model store," Records not all-time,
  Critical/Watch chips not clickable, and more — see source file for full list).
- [ ] `diffUserEventsForCloudSync` multi-day-span label-suffix gap — deliberately deferred.
- [x] ✅ **CORRECTION to the pass-1-followup item below, made during PM review of PR #434 — this
  specific site is already fixed, not open.** The item as originally written quoted
  `clr:(laborSec.avn||0)>=0 ? 'rgba(255,255,255,.8)' : '#f87171'` for At A Glance's Act-vs-Need
  tile and attributed it to "#296 step 2" as if that work were still in progress. Checked directly
  against `src/views/at-a-glance.js:2276`: the code now reads
  `clr:(laborSec.avn||0)>=0?'var(--text)':'var(--crit)'`, with its own comment recording *"#296
  step 2: was rgba(255,255,255,.8) -- literally the light themes' own text-on-surface identity,
  invisible."* `#296 step 2` (19 white-alpha sites, including this one) merged **2026-08-15** —
  commit `8298632`, PR #310 — four days before this item was written, not concurrent with it. The
  underlying reporting-integrity framing (a color scheme that shows only the unfavourable half of
  a metric's range is a correctness bug, not a contrast nit) is still a good general point — worth
  keeping in mind for whichever of the **241 white-alpha sites still open** (§2) turn out to share
  this same asymmetric-visibility shape — but nothing supports claiming any specific one does
  without checking it the same way this one just was. Not re-opening as a new open item on
  speculation; strike is correct here, not a downgrade to ❓.

## 5. New Data Sources / Automation

- [ ] Product Mix → Pricing Engine (auto-pulls, elasticity/what-if) — blocks product-mix↔sales
  correlations; ❓ owner to supply legacy spreadsheet.
- [ ] Graded Visits auto-pull from McDonald's (currently manual).
- [ ] Demographics per location (Census/ACS API).
- [ ] Register Audit engine (searchable, smart detection, SAGE+Signals integrated) — whole
  workstream, not started.
- [ ] Local News → event discovery, promoted into candidate Calendar events.
- [ ] Calendar Manager smart insights (news-discovered events → forecast flag → owner accept).
- [ ] **Online Reputation module** — research complete, 3-phase build plan ready, nothing built:
  Phase 1 (Google Business Profile API application — long-lead, DoorDash Reporting API request,
  direct-RSS local news), Phase 2 (GBP backfill + real-time alerts, DoorDash nightly, SerpApi
  gap-fill ~$25/mo), Phase 3 (Uber Eats manual CSV, Apple Business Insights). X/YouTube monitoring
  scoped but unbuilt. Explicitly skip: Facebook, TripAdvisor, Yelp, Bing, Grubhub, Postmates,
  Google Places, Instagram (no viable path).
- [ ] Write-back to QSRSoft (push Targets, two-way sync) — exploration only.

## 6. EOM / Inventory / Food Cost

- [ ] Inventory Control weekly-count completeness rules — **cannot be built on the current table**
  (`qsr_raw_item_detail` is $50-threshold-biased, zero Condiment rows); needs a switch to
  `qsr_onhand` + a mid-month concept that doesn't exist yet + paper-count inclusion.
- [ ] Variance chart loopback should anchor on `qsr_onhand.last_counted`, not the calendar month;
  build the per-item variance chart (data already computed, just not rendered).
- [ ] ❓ Items Recounted tile hidden ~21 days/month — needs an owner decision (widen window /
  dormant state / leave as-is).
- [ ] Quantity-variance display (case-pack suffix) — shipped for Change Monitor's Baseline-diff
  table only; still open for ItemJourneyView, FOB Root-Cause Recount Impact, FOB Report "Top item
  losers" (+ its printable HTML).
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

## 7. Performance Reviews

- [ ] Personnel moves (loc↔loc, patch reassignment) tracking, editable override.
- [ ] Location-attribution rule tightening (day-weighted split + ≥70%-of-days flag) — AI
  recommendation given, not built.
- [ ] Shift Manager Summary — isolate individual manager performance (needs the QSRSoft report
  captured first).
- [ ] Missing-targets UI in ReviewEditor (banner + one-click Smart-Targets seed).
- [ ] FOB metric-definition fix: score on FOB% not fob$ (unblocks target auto-fill).
- [ ] ❓ Per-metric wiring blocked on owner sourcing: Shift Certified Mgrs/Total Headcount, 0-90
  Day Crew Turnover, FS EcoSure, FS Completion T-60 (Jolt/Squabble), EPB2B (Pace Portal).
- [ ] Per-metric doable, needs field confirmation: Op Supplies actual, Total Profit-vs-Target
  derivation, Digital App / Delivery GC-per-restaurant-per-day.
- [ ] Banked threshold-value corrections (OEPE floor, Shift-Certified count step, FOB/Labor
  Bonus-Eligibility module, Total Profit bands) — separate from the shipped authoring UI.

## 8. Leadership One-Pager

- [ ] Operator→DO pulse — 5-tile "any fires" card (design given, not built).
- [ ] Promotions/Training/Other-Initiatives area — not built.
- [ ] Top-of-Discussion report — pre-populate relevant names for scope.
- [x] R2P stays manual-only — no cloud source exists, documented limitation, not a bug to chase.
- [ ] ❓ Labor% current-day DAR fallback — deliberately deferred pending owner's explanation of
  FL-vs-OK labor-usage differences.
- [x] Cleanup: stray CloudDocs duplicate files (`src/**/* 2.js`). ✅ **Done — CORRECTED pass 1.**
  `find src -name '* 2.js'` returns **0**. Nothing to clean; strike this item.

## 9. SAGE Enhancements

- [ ] Tool-breadth expansion — give SAGE the metric resolver as a generic query tool (flagged as
  the single biggest win available). ❌ **(re-verified pass 1, still open — grepped
  `supabase/functions` for a resolver-backed tool (`query_metric`/`metric_resolver`/`queryMetric`):
  zero hits. SAGE's tools remain the fixed per-table set.)**
- [ ] Feed CLAUDE.md/memory standing rules into the system prompt.
- [ ] Pass active panel state as context (not screenshots).
- [ ] Personality tuning (system-prompt only).
- [ ] ❓ Outbound web access — needs a cost/abuse-boundary decision first.
- [ ] Conversation persistence / self-learning loop — still on CLAUDE.md's own candidate list.

## 10. Signals / Visit Readiness / Attention

- [ ] Product-mix correlations — blocked on Product Mix pull (§5 above).
- [ ] ❓ Visit Readiness rethink — "how to get ready and stay ready" diagnostic ruleset, needs a
  design session. *(Asked in 2 files — see Duplicates.)*
- [ ] Graded Visits — more correlation analysis (open-ended).
- [ ] Swing Watch "Acknowledged" placement at top of Needs Attention — fully scoped, not built.
- [ ] ❓ Scoring-system revisit (Ops/Controls/Combined/District/Model Health) — needs a joint
  owner session, findings already ready.
- [ ] Multi-user startup-load tiering (core vs. extended fetch by role) — design decision needed
  before P4 rollout, not urgent solo.
- [ ] Swing alarm's cross-metric report + AI-scour-for-causes sub-asks — detection/ack shipped,
  these two enrichment asks unconfirmed as built.

## 11. Bullseye Tile & State-of-Business Engine

- [x] Bullseye distribution chart (full spec: angle=market sector, radius=signed %-vs-target,
  equal-area rings, palette fix). ✅ **Done — CORRECTED pass 1; this is the largest stale entry in
  the file.** `src/views/bullseye-tile.js`, 354 lines, shipped **v5.012 (#274)** and embedded in At
  A Glance. Every clause of the "full spec" is implemented and documented in the component's own
  header: **angle** = market/state sector, subdividing to patch once a state is selected, arc width
  proportional to member count (`:44–49`); **equal-area rings** = three bands with boundaries at
  `maxR*sqrt(1/3)` and `maxR*sqrt(2/3)`, explicitly *not* equal-radius (`:17`, `:36–42`);
  **radius** = signed % vs the store's own target, positive = good, continuous across band edges
  (`:35–37`); **palette fix** = converted to `var(--good)`/`var(--warn)`/`var(--crit)` in #280/#282
  and the light-mode ring-stroke bug fixed in **#298** (the strokes had composited to contrast
  1.000 — literally the same pixel as the backdrop). Four PRs have touched this file. Strike it.
- [ ] ❓ State-of-business walkthrough engine (evidence-first, learning loop) — presentation
  format still undecided, not built.

## 12. Staged Experiments / Risk Tracking

- [ ] 🟡 `store_assessments` table — 8/20 scheduling-workshop stores rated as of 2026-08-14,
  remaining 12 due 2026-09-03; top-5-of-20 binary reconciliation also due then.
  ❓ **Cannot be verified from code (pass 1): `store_assessments` has ZERO references anywhere in
  `src/`, `supabase/`, or `scripts/`.** So this is a Supabase-side + owner-tracking item with no
  application surface — the rating count can only be settled by a live table read, and the anon key
  returns zero rows under RLS. **Two things pass 2 should not conclude from that zero:** it is not
  evidence the table is missing, and it is not evidence the ratings are undone. Someone with
  service-role read has to count it. Separately worth deciding: whether a table with no code
  reference should have a panel at all, or stays a spreadsheet-grade artifact.
- [ ] Living risk-factor engine for food cost + labor (computed track vs. assessed track, stored
  for trending) — owner suggests starting as a chip.

## 13. Docs / Deployment / Ops

- [ ] Internal docs repository / KB expansion + accuracy audit.
- [ ] Document uploads (Supabase Storage bucket + RBAC).
- [ ] Generalized form-builder (weights/scoring) — deferred, own workstream.
- [ ] "Where's my data?" catalog. *(Named in 2 files — see Duplicates.)*
- [ ] **Multi-tenant deployment path** — same item as P4 above; per-tenant isolation, credentials,
  onboarding, ops monitoring, billing posture.
- [ ] Backup/rollback story for Supabase. *(Named in 3 files — see Duplicates.)*
- [ ] Telemetry/usage DB (panel usage, error logs, pipeline health, tamper detection) — schema
  cheap, build is a real project; auto-shutdown should be flag-first, not automatic.
- [ ] Security sweep (from existing security-notes/RLS-hardening docs).
- [ ] ⚠️ **CORRECTED PROVENANCE (made during PM review of PR #434) — `changelog-version.test.js`
  does not guard version monotonicity, but this was already written down.** The finding itself
  checks out (confirmed independently: 10 `it()` blocks in the test — not 11, minor miscount —
  none of them compares the shipped version against the previous one; the v5.016/#309/#310/#321
  renumbering and the #298-before-#301 merge-order story both check out against real `git log`).
  **What's wrong is "not previously written down."** `memory/pm-handoff-2026-08-15.md:64-69`
  records this almost verbatim, same date, same "single most recurring near-miss of the session"
  framing: *"`changelog-version.test.js` guards desync between `changelog-data.js` and
  `changelog-latest.js`, NOT monotonicity — a backwards version ships green."* The gap is real; the
  claim that the original 20-file sweep couldn't have found it is not — `pm-handoff-2026-08-15.md`
  simply wasn't one of the 20 files swept. **Fix is cheap:** one assertion that the newest entry's
  version is strictly greater than the runner-up. Until it exists, the mitigation is manual and
  must be repeated on every changelog-touching PR.
- [ ] ⚠️ **CORRECTED PROVENANCE (made during PM review of PR #434) — this PII/credential-handling
  content already exists, in detail, in two memory files the original sweep didn't cover.** Not
  "unwritten, exists only in conversation" as originally framed — the sweep's 20-file list simply
  didn't include `memory/qsrsoft-report-catalog.md` or `memory/pm-handoff-2026-08-15.md`, both of
  which cover this ground more thoroughly than this item did:
  1. **`x-auth-token` sequencing.** `pm-handoff-2026-08-15.md`'s own "Security constraints (verbatim
     intent — preserve on every future handoff)" section (§8): *"Sequence any future capture request
     behind a rotation, never alongside one"* + *"Strip `x-auth-token` from every capture. Never
     write one to a file or a commit."* Same substance as this item's "cycle the session first, then
     take the capture."
  2. **`storePeoplePunches` exposes `ssn`.** `qsrsoft-report-catalog.md` has a dedicated `## ⚠️ PII
     — storePeoplePunches exposes ssn` section (line 1581) with the full column list spelled out,
     plus a broader, stricter follow-on instruction that `employeeRoster` exposes far more (SSN,
     DOB, address, phone, emergency contacts) and needs an explicit field allow-list, not just a
     `storePeoplePunches` never-select rule.
  3. **Roster workbook deletion.** Also already referenced in `qsrsoft-report-catalog.md` as
     *"This repo already has a standing instruction to delete roster workbooks."* ❓ Whether the
     deletion itself happened is still a real open question — that part of the item stands.
  **The actual gap, now correctly scoped:** this content is real, correct, and already written —
  it's just sitting in two files this backlog's sweep missed, which is a discoverability problem
  (fix: index these files, or fold their PII sections into `CLAUDE.md`'s own standing rules where
  they'd actually get read), not a "write it down for the first time" problem. Worth noting for
  whoever runs a future sweep of this backlog file: if two files were missed, more may have been.
  Deliverable is a short written capture protocol + the never-select field list. §13's existing
  "Security sweep" item is about RLS and does not cover this human-process surface at all.
- [ ] App Store readiness roadmap (deliverable = roadmap doc only).
- [ ] ❓ Capacity-review questions (usage/dev-pace vs. growth; onboarding readiness for new users).
- [ ] ❓ Needs clarification from owner: "Aug 19-21 JR" note; Google Reviews "fun for now"
  confirmation.
- [ ] ❓ Run the v4.839 retail-event seed/measure scripts — blocked on owner go-ahead
  (production-writing).
- [ ] Sooner Rd/Tinker AFB event tagging; broader Event Lookup (major-retailer proximity, pop-up
  event detection).
- [ ] Task Queue + Feature Requests panel merge (IA decision).
- [ ] Panel Manager — list every panel with a locked "core" reference section. *(Named in 3
  files — see Duplicates.)*
- [ ] Data Manager — show source report per data type, extend to auto-synced sources. *(Named in
  2 files — see Duplicates.)*
- [ ] Save/Restore Session — verify it backs up what's needed, relocate in nav.
- [ ] ❓ LifeLenz AOS — needs an explicit owner decision (rescope vs. close); should NOT be picked
  up as originally filed.
- [ ] Open question, never resolved: does the discarded-targets bug (#153/#167) also hit
  Projections' `sales_proj`?

---

## Cross-file duplicates — resolve to one canonical entry before triaging

The sweep found the same ask filed independently in multiple source files. Listed here so a PM
pass consolidates rather than tracks both copies:

1. **Metric Registry/Resolver/Lineage** — `notes-57` (full plan), `notes-60` (self-flagged "same
   ask as n57, don't build twice"), `notes-61` (Resolver framing + SMG defs + metric listing).
2. **Panel Manager "show everything + core list"** — `notes-25` #9, `notes-27` #7, `notes-60`.
3. **Data Manager per-source labeling** — `notes-25` #8, `notes-27` #9.
4. **Backup/disaster-recovery** — `notes-54-56` §1.3, `notes-61` deferred item, `notes-24`
   deployment §5.
5. **Google Reviews / online reputation** — `notes-54-56` §3.6 (one-line mention) superseded by
   the full `notes-59` research + build plan (§5 above).
6. **Visit Readiness "rework/rethink"** — `notes-26` #7 and `notes-60`.
7. **"Where's my data?" source catalog** — `notes-26` #3 and `notes-24` §3(a).
8. **Auto-pull migration remnants (Schedule Summary)** — `notes-54-56` §2.3 and `notes-60`
   concrete-bug #3 — same root cause.
9. **EOM qty-variance / Item Journey reconciliation** — asked in `notes-29`, `notes-30`,
   `notes-62`; partially shipped in `notes-63` (Change Monitor table only).

## Already confirmed done — strike from any future list

- **Simple Models across projection streams** — shows as open in `notes-26` #6 and `notes-28` #1,
  but is confirmed **DONE** (v4.532) per CLAUDE.md. Stale duplicate, safe to remove.

**Added by pass 1 (2026-08-19), each with the evidence that settled it:**

- **Bullseye distribution chart** (§11) — `src/views/bullseye-tile.js`, v5.012 (#274), full spec
  implemented; palette fixed in #280/#282, light mode in #298.
- **`getDOWTrend` tiny-LY guard** (§4) — `src/engine/forecast.js:642` `_yoyPoint`, both call sites,
  `src/__tests__/yoy-trend-guard.test.js`.
- **Info-icon field scraper** (§3) — v4.386/v4.387, `scripts/qsrsoft-field-scraper.mjs` +
  `scripts/parse-field-defs.mjs` → `qsr_field_definitions`.
- **Stray CloudDocs `* 2.js` duplicates** (§8) — `find` returns 0.
- **Ponce de Leon future clean-data-start** (§4) — `src/__tests__/calibrate-new-store.test.js`,
  guard in `src/engine/backtest.js`. *(Code-level only; live Dialed-In behaviour unverified.)*
- **Workstream C first slice** (§0) — not "done", but decisively **not** "never started": module,
  2 adopters, unit test, and ratchet R8 all shipped in #431/#432.

---

## What pass 1 did NOT settle — read this before assuming coverage

Listed explicitly so pass 2 can target them rather than re-walk the whole file blind. These were
looked at and left unresolved **on purpose**, because code alone cannot answer them:

1. **§2 #225 viewport-scroll lock** — searched `src/meridian.css` and `src/app` for
   `overscroll-behavior` / `touch-action` / scroll-lock idioms and found nothing conclusive. The
   item's own text says devtools emulation is insufficient, so this needs **a real phone**, not a
   deeper grep. Unchanged.
2. **§10 Swing Watch "Acknowledged" placement** — the acknowledge *mechanism* exists
   (`src/app/App.js`, `src/__tests__/swing-feed.test.js`), but the ask is specifically about
   **placement at the top of Needs Attention**, which is a rendering-order question this pass did
   not trace to a conclusion. Do not read the mechanism's existence as the item being done.
3. **§4 District View 14-item punch list** — a compound item; individual sub-claims were not walked.
4. **Every ❓ owner-decision item** across §2, §5, §6, §7, §9, §10, §13 — these are decisions, not
   code states. Grep cannot close them and pass 2 shouldn't try.
5. **Anything requiring a live Supabase read** — `qsr_fob` RLS (§4), FOB Analysis May-2026 cap
   (§4), `store_assessments` counts (§12). The anon key returns zero rows under RLS; **a zero is
   not absence**, and this repo has burned two sessions on exactly that inference before.

---

## How to use this file

Two PM review passes re-verify status against actual code (not assumption) and correct the
checkboxes/status tags above.

**Corrected 2026-08-19 (pass 1):** an earlier draft of this section described the two passes as
owning **disjoint sections** and running **concurrently**. That is not the plan. **Both passes
cover the ENTIRE file, and they run SEQUENTIALLY** — pass 1 verifies and merges, then pass 2 runs
a full independent pass over the same whole file, partly to sanity-check pass 1's conclusions and
partly because pass 2 may carry first-hand knowledge of work it personally built or measured.
Since the passes are sequential there is no concurrent-collision case to manage; pass 2 branches
off `main` after pass 1 has landed.

**For pass 2 specifically:** treat every pass-1 conclusion as a claim to check, not a result to
build on — that is the entire point of a second pass, and pass 1 has no special standing. Lines
carrying `(re-verified pass 1)` were checked and found genuinely open. Lines with no pass-1
annotation were **not** individually settled and should not be read as confirmed either way.

**Targeted `memory/` coverage sweep (2026-08-19, PM, after both passes) — result: no new items
found, closing the recurring gap both passes hit.** Both passes independently discovered real
content in memory files the original 20-file sweep never covered (`pm-handoff-2026-08-15.md`,
`qsrsoft-report-catalog.md`, `dispatch-20.md` — all indexed in `MEMORY.md`, all on `main`). Rather
than run a third full re-verification pass, this was a bounded, mechanical check: every memory
file matching the same "handoff/session/plan"-shaped profile as those three, that was **not** in
the original sweep's file list, checked directly for open content. Five files matched the profile
(`handoff-data-refresh-sprint.md`, `handoff-smarttargets-graded-accuracy.md`,
`plan-data-integrity-sweep.md`, `session-2026-08-07-perf-and-rls.md`,
`session-handoff-2026-07-28.md`) — all five checked individually, not sampled. **Every open item
found in them is either already resolved (confirmed via `git log`/file existence: PR #93 merged,
`golden-dataset.test.js` exists, `qsr_daily_activity_rollup` exists, the "NOT STARTED" Smart
Targets multi-projector shipped in 3 layers per `vision-and-roadmap.md`) or already captured
elsewhere in this file** (service-role-key rotation traces into `project-rls-hardening-plan.md`,
already covered by §13's "Security sweep" pointer; the UI/UX items are already in §2).
`plan-data-integrity-sweep.md` turned out not to be an open-item file at all — a completed,
delivered sweep report with documented scope decisions, not TODOs. **This does not prove no other
file was missed** — it closes the specific hypothesis both passes raised (files in this
handoff/session/plan shape), not every possible gap. If a future pass finds another item claiming
"not previously written down," the standing instruction (grep `memory/` before trusting that
claim) still applies.
