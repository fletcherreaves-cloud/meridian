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

---

## 0. Normalization plan (`plan-normalization-2026-08-17.md`) — re-verified 2026-08-19, current

This section IS current — verified today, not stale. See `MEMORY.md`'s dispatch #22–#32 entries
for full detail on each.

- [x] **A — forecast render path.** ✅ Shipped (`forecast_week_cache`). 🟡 Follow-up: real
  click-trace (dispatch #31) found cache coverage is 100% but 66% of `AtAGlance`'s render cost is
  still unexplained by any span; instrumentation to localize it just shipped (PR #431).
- [x] **B — event scope + recurrence.** ✅ Shipped, RLS-verified in production.
- [ ] **C — pipeline contract.** ❌ **Never started.** Dispatch #25/#32 brief stands: build
  `scripts/_pipeline-contract.mjs`, convert a bounded slice of the 17 ungoverned pull scripts,
  seed a ratchet. C2 (idempotent partition replace) is separate, fully greenfield.
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
- [ ] Token adoption chain (#276→#286→#287, 111 sites → #296 step 2, 265 white-alpha sites) —
  visual-foundation prerequisite before any palette change.
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
- [ ] ❓ LifeLenz Time & Attendance has no live source (hand-transcribed since June) — needs
  owner's live session + DevTools capture.
- [ ] `labor_rows` (manual Labor Report) sweep — other raw `ds.laborRows` readers still hit
  staleness; only Dialed-In was rerouted through the resolver.
- [ ] Route `compute6wk` through the metric-source resolver (15 resolvable fields still read raw
  arrays); fix `avg6`'s zero-skip bug.
- [ ] Ponce de Leon (43701) `detectCleanDataStart` returns a future date, breaking Dialed-In
  calibration for that store.
- [ ] ❓ `dt-speedofservice.js`'s second "PM" daypart label — needs owner confirmation before
  renaming.
- [ ] **Metric Registry/Resolver unification** — merge `signal-registry.js` (110 metrics) and
  `metric-source.js` (~50 now); add lineage, aggregation metadata, catalog UI, CI enforcement.
  *(Named independently in 3 files — see Duplicates section.)*
- [ ] Info-icon field scraper (QSRSoft ℹ tooltips → `qsr_field_definitions`) + field dictionary.

## 4. Correctness Bugs (concrete, investigable)

- [ ] 6-Week Performance chart can render 200,000–1,200,000% — `getDOWTrend` lacks a tiny-LY-
  denominator guard.
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
  `computeModelHealth`).
- [ ] District View 14-item visual-review punch list — mostly unconfirmed as fixed (Biggest Miss
  counting a partial day, missing labor at 10am, low-contrast Intelligence Brief, TPPH not
  populating in two panels, Tishomingo wrongly flagged "new model store," Records not all-time,
  Critical/Watch chips not clickable, and more — see source file for full list).
- [ ] `diffUserEventsForCloudSync` multi-day-span label-suffix gap — deliberately deferred.

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
- [ ] Cleanup: stray CloudDocs duplicate files (`src/**/* 2.js`).

## 9. SAGE Enhancements

- [ ] Tool-breadth expansion — give SAGE the metric resolver as a generic query tool (flagged as
  the single biggest win available).
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

- [ ] Bullseye distribution chart (full spec: angle=market sector, radius=signed %-vs-target,
  equal-area rings, palette fix) — not built.
- [ ] ❓ State-of-business walkthrough engine (evidence-first, learning loop) — presentation
  format still undecided, not built.

## 12. Staged Experiments / Risk Tracking

- [ ] 🟡 `store_assessments` table — 8/20 scheduling-workshop stores rated as of 2026-08-14,
  remaining 12 due 2026-09-03; top-5-of-20 binary reconciliation also due then.
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

---

## How to use this file

Two PM review passes are tasked with re-verifying status against actual code (not assumption) and
correcting the checkboxes/status tags above — see the two scoped prompts prepared alongside this
file. **Each pass owns a disjoint set of sections** (listed in its prompt) so two sessions can run
concurrently without touching the same lines. Whoever merges last should diff against the other's
already-merged changes before pushing, same as any other collision in this repo — combine, never
silently overwrite.
