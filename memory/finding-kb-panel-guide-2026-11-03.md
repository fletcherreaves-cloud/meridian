---
name: finding-kb-panel-guide-2026-11-03
description: "Panel Guide KB expansion (task #75) -- what already existed vs. what this pass added, scope of the first batch, and what's intentionally deferred."
metadata:
  type: finding
---

# Panel-level Knowledge Base articles (2026-11-03)

## What already existed (found before building anything)

Before this pass, there was **no dedicated panel-level documentation system** to extend -- but
there WAS already a full, working Knowledge Base INFRASTRUCTURE, just narrow in content:
`KB_ARTICLES` (an object literal, oddly located in `src/engine/forecast.js`), `KnowledgeBasePanel`
(a searchable/filterable article browser, same file), and `InfoIcon({articleKey, inline})` -- a
small `?` icon component that opens one specific article inline, already used in 4 files
(analytics.js, management.js, store-dash.js, App.js). This `InfoIcon` component **is** the
"recognizable icon that points directly to a KB article" the owner asked for "at some point" --
it didn't need to be built, only rolled out to more panels (explicitly deferred, see below).

The existing ~31 articles were strong but narrow: mostly **metric-level** (OEPE, TPPH, Labor %,
T-Red, Cash O/S, MAPE, each already written in real SOP depth -- what it measures, why it
matters, targets, causes) and **forecast-engine-level** (DI/AE/EWMA model internals). Only 5 were
panel-level App Guide entries: `panel_index` (a one-line-per-panel directory, not full depth),
`file_import_guide`, `locked_projections`, `smart_targets`, `lifelenz_bridge`.

## What this pass added

Owner-confirmed scope (AskUserQuestion, 2026-11-03): start with the highest-traffic panels first
(not all ~94 in one pass), as a new `'Panel Guide'` category in the SAME `KB_ARTICLES`/
`KnowledgeBasePanel` system (not a second UI). Added 20 new entries, each following the owner's
exact requested shape -- overview, how the data is obtained, what it represents, how to read and
use it, SOP style -- covering the panels in `WORKFLOW_GUIDE_SECTIONS`'s DAILY/WEEKLY/MONTHLY/KEY
FEATURES list: `home_at_a_glance`, `priority_brief`, `store_dashboard_overview`,
`shift_analysis_tab`, `intelligence_brief`, `planning_hub`, `pvsa`, `di_calibration_panel`,
`food_cost_panel`, `gm_letters`, `delivery_3po`, `revenue_intelligence`, `guest_voice_smg`,
`scheduling_hub`, `store_kb_guide`, `why_engine_guide`, `competitive_impact_guide`, `sage_guide`,
`signals_guide`, `performance_reviews_guide`.

Content was drafted by 4 parallel research passes, each instructed to read the real source
(view/engine files) rather than guess, and to flag anything uncertain rather than invent it --
every draft was reviewed before being added. Two of those passes caught REAL stale-wording bugs
beyond what the earlier Workflow Guide/tutorial audit (same day, see
`memory/finding-daypart-tpph-targets-and-role-guide-2026-11-02.md`'s sibling commit) had found:

## `panel_index` audit against live panel-registry.js labels (later the same day)

Measured each of `panel_index`'s one-line bullets against the real `panel-registry.js` entry it
names, per the "measure, don't reason" standing rule -- not a reasoning pass, an actual label-by-
label diff. Found 4 real, confirmed drift bugs (fixed in the same pass, not just flagged):

1. **"Events & Tags" -> "Events".** `panel-registry.js`'s `events` id's label is `'Events'`
   (changelog 5.343.js: *"'Events & Tags' relabeled 'Events' in the sidebar, matching its now-
   broader scope"*) -- `panel_index` still used the retired name.
2. **"Rankings" -> "Leaderboards".** `panel-registry.js`'s `id:'ranking'` entry's real label is
   `'Leaderboards'`; "Rankings" was never the live label.
3. **Scheduling hub: "five tabs" -> 12 tabs.** `App.js`'s `SCHED_TABS` array has grown to 12
   entries (Labor Analytics, Pay Events, Schedule Discipline, Compliance Audit, Employee
   Performance, Scheduling, Schedule Summary, Labor Analysis, Labor Allocation, Training
   Retention, Retention Rollup, Skills) -- `panel_index` still described the hub's original 5,
   missing 7 real tabs entirely (3 of them added just this week: Schedule Discipline, Compliance
   Audit, Employee Performance, per the LifeLenz Data Explorer work).
4. **"Leadership One-Pager" -> retired, merged into "Above-Store One-Pager".** `panel-registry.js`
   documents this directly: *"'leader-one-pager' (Leadership One-Pager) retired here (dispatch
   #190, owner-approved 2026-08-10 decision list) -- merged into 'above-store' (Above-Store
   One-Pager) ... behind a Rollup/Leadership scope selector."* `panel_index` still described it
   as its own live standalone panel, three months after it stopped existing as one.

**Deliberately bounded, not a full sweep:** checked every bullet for wrong/retired labels and
undercounted tab lists -- real, provable drift. Did NOT attempt to add every `kind:'nav'` panel
missing from `panel_index` entirely (e.g. `eom-dashboard`/"Inventory Control", `district-lens`,
several Signal-Lab-style derived panels like `item-velocity`/`channel-mix`/`weather-impact`) --
whether those genuinely belong in a one-line directory at this granularity is an editorial/scope
call, not a measurable fact, and conflating "panel never mentioned" with "panel mislabeled" would
have ballooned this into the full ~74-panel sweep that's explicitly deferred (see above). That
gap audit is still open if someone wants to do it as its own pass.

4 new tests in `dispatch-workflow-guide-kb-staleness-2026-11-02.test.js` (mounting the real
`KnowledgeBasePanel`), one per fix above.

## Earlier Panel Guide batch findings

- **Why Engine** -- `App.js`'s Workflow Guide KEY FEATURES text said it "surfaces the most likely
  root cause with confidence score." The real mechanism (`diagnoseMiss()`, `src/engine/why.js`)
  returns a list of up to 7 independently-checked causes, each tagged PRIMARY/CONTRIBUTING/NOTE/
  DISTRICT-WIDE/MULTI-STORE/REGIONAL/UNKNOWN -- a ranked list of tagged causes, not a single
  numeric confidence score. Fixed in the same commit as this KB expansion.
- **Performance Reviews** -- `tutorial.js`'s Step 8 said "Score them across 6 KPI dimensions."
  The real structure (`review-engine.js`'s `CAT_KEYS`/`CAT_LABELS`) is **4 weighted categories**
  (Running Great Restaurants, Sales Drivers, Profitability, People Staffing & Retention) plus a
  separate Administration section, fully customizable per org (renamable, addable, removable) --
  not a fixed 6. Fixed in the same commit.

Both are the exact pattern the owner flagged concern about ("we've changed some panel titles/
behavior over time") -- caught by having the research passes read the real code instead of
trusting the existing onboarding copy, consistent with this repo's "measure, don't reason" rule.

## Left for a later pass (deliberately, not an oversight)

- **The InfoIcon rollout to every panel** -- explicitly "at some point" per the owner's own
  wording, lower priority than the content itself. The component already exists; wiring it onto
  ~90 more panel headers is its own, much larger-blast-radius UI change (one Edit per panel file)
  that shouldn't be bundled into a documentation-content PR.
- **The other ~74 panels** not in the first batch (Test Kitchen experiments, admin/settings
  panels, less-trafficked reports, etc.) -- not started. `panel_index` still covers all of them at
  the one-line-directory level in the meantime.
- **`window._openKB(articleKey)`** (App.js) currently ignores the `articleKey` argument and just
  opens the panel without pre-selecting that article -- a real gap for a future "click here to
  jump straight to this panel's article" flow, not touched in this pass (out of scope: this pass
  is content, not the deep-link wiring).
- ✅ **This audit WAS done later the same day** -- see "`panel_index` audit against live
  panel-registry.js labels" above. It found real drift, not a clean bill of health.

## Added later the same day: `targets_editor` (task #75, after #61/#62 shipped)

A real gap, not an oversight at the time -- when this batch was written, Monthly/Yearly Targets
were still read-only (#61/#62 built the click-to-edit grids in the same session, right after this
batch merged). Added one combined Panel Guide article, `targets_editor`, covering both grids:
how in-app editing differs from Excel upload (full-row upsert, not a partial write), the real
field/category lists for each (`PROJ_FIELDS`: Sales & Labor/Service/Food Cost/Other Costs;
`YEARLY_CATS`: Service & Ops/CSAT/Digital/People/Labor & FOB), and -- given how many real
stale-fact bugs this exact subject produced today, see
`memory/plan-targets-system-2026-11-02.md`'s "Lock Week" correction -- an explicit statement that
neither grid has a lock/override mechanic, with a pointer to the real one (Test Kitchen →
Projections / the `locked_projections` article). Covered by
`dispatch-kb-targets-editor-2026-11-03.test.js` (2 tests, mounting the real `KnowledgeBasePanel`).

## Added later the same day: `visit_readiness_guide` (task #75)

Another real gap in the original 20-article batch -- Visit Readiness is a shipped, significant
feature (v4.501, `src/engine/visit-readiness.js`) that was never covered. Added
`visit_readiness_guide` matching the batch's house style, with the real sub-score weights
(`READINESS_WEIGHTS`: Speed 35% / Accuracy 30% / Quality 20% / Leadership 15%, each read from
the engine, not guessed), the real EcoSure-vs-waste/variance-proxy food-safety behavior (per
CLAUDE.md's Panels & Modules table and the dispatch #231/EcoSure-replacement finding), and the
real "top risk drivers" + "last actual visit" fields the report renders. Explicitly notes
food-safety status is kept OUT of the readiness composite by design. 2 tests
(`dispatch-kb-visit-readiness-2026-11-03.test.js`), mounting the real `KnowledgeBasePanel`.

## Added later the same day: `equipment_results_guide` (task #75)

A third gap -- Equipment Results (`src/views/equipment-results.js`) shipped THIS SAME SESSION
(tasks #56-58: PQRG equipment-settings reference, survey link management, results landing panel)
and had zero KB coverage. Before writing anything, measured live (service-role REST, per
"measure, don't reason") whether the feature's 3-step deploy sequence (SQL/seed/edge-function
redeploy, documented in `memory/project-equipment-profile.md`) had actually run: confirmed
`equipment_catalog_settings` at 240 real rows and `equipment_survey_entries.settings_reviewed`
column exists (both steps 1-2 done), `equipment_survey_entries` itself at 0 rows (no crew
walkthrough logged yet -- expected, not a bug, since this just shipped), `equipment_survey_links`
at 1 row. Recorded in `project-equipment-profile.md` so this doesn't need re-measuring, and
updated task #56's own status to reflect it. Added `equipment_results_guide` describing both
halves of the panel (link management + cross-store rollup), the real placement-zone list
(Front Counter/Drive Thru/McCafé Cell/BDAP Cell/Dessert Cell/Production Area/Prep Area/Back of
House), the real PQRG-settings tie-in, and explicitly that a zero-item store just hasn't been
walked yet. 2 tests (`dispatch-kb-equipment-results-2026-11-03.test.js`).

## Added later the same day: `data_manager_guide` (task #75)

A fourth gap, and arguably the highest-traffic one found all day -- Data Manager
(`DataManagerPanel`, `src/views/analytics.js`) is step 1 of the in-app Workflow Guide's DAILY
cadence ("Load fresh data") and had zero KB coverage. Added `data_manager_guide` describing the
real manual-upload-vs-on-demand-Sync split (verified against the real `SYNC_LABEL` map -- dar/
ebos/fob/lifelenz/secevents -- and the AUTO-badge/staleness-dot rendering in `analytics.js`, not
guessed), the per-source coverage table, and the standing "auto/emailed-first, freshest-wins"
sourcing rule from CLAUDE.md's Dev Rules (manual uploads fill gaps, never override auto/emailed
data). Also notes the "Clear ALL stored data" action as a last resort, not routine. 2 tests
(`dispatch-kb-data-manager-2026-11-03.test.js`).

## Added 2026-11-04: Graded Visits, Security, Customer Complaints, Crew Schedule, Labor Analysis,
## Task Queue (task #75, next batch)

Picked from `memory/plan-role-based-panel-gating-2026-11-03.md`'s §3 cross-walk of real GM/
Supervisor job routines to live panels -- all six are named directly in that document, so this
batch is traffic-prioritized the same way the first one was, not an arbitrary next-six pick.

- **`graded_visits_guide`** -- read `src/views/graded-visits.js` directly rather than assume its
  relationship to Visit Readiness: it is the REAL, already-happened CFV/RGR/EcoSure visit record
  (80% CFV pass threshold, confirmed from the file's own `PASS` constant), not a second predictive
  score. Visit Readiness's own "last actual visit" field is sourced from this exact table, so the
  new article cross-references it explicitly rather than duplicating or contradicting it. Also
  documents the real polymorphic `report_type` trap this file's own header comment warns about --
  CFV/RGR's `modules` field is `{category:{pct}}`, EcoSure's is a completely different shape
  (`pointsReceived`/`citedItems`/`sections`/`comments`) on the same column, which crashed the panel
  once in production (2026-09-04) before the `.pct`-shape filter was added.
- **`security_guide`** -- read `src/views/security-panel.js` and `src/engine/security-drilldown.js`
  plus the `security_rules`/`security_findings` schema files rather than guess the rule taxonomy.
  Confirmed the real subject-grouped (not rule-grouped) design and the real four-state verdict
  mapping (`verdictState()`: flagged/clear/undetermined/hygiene -- undetermined is an HONEST
  non-verdict, not a hidden "clear"), and the real, twice-corrected `securityPanelAccess()` gate
  (admin/owner/area_supervisor always; `gm`/`manager` only with `org_config.gm_identity_reveal_enabled`
  -- this function's own code comments record two real RBAC bugs fixed in it, 2026-09-16 and
  2026-10-28, so the article states the CURRENT gate, not an earlier draft of it).
- **`customer_complaints_guide`** -- read `src/views/customer-complaints.js` in full. Its own
  footer text already states in-code that it does NOT recompute the Complaint Contacts/100K rate;
  the new article states this up front so nobody mistakes this panel for a second source of that
  number. Notes the real manual/on-demand capture scripts (`browser-complaints-bulk-capture.js` +
  `import-complaints-history.mjs`) -- unlike the DAR/LifeLenz/FOB auto streams, there is no daily
  pull for this source, so "no cases captured yet" for a store means stale capture, not zero
  complaints.
- **`crew_schedule_guide`** -- read `src/views/crew-schedule-panel.js`'s own extensive header
  comments (dispatches #123/#125/#197) rather than guess the merge history. Documents the real,
  deliberate non-sharing of employee identity between the Schedule tab (LifeLenz
  `assignedEmploymentId`) and the Punches tab (QSRSoft `geid`) -- no crosswalk table exists, so a
  selection in one tab doesn't carry to the other, which the article states explicitly rather than
  implying one shared "employee picker." Also states the real dispatch #125 owner decision (names
  render directly here, unlike Security's gated reveal) so the two panels' different RBAC postures
  read as a deliberate distinction, not an inconsistency.
- **`labor_analysis_guide`** -- read `src/views/labor-analysis.js` in full (407 lines). This panel
  was previously only a one-line mention inside `scheduling_hub`'s article ("the weekly Fixed/
  Floor/VLH plan from the LifeLenz sync") -- confirmed that one-liner doesn't duplicate the real
  depth here (the dollar-weighted subtotal columns, the Config tab's fixed-hours inputs, the real
  auto-first/manual-gap-fill-only source chip, the "Partial week" 95%-coverage tooltip, and the
  printable per-store FLH worksheet with real McDonald's station codes) before deciding this
  merited its own article rather than being a redundant add. Explicitly distinguishes this weekly
  PLANNING tool from Scheduling Hub's own Labor Analytics tab (the day-to-day TPPH/labor%/OT read)
  so the two aren't confused.
- **`task_queue_guide`** -- read `src/views/task-queue.js`'s own header comment (dispatch #194)
  rather than assume the merge was complete. Confirmed from the file's own comment that the
  `tasks`/`feature_requests` table schema merge (`supabase/schema-tasks-feature-merge.sql`) is
  still a ready-to-run migration awaiting the owner's DDL action, not yet applied -- the panel
  already normalizes both tables into one shape client-side regardless, which the article
  describes without overstating the migration's real status.

No stale Workflow Guide / `tutorial.js` / `panel_index` wording was found for any of these six
panels in this pass (checked `src/app/App.js`'s `WORKFLOW_GUIDE_SECTIONS`/tutorial text directly)
-- unlike the `why_engine_guide`/`performance_reviews_guide` batch, which did catch real drift.
`panel_index` itself omits Security/Customer Complaints/Crew Schedule entirely, same as it omits
~70 other panels -- that is the already-documented, deliberately-deferred gap from the first
batch (see "Left for a later pass" above), not new drift, so it was left alone rather than
expanded as a side effect of this pass.

12 new tests (2 per article, mounting the real `KnowledgeBasePanel`):
`dispatch-kb-graded-visits-2026-11-04.test.js`, `dispatch-kb-security-2026-11-04.test.js`,
`dispatch-kb-customer-complaints-2026-11-04.test.js`, `dispatch-kb-crew-schedule-2026-11-04.test.js`,
`dispatch-kb-labor-analysis-2026-11-04.test.js`, `dispatch-kb-task-queue-2026-11-04.test.js`.

Still open, same as before: the other ~68 panels not yet covered (`panel_index` still covers all
of them at the one-line-directory level), and the `InfoIcon` rollout to more panel headers.

## This log itself had gone stale — 7 real articles shipped without a logged entry (found 2026-11-06)

Measuring `KB_ARTICLES`' real key count before starting the next batch (per this repo's own
"measure, don't reason" rule) found **69 keys**, not the ~61 this file's own running total implies.
Seven panel-level articles exist in `src/engine/forecast.js` with no corresponding section here:
`eom_dashboard_guide`, `controls_food_cost_link_guide`, `pricing_engine_guide`,
`leaderboards_guide`, `morning_brief_guide`, `reports_hub_guide`, `date_range_report_guide`. A
code comment above the first of these in `forecast.js` even says "Task #75 (ongoing KB-coverage
backlog) — 3 more nav-level panels with no guide yet," confirming they were deliberate #75 work
that simply never got logged back to this file — this doc's own standing instruction (every prior
section ends with "Added later the same day…") was dropped at some point, not a fabrication.
**Not retroactively reconstructing those 7 entries' own rationale here** — the content itself is
live and correct in `forecast.js`/`KnowledgeBasePanel`, and re-deriving "why" after the fact would
risk inventing a reason that wasn't the real one. Flagging the gap so a future pass doesn't
re-discover it as a surprise, and so this file's running total can be trusted again going forward:
**as of this correction, 69 keys existed before the batch below, 75 after.**

## Added 2026-11-06: Inventory Intelligence, Speed of Service, Store One-Pager, Weekly Count
## Status, Digital Checklists, Forms Library (task #75, next batch)

Picked from `memory/plan-role-based-panel-gating-2026-11-03.md` §3's GM-routine direct-match
table — the same cross-walk the 2026-11-04 batch drew its six panels from, confirmed to still have
real, uncovered candidates before picking (`inventory`, `dt-sos`, `one-pager`,
`weekly-count-status`, `checklist-fill`, `forms-library` — all real `kind:'nav'` ids in
`panel-registry.js`, all absent from the measured 69-key list above before this batch).

- **`inventory_guide`** — read `src/views/inventory.js` in full (694 lines). Documents the real
  four-tab structure (Service/Production/Overstock/Transfers), the cloud-first/manual-gap-fill-
  only sourcing from `qsr_inventory_summary` (confirmed via the panel's own 4-state header chip:
  loading/failed/cloud+gap-fill/manual-only), the `cls`-vocabulary synonym-mapping trap (an
  unrecognized class is flagged, never silently miscategorized), and the real natural-unit
  quantity fields (`eachFmt:true` always for cloud rows — confirmed the API never returns
  `uom:'Case'` — so Excess Cases divides by case size while Excess Value does not, which is why a
  plausible dollar figure can sit beside what looks like an odd case count for a small-pack item).
- **`speed_of_service_guide`** — read `src/views/dt-speedofservice.js` in full (952 lines).
  Documents the real per-station target fields (`tOepe`/`tR2p`/`tKvst`, each +40s amber buffer),
  that DT alone uses the reconciled `oepeSeconds()` formula (independently validated at r=0.9958
  against a real QSRSoft Service report) while FC/Kitchen/Beverage still use a simpler raw ratio
  (their own formula corrections are a separate, not-yet-done piece of work — stated honestly
  rather than implied as equally reconciled), and that Beverage has no per-store target at all
  (owner-confirmed) and always renders a dashed "(default)" band.
- **`store_one_pager_guide`** — read the `StoreOnePager` component in `src/views/analytics.js`
  directly. Documents the real KPI status-tier cuts (within 5% = On Target, within 15% = Watch,
  else Off Track), that the still-open business day is explicitly excluded from the averaging
  window (`businessDate()`), and that the five auto-written observations are generated from the
  SAME averaged figures the KPI table shows, not a separate narrative source.
- **`weekly_count_status_guide`** — read `src/views/weekly-count-status-report.js` in full.
  Documents that this panel and Count Cycle share the exact same compliance engine
  (`count-cycle.js`) and can never disagree, the real count-day-drift detection (a statistical,
  confidence-gated call, not a certainty), and the real asOf-resolves-to-the-whole-week behavior
  (so two people picking different days in the same week see identical results).
- **`digital_checklists_guide`** — read `src/views/checklist-fill.js` in full. Documents the real
  dependency on `scripts/qsrsoft-forms-pull.mjs` having been run (the panel's own empty-state names
  the exact command), the section-index+title response-keying convention (items have no stable id
  in QSRSoft's raw payload), and explicitly distinguishes this FILLABLE panel from the separate,
  still-existing blank/print-by-hand Forms (Printable) panel.
- **`forms_library_guide`** — read `src/views/forms-library.js` in full. Documents that it
  generates BLANK forms only, via the exact same builder functions (`weeklyReviewHtml`/
  `printWeeklyReview`/`downloadDoc`) the Leadership One-Pager uses for its own live-filled version
  — a shared-builder design that keeps the two from ever drifting into different layouts — and
  points to the One-Pager explicitly for live numbers. **Also flagged, not fixed (out of this
  pass's scope):** this panel renders its own hand-rolled `position:fixed`/`rgba` backdrop instead
  of the shared `ModalShell`/`RoutePanelShell` convention most panels now use — a real
  panel-contract gap (`memory/panel-contract.md`), left for a UI-convention pass, not a
  documentation-content one.

No stale `panel_index` wording found for any of these six — it already correctly names "DT Speed
of Service," "Forms Library," and "District View / Store One-Pager" with their real live labels.
It mentions none of Inventory, Weekly Count Status, or Digital Checklists at all, same as the
already-documented, deliberately-deferred ~70-panel omission from the first batch — left alone
rather than expanded as a side effect of this pass, same call every batch since has made.

12 new tests (2 per article, mounting the real `KnowledgeBasePanel`):
`dispatch-kb-panel-guide-batch4-2026-11-06.test.js`.

**Measured running total: 75 `KB_ARTICLES` keys as of this batch.** Still open: ~62 panels not yet
covered (down from ~68 at the last measured point, but re-measure before trusting any count in
this file again — see the correction above), and the `InfoIcon` rollout to more panel headers.

## Added 2026-11-06 (batch 5): Printable Forms, Curated Home, Log Something (Quick-Capture),
## Above-Store One-Pager, Org Summary, Promo/Discount ROI, Count Cycle (task #75, next batch)

Measured 75 real `KB_ARTICLES` keys before starting (confirmed by walking the object literal
directly, not trusting the number above without re-checking). `memory/plan-role-based-panel-
gating-2026-11-03.md` §3's GM-routine direct-match table is now **exhausted of easy candidates**:
of everything it names, only `forms-print` (the "Food safety / checklist items" row) was still
uncovered — picked first for that reason. The other six were picked by direct measurement (grep
`panel-registry.js` for real `kind:'nav'` ids, diff against the real `KB_ARTICLES` key list), not
guessed: the two brand-new-this-session features (`curated-home`, `quick-capture`, both shipped
earlier today) and three Supervisor/OM/DO-tier analytical panels (`above-store`, `operator-
summary`, `promo-roi`) that §3's Supervisor/OM sections name directly as already-correctly-visible
tooling at that tier, plus `count-cycle` (a hub-tab inside Inventory Control sharing Weekly Count
Status's own engine — also named in the GM table's food-cost-reconciliation row). **This batch is
7 articles, not 6** — one more than the usual batch size, since `count-cycle` was added once its
real engine overlap with the already-covered Weekly Count Status became clear mid-pass.

- **`forms_print_guide`** — read `src/views/forms-print.js` in full. Documents the real
  static-JSON-fetch sourcing (`public/forms/*.json`, produced once by `scripts/qsrsoft-forms-
  pull.mjs` — not a live query), the Compact B&W print toggle, and the self-serve "🔄 Request
  pull" action (dispatches the same `trigger-dar-sync` Edge Function `forms` workflow entry other
  on-demand syncs use, scoped to the current search text) — a real, not-previously-documented
  escape hatch from needing direct QSRSoft credentials to refresh a stale template. Explicitly
  distinguishes this BLANK/print-by-hand panel from the separate, cloud-saved Digital Checklists
  panel (already covered, batch 4).
- **`curated_home_guide`** — read `src/views/curated-home.js` and `src/engine/curated-home.js` in
  full (this session's own just-merged Curated Home Phase 1 work). Documents the real
  `ALTITUDE_BY_ROLE` mapping (store/patch/district), that the headline alone is regenerated at
  patch/district altitude while `detail`/`action` are reused verbatim (confirmed from the engine's
  own code comment on WHY that\'s safe — `MORNING_RULES` writes those two fields generically per
  severity tier, not per live value), and the real `curated_home_format` Supabase `user_settings`
  persistence shape (same pattern `kpi_secs` already uses). States plainly, per the PR\'s own
  judgment-call note, that this ships as its own nav panel today, not a Command/Home replacement.
- **`quick_capture_guide`** — read `src/views/quick-capture.js` and `src/engine/quick-capture.js`
  in full (also this session's own just-merged Quick-Capture Phase 1 work). Documents the real
  3-step flow, that it writes through the EXACT SAME `saveOrgEvents()` path the Events Calendar
  uses (via `buildQuickCaptureEvent()`\'s identical row shape), that the confirmation number is a
  REAL `loadEventImpact()`/`lookupMeasuredImpact()` lookup — honestly reporting "no measured
  history yet" rather than a fabricated figure on a first occurrence — and the explicit no-
  gamification design choice from the plan doc this shipped against.
- **`above_store_guide`** — read `src/views/above-store-onepager.js` (first ~520 of 780 lines —
  enough to cover the real view/period/panel-toggle mechanism, the dispatch #190 Leadership-
  cascade merge, the AI-analyze/print paths; did not need the remaining render-body lines for an
  SOP-level article). Documents the real Rollup-vs-Leadership toggle as a genuinely different axis
  from the location scope below it (not the same selector), the eight toggleable panels including
  the owner-requested Upcoming Impacts tile, and the on-demand stream-widening fix for an old
  Custom date range\'s LY leg.
- **`operator_summary_guide`** — read `OperatorSummaryPanel` in `src/views/labor-tools.js` in
  full. Documents the real four grouping modes (Company/Org/Operator/Patch — Patch uses the live
  `supervisorGroups()`, explicitly NOT the Settings editor\'s own save-time snapshot), and that
  TPPH/OEPE roll up via `metricRate`/`metricSumRatio` (true Σ/Σ, weighted by real hours/transaction
  count) rather than a plain per-store average — the issue #175 fix, stated as fact with its real
  mechanism, not assumed.
- **`promo_roi_guide`** — read `src/views/promo-roi.js` in full. Documents the real matched-day
  design (a verified-exogenous `org_events` promo-calendar tag vs. untagged same-weekday days),
  and states plainly that Discounts is INTENTIONALLY left unscored (no equivalent exogenous signal
  exists for a same-day discount decision) — a deliberate fix for a previously-measured-endogenous
  split (`memory/finding-promo-roi-denominator-bias-2026-08-23.md`), not a coverage gap.
- **`count_cycle_guide`** — read the `count-cycle` hub-tab's real engine (`src/engine/count-
  cycle.js`) via its own exported `cycleCompliance`/`detectWeeklyCountDay`/`countDayDrift`
  functions, the SAME ones `weekly_count_status_guide` (batch 4) already documents Weekly Count
  Status as reading — stated explicitly so the two articles cross-reference instead of risking a
  future contradiction between them.

No stale `panel_index`/Workflow-Guide wording found for any of these seven in this pass.

14 new tests (2 per article, mounting the real `KnowledgeBasePanel`):
`dispatch-kb-panel-guide-batch5-2026-11-06.test.js`.

**Measured running total: 82 `KB_ARTICLES` keys as of this batch.** Still open: ~55 panels not yet
covered, the GM-routine cross-walk itself now exhausted (future batches need a new candidate
source — the Supervisor/OM sections of the same plan doc, or direct panel-registry traffic
judgment), and the `InfoIcon` rollout to more panel headers.

## Added 2026-11-06 (batch 6): Trend Explorer, Conversion Efficiency Ratio, Oil Efficiency,
## Labor Opportunity Cost, Weather Impact, Loss Prevention Summary (task #75, next batch)

Measured 82 real `KB_ARTICLES` keys before starting (confirmed by walking the object literal
directly). Since the GM-routine cross-walk itself is now exhausted (see batch 5's closing note),
picked this batch from `memory/plan-role-based-panel-gating-2026-11-03.md` §3's Supervisor section
instead, which names `pricing-engine`, `promo-roi`, `trends`, `signals`, `ranking`, the "Reports
Hub deep-dives," `conversion-efficiency`, and `oil-efficiency` together as "all plausibly real
Supervisor tools" — of that named set, `trends` (Trend Explorer), `conversion-efficiency`, and
`oil-efficiency` were still uncovered, as were three of the named Reports-Hub deep-dives
(`labor-opportunity-cost`, `weather-impact`, `loss-prevention`) out of the nine that section lists.
Confirmed each id is real and `kind:'nav'` in `panel-registry.js` and absent from the measured
82-key list before picking.

- **`trend_explorer_guide`** — read `src/views/trends.js` (193 lines) and `src/engine/trend-
  explorer.js` in full. Documents the real deliberate single-store-only scope (stated in both
  files' own header comments — a correct district-wide rollup risks this app's own "never average
  averages" trap for rate/percentage metrics with no volume-weighting metadata), and that the
  "Moves together with" list reuses Signals' Scanner `scanAllPairs()` output directly — no second
  correlation engine or significance filter of its own.
- **`conversion_efficiency_guide`** / **`oil_efficiency_guide`** — read `src/views/conversion-
  efficiency.js` and `src/views/oil-efficiency.js` in full, plus their respective engine files. Both
  are manual-upload-only McDonald's-corporate reports, each with a "collapse to ONE latest period,
  never sum across periods" design and the SAME real 2026-10-20 incident (a too-narrow default date
  range silently hid a freshly backfilled historical upload) behind their wide "All Time" default
  preset. **A real, worth-noting nuance surfaced while reading, not a confirmed bug fix:**
  `supabase/functions/ingest-report/index.ts`'s `detectReportType()` already recognizes both
  reports' real filename patterns (`owner_operator*` and `cargill_food_oil_report`) and would route
  them through the same Gmail-ingest pipeline several other report types already use automatically
  — the RECEIVING side is ready, but each panel's own on-screen copy still states manual upload as
  the only path. Whether the SENDING side (the external Gmail Apps-Script poller) has actually been
  updated to forward these two filename patterns can't be verified from this repo alone, so this is
  noted in both articles as an open nuance, not claimed as stale wording and not "fixed."
  `oil_efficiency_guide` also cross-references this session's own VITO AG fry-filtration pilot work
  (task #59), built from this exact same `oil_use_pct`/`filtration_pct`/`impact_dollars`/Quality-
  Concern dataset.
- **`labor_opportunity_cost_guide`** — read `src/views/labor-opportunity-cost.js` and `src/engine/
  labor-opportunity-cost.js` in full. Documents the real `signedBasis` distinction (`'needed'` vs.
  `'sched'`) behind the arrow+tooltip redesign this same session shipped earlier (dropping the bare
  "(signed)" column-label suffix), and the real total-vs-average split per column (three $ columns
  summed across the range; two hour-gap columns + Sales/Person-Hr averaged, to avoid double-counting
  a persisting daily staffing gap).
- **`weather_impact_guide`** — read `src/views/weather-impact.js` and `src/engine/weather-impact.js`
  in full. Documents the deliberate historical-SPLIT design (rainy-vs-dry, hotter-vs-cooler-half),
  explicitly NOT a matched-day design like Promo ROI's, since weather has no equivalent exogenous
  "coverage window" concept to split on — stated as an honest association-not-causation read, same
  standard Promo ROI holds itself to.
- **`loss_prevention_summary_guide`** — read `src/views/loss-prevention-report.js` and `src/engine/
  loss-prevention-report.js` in full. Documents that this was the FIRST report built on the shared
  `ReportShell` chrome (the Reports-Hub-redesign proof-of-concept, Phase 2) and that every one of
  its 20 columns resolves through the same `metricValueForRange()` every other rollup in the app
  already uses — no second computation of its own.

No stale `panel_index`/Workflow-Guide wording found for any of these six in this pass.

12 new tests (2 per article, mounting the real `KnowledgeBasePanel`):
`dispatch-kb-panel-guide-batch6-2026-11-06.test.js`.

**Measured running total: 88 `KB_ARTICLES` keys as of this batch.** Still open: ~49 panels not yet
covered — remaining candidates from the same Supervisor-section note (`pricing-engine` and
`signals`/`ranking` are already covered; the other six named Reports-Hub deep-dives —
`weather-impact`/`loss-prevention` now also covered, leaving `price-change-impact`,
`item-velocity`, `channel-mix`, `custom-reports` genuinely open from that specific list) — plus
clearly-high-traffic panels not named in either plan doc at all (e.g. `attention`/"Needs
Attention", `brief`/"Forecast Brief") worth a future pass's own judgment call, and the `InfoIcon`
rollout to more panel headers.

## Added 2026-11-06 (batch 7): Needs Attention, Forecast Brief, Custom Report Builder,
## Price Change Impact, Item Velocity, Channel Mix (task #75, next batch)

Measured 88 real `KB_ARTICLES` keys before starting. Picked, in priority order: the four
remaining named-but-uncovered Reports-Hub deep-dives batch 6 flagged (`price-change-impact`,
`item-velocity`, `channel-mix`, `custom-reports` — confirmed each real and `kind:'nav'` in
`panel-registry.js` and still absent from the 88-key list), plus two clearly-daily-use panels no
plan doc names directly but whose own real traffic earns a judgment call: `attention` (Needs
Attention) and `brief` (Forecast Brief).

- **`attention_guide`** — read `AttentionPanel` (`src/views/analytics.js`) and the full
  `src/engine/attention-feed.js` engine. Documents the real ~17-detector merge inside
  `buildAttentionFeed()`, the "no-silent-caps" `rankAttention()` design (a hit cap logs exactly
  what was dropped instead of silently vanishing it), the pinned loc-less "District" strip, the
  Running-Well tier\'s deliberate sort-by-name (not by the composite Ops/Ctrl score this app has
  elsewhere flagged as unreliable for ranking), and the real `ATTENTION_ACK_SETTING_KEY` —
  deliberately SEPARATE from the swing alarm\'s own ack row (issue #115, Trap 2).
- **`brief_guide`** — **a real mix-up caught and corrected while researching this article, not
  just a documentation gap.** Before writing anything, traced `id:'brief'` (panel-registry label
  "Forecast Brief", 🔭) through `App.js`\'s actual routing rather than assuming from the similar
  name — it renders `LocationBrief` (`routePanel==='brief'`), a SAGE-written (`callSageOnce`)
  narrative brief built from 6 weeks of real trailing performance data, on-screen titled "🧠
  Intelligence Brief". This is a COMPLETELY different component from `DistrictPriorityBrief`
  (reached only via the separate `modal==='priority-brief'`/`showPriorityBrief` path, not this nav
  entry) — the two share "Brief" in their names and nothing else. This also surfaced a real, now
  FIXED stale `panel_index` line: it previously read "Forecast Brief — pre-forecast analysis of
  the upcoming period," which is backwards — the panel is entirely retrospective (6 weeks of
  what already happened), never a forecast of what\'s coming. Corrected in the same commit, with
  its own test (`dispatch-kb-panel-guide-batch7-2026-11-06.test.js`) asserting the old wrong text
  is gone and the new text is present.
- **`custom_report_builder_guide`** — read `src/views/custom-report-builder.js` and
  `src/engine/custom-report.js` in full. Documents the dynamic metric-picker catalog (grouped by
  the same categories Signals\' registry uses), the "View As" range-vs-daily/weekly/monthly
  decoupling (the window itself never changes, only how it\'s sliced), and the real Share
  mechanic (RLS-enforced visibility to the whole tenant; only the author can edit/delete — the UI
  simply never offers a control that would fail anyway).
- **`price_change_impact_guide`** — read `src/views/price-change-impact.js` and
  `src/engine/price-change-impact.js` in full. Documents the real `DEFAULT_WINDOW_DAYS` (14)
  confirmed-step detector reused directly from `price-events.js` — the SAME one the Pricing
  Engine\'s live simulator and Signal Lab already trust, not a second one — and that only
  CONFIRMED (flat-before/flat-after) price changes qualify, so a store with constant promotional
  noise around a real price change may show fewer or zero rows even though its menu did change.
- **`item_velocity_guide`** — read `src/views/item-velocity.js` and `src/engine/item-velocity.js`
  in full. Documents the real `DEFAULT_TOP_N` (50) cap, the first-half-vs-second-half Trend %
  (normalized to a per-day rate), and that this report makes its own direct pass over
  `ds.pmixRows` rather than routing through Scanner\'s per-item `pmixItem:<code>` resolver.
- **`channel_mix_guide`** — read `src/views/channel-mix.js` and `src/engine/channel-mix.js` in
  full. Documents the real five `CHANNEL_MIX_METRICS` columns (DT/Delivery-3PO/MOP/Kiosk/Front
  Counter) and that Trend is deliberately in percentage POINTS, not a relative % change — a
  channel moving 2%→4% of sales is a 100% relative jump but only a 2-point absolute shift, and
  points are the honest way to compare a shift\'s real weight against the other channels on the
  same row.

13 new tests (2 per article + 1 for the stale-wording fix, mounting the real
`KnowledgeBasePanel`): `dispatch-kb-panel-guide-batch7-2026-11-06.test.js`.

**Measured running total: 94 `KB_ARTICLES` keys as of this batch.** Still open: ~43 panels not
yet covered. The Supervisor-section plan-doc source (`plan-role-based-panel-gating-2026-11-03.md`
§3) is now fully exhausted — every panel it names by id is covered as of this batch. Future
batches need a fresh candidate source: a direct `panel-registry.js` `kind:'nav'` sweep diffed
against the current key list, judged on real traffic rather than a named list. The `InfoIcon`
rollout to more panel headers remains unstarted.

## Added 2026-11-06 (batch 8): Events, Market Intelligence, Cash Variance Pattern, Metric
## Lineage, District Lens, Pay Rate History (task #75, next batch)

Measured 94 real `KB_ARTICLES` keys before starting (confirmed by walking the object literal
directly). Both named candidate sources (`plan-role-based-panel-gating-2026-11-03.md`'s GM-routine
table and its Supervisor-tier list) were already exhausted as of batches 5 and 7's own closing
notes, so this batch used a FRESH method instead: grepped every real `kind:'nav'`/`kind:'optional'`
entry in `panel-registry.js` (70 total), diffed against the current `KB_ARTICLES` key list, and
picked 6 by direct judgment of real day-to-day operational traffic/importance — explicitly skipping
Test Kitchen experiments and the clearly low-traffic admin/settings panels (`about`, `settings`,
`panel-manager`, `workflow`, `troubleshoot`, `news`, `fob-reference-table`), same deferral every
batch has made.

- **`events_guide`** — read `src/views/events-panel.js` in full (the real "Events (unified panel)"
  Phase 3 shell, panel-registry id `events`). Documents the real 5-pill structure (Upcoming/
  Calendar/Log/Impact/Rules), that Upcoming vs. Log is one data source split by each event's
  `visibility` field (not two separate tables), the (date,label,type) collapse-into-one-row-with-
  scope-chip design, the confidence glyph's three real tiers (measured/estimated/assumed) read
  from the Event Impact Registry, and — the most load-bearing fact for this session's own earlier
  work — that this is the EXACT SAME `saveOrgEvents()` write path Quick-Capture's tiles and SAGE's
  `log_event` tool both already feed, confirmed by reading the real function call, not assumed from
  the shared name.
- **`loc_intel_guide`** — read `src/features/location-intel.js` in full (panel-registry id
  `loc-intel`, labeled "Market Intelligence"). Documents the three real modes (Statistical/AI/
  Demographics), that Statistical computes real Pearson-r/weather-bucket/median-split correlations
  live from `ds` with real per-stat minimum-sample gates, that AI mode's SAGE narrative is built
  from a JSON payload containing ONLY those already-computed Statistical figures (never a second
  data source), and that Demographics is architecturally independent of `ds` — its own Supabase
  table, refreshed only on an explicit Census Geocoder + ACS5 fetch click, never automatically.
- **`cash_variance_pattern_guide`** — read `src/views/cash-variance-pattern.js` and
  `src/engine/cash-variance-pattern.js` in full. Documents the real store × day-of-week grain
  (never register- or employee-level — this app's data model has no register-number field at all,
  confirmed from the engine's own header comment, and naming individuals is out of scope by the
  repo's "verify, don't accuse" convention regardless), the real 10 `CASH_VARIANCE_METRICS`
  columns, the 3-observed-day minimum bucket, and the deliberate absence of any built-in "flagged"
  threshold (the same no-unvalidated-cutoff posture Weather Impact and Channel Mix already take).
- **`metric_lineage_guide`** — read `src/views/metric-lineage.js` and
  `src/engine/metric-provenance.js`. Documents the real hand-curated-plus-auto-synthesized design
  (a core set hand-written because the prose itself is the value; everything else synthesized
  automatically from the SAME `METRIC_SOURCES` resolver every other metric in the app reads
  through, per that file's own Notes-61 header), and that this panel is a pure read with zero
  `ds`/Supabase coupling — the registry file itself IS the source of truth, not a view over one.
- **`district_lens_guide`** — read `DistrictLensPanel` in `src/views/analytics.js` in full.
  Documents the real heatmap (every store × every `CORR_PREDICTORS` metric, Pearson-r against a
  chosen outcome, over a 90-day trailing window ending on the last CLOSED business day), the
  opportunity-ranking formula (correlation strength × gap-from-district-average, not either one
  alone), the OK-vs-FL org-summary minimum-coverage gate, and that the AI-generated narrative's
  SAGE prompt contains only the already-computed top-metric/opportunity lists — no second
  computation hidden inside the narrative step.
- **`pay_rate_history_guide`** — read `src/views/pay-rate-history.js` and
  `src/engine/employee-pay-history.js`. Documents the real two-population merge (Crew: DERIVED
  via `weeklyCrewRates()`/`detectRateSteps()`, since no pay-raise event is ever logged for crew at
  all; Management: a real already-LOGGED change event the pull script's own diff writes), the real
  `rateBasis` straight-time-vs-blended distinction (an owner-caught 2026-11-05 correction — a step
  isn't a clean rate change unless BOTH its before and after rate are confirmed straight-time), and
  the real `logAppAccess('panel_view','pay-rate-history')` access-logging on every mount, since this
  is real wage data even within an Owner/Admin/DO-only panel.

**Checked for stale wording, found one genuine ambiguity, decided it's not drift:**
`panel_index`'s existing one-liner for Events ("promo / known-event calendar that feeds forecasts
& Smart Targets... relabeled from 'Events & Tags'") undersells the real current panel (it also
merged in the separate Event Impact nav entry, and now has Log/Rules tabs the one-liner doesn't
mention) — but nothing in that line is factually WRONG, only incomplete, which is the same
already-documented, deliberately-deferred one-liner-depth gap every prior batch has left alone
rather than new drift. No other stale wording found for any of these six panels in `panel_index` or
the Workflow Guide (`tutorial.js`/`App.js`'s `WORKFLOW_GUIDE_SECTIONS` text) — grepped both
directly, confirmed no mention of Market Intelligence/Cash Variance Pattern/Metric Lineage/
District Lens/Pay Rate History beyond code comments, and Metric Lineage's own one-liner already
matches the real panel.

12 new tests (2 per article, mounting the real `KnowledgeBasePanel`):
`dispatch-kb-panel-guide-batch8-2026-11-06.test.js`.

**Measured running total: 100 `KB_ARTICLES` keys as of this batch.** Still open: ~37 panels not
yet covered (`panel-manager`, `pmix`, `aiscan`, `compare`, `dar-daypart`, `settings`, `about`,
`workflow`, `troubleshoot`, `news`, `fob-reference-table`, `kb`, and the remaining Test-Kitchen-
excluded set among others — judged lower traffic than this batch's six, not yet measured
exhaustively). Both named plan-doc sources remain exhausted; future batches should continue the
fresh `panel-registry.js`-sweep method this batch established. The `InfoIcon` rollout to more
panel headers remains unstarted.

## Batch 9 (2026-11-06)

Continued the fresh `panel-registry.js` sweep method batch 8 established (both named plan-doc
sources — the GM-routine cross-walk and the Supervisor-tier list — remain exhausted). Re-swept
`kind:'nav'`/`kind:'optional'` entries directly (73 matched this pass) and diffed candidate
labels against real `KB_ARTICLES` titles, initially picking 6: Store Compare (`compare`),
Product Mix (`pmix`), DAR Daypart Analytics (`dar-daypart`), Priority Actions (`priority-brief`),
Email Digests (`email-digests`), Anomaly Scan (`aiscan`).

**Caught before merge: the `priority-brief` pick was a false positive, not a genuinely uncovered
panel.** While doing this batch's own stale-wording check, a grep of `forecast.js` surfaced a
pre-existing, more detailed article at the `priority_brief` key (`'Priority Brief — District
Priority Brief (Tiered Daily Coaching List)'`) that already fully documents this exact panel —
including the same `buildBrief()`/`MORNING_RULES` findings-engine distinction, the
calibration-gap watch, and an explicit note that "Priority Brief"/"Priority Actions" is a known
internal naming inconsistency, not two features. The newly-written `priority_brief_guide` entry
would have shipped as a thinner duplicate of already-covered ground. Deleted it (and its 2
tests) before commit, and swept `panel-registry.js` again for a genuinely uncovered 6th
candidate — **`fob-reference-table`** (FOB Reference Table, `kind:'nav'`, `route:true`,
section `'reports'`) — confirmed uncovered by grepping both `panel-registry.js` and
`forecast.js` for its exact label with no hit beyond the registry line itself.
**Takeaway for future batches: a sweep diff by label/id is necessary but not sufficient — a
panel can already be covered under a KB key whose title text doesn't literally match the
registry label (`priority_brief` vs. the registry's `priority-brief`/"Priority Actions"), so
still grep the full candidate name space (including known aliases) against `forecast.js` before
writing a new entry, not just before shipping it.**

Final six, each read against its own real source before writing:

- **`store_compare_guide`** — read `MultiStoreComparison` in `src/views/store-analytics.js`.
  Documents the 2–5-store cap (a 6th pick is blocked, not swapped), the Scorecard/Radar/Sales
  Trend views, that every number reuses each store's own already-computed summary (`s.opsScore`/
  `s.ctrlScore`/`s.p.*`) rather than computing anything new, and that DT Parked%/Labor% are
  deliberately left unstarred since neither direction is objectively "best" for a target-range
  metric.
- **`product_mix_dashboard_guide`** — read `ProductMixPanel` in `src/views/labor-tools.js`.
  Documents the Cloud/Manual toggle, the lazy-fill trigger (`ensureLazyFill('pmixRows')`, the
  real fix for a 2026-08-26 bug where 2.5M fresh rows sat unused because nothing had triggered
  the fetch), the separate wide-fetch tier (`ensureLazyFillWide`) gated on the 90D/180D/All
  ranges, and flags — as a real, confirmed `panel-contract.md` gap, not fixed in this pass — that
  this panel still renders its own hand-rolled full-screen backdrop instead of `ModalShell`.
- **`dar_daypart_guide`** — read `DARDaypartPanel` in `src/views/labor-tools.js` and
  `saveDarRows()`/`loadDarRows()` in `src/lib/supabase.js`. Documents the genuinely separate
  `dar_rows` table (manual-upload-only, this panel's sole consumer) vs. the much more widely used
  auto-pulled `qsr_daily_activity` the rest of the app reads — same "DAR" name, zero shared rows,
  not a contradiction when one shows data and the other doesn't for the same store.
- **`fob_reference_table_guide`** — read `FobReferenceTablePanel` in
  `src/views/fob-reference-table.js` and the full computation in `src/engine/fob-reference.js`.
  Documents the live rebuild of the owner's own Excel "Table 1 (2)" target-setting reference
  sheet (16 metrics × L3M/L6W/LM/MTD/Projected/Trend), the cumulative-MTD-to-daily-delta
  reconstruction (`fobDailyDeltas()`) required because `qsr_fob` is a running MTD snapshot not a
  daily figure, and the Projected blend (MTD weighted increasingly over L3M as the month
  progresses; a dollar metric first annualizes MTD to a run-rate before that blend).
- **`email_digests_guide`** — read `EmailDigestSubscriptionsPanel`
  (`src/views/email-digest-subscriptions-panel.js`) and `EMAIL_DIGEST_CATALOG`
  (`src/engine/email-digest-catalog.js`, exactly 2 entries today). Documents the generic
  catalog-driven subscribe/unsubscribe UI and explicitly distinguishes this org-wide scheduled
  **email** list from Reports Hub's "My Reports" (a per-scope, launchable in-app report with no
  email component).
- **`anomaly_scan_guide`** — read `AIBacktestScanner` in `src/views/analytics.js`. Documents the
  model-independent per-DOW median baseline (never forecast-vs-actual), the 21-day minimum before
  a store baselines at all, the confidence ≥ 75 + geo-relevant + specific-event gate before an
  auto-tag fires, and that a `broadEvent` (multi-store) finding is queued for human review rather
  than fanned out automatically.

Stale-wording check: no stale `panel_index`/registry-label wording found for any of the final
six — each registry label matches its KB article title exactly.

12 new tests (2 per article): `dispatch-kb-panel-guide-batch9-2026-11-06.test.js`.

**Measured running total: 106 `KB_ARTICLES` keys as of this batch.**

## Batch 10 (2026-11-06)

Closed out the remaining `kind:'nav'` candidates from batch 9's own sweep. Of the original
candidate pool, two ('help', 'admin') turned out to be false positives — they're entries in
`panel-registry.js`'s `SECTIONS` array (display-section labels), not actual panels, picked up
by a sweep script that matched `id:` anywhere nearby without checking which array it belonged
to. The 4 genuinely real, still-uncovered `kind:'nav'` panels:

- **`panel_manager_guide`** — read `PanelManagerPanel` in `src/app/App.js` and
  `loadPanelVis`/`savePanelVis`/`OPTIONAL_PANELS` in `src/constants.js`. Documents that
  visibility state is `localStorage`-only (`mf.optionalPanelVis`), per device/browser with NO
  Supabase sync — unlike nearly everything else in Settings — and that hiding a panel is a
  personal display preference only, never an access restriction (a "no access" row vs. a working
  toggle is role-based permissions, a separate system entirely).
- **`settings_guide`** — read `Settings` in `src/views/management.js` and `saveSettings()` in
  `src/app/App.js`. Documents the shared `set(path,val)` write path, that most sections DO sync
  via `pushConfigToSupabase(..., 'app_settings')` (the opposite persistence model from Panel
  Manager), and the one deliberate exception — the AI section's personal Anthropic API key is
  explicitly `localStorage`-only (`mf_anthropic_key`), stated directly in the UI's own copy.
- **`troubleshooting_guide`** — read `TroubleshootingPanel` in `src/views/troubleshooting.js` in
  full. Documents the End User / Developer mode split (no separate permission gate on Developer
  mode — same `perm:null` as the panel itself, so any user can switch into it), and that the
  Developer content is SEEDED from real existing sources (`sage.js`'s `buildTroubleshootPrompt()`,
  `stream-freshness.js`'s `STREAMS` array) rather than a second, driftable hand-typed copy — per
  the panel's own header comment. Also captured the owner's naming rationale: this panel IS the
  app's real "Help," deliberately distinct from the Workflow panel (the former onboarding
  checklist).
- **`news_guide`** — read `NewsPanel` in `src/views/news-panel.js` in full. Documents the real
  nine-outlet nightly pull (`news-rss-pull.mjs`) → classify (`news-classify.js`) → locality
  attribution (`locality.js`) pipeline, the deliberate "EITHER store" rendering for genuinely
  ambiguous town-level stories (Ardmore, DeFuniak Springs each have two stores) rather than
  guessing one, and the panel's own explicit non-claim to be McDonald's brand monitoring (the
  seeding run found zero brand mentions across all nine feeds).

Stale-wording check: all 4 registry labels match their KB article titles exactly — no drift
found.

8 new tests (2 per article): `dispatch-kb-panel-guide-batch10-2026-11-06.test.js`.

**Measured running total: 110 `KB_ARTICLES` keys as of this batch.** This closes out the
`panel-registry.js`-sweep candidate pool the last two batches worked through — remaining
uncovered panels are either meta/self-referential (`kb`, `workflow`, `about`), or belong to
`kind:'test-kitchen'`/`'hub-tab'`/`'internal'` (not yet measured exhaustively; lower priority per
CLAUDE.md's promotion-is-a-one-field-flip note — a Test Kitchen panel isn't "live" in the SOP
sense this backlog is covering). Future batches should re-sweep `kind:'hub-tab'`/`'internal'`
entries specifically, since several (e.g. Planning Hub's five tabs) may already be covered under
a parent panel's article and others may not be.

## 2026-11-06 — batch 11: the `nav`/`optional` sweep is exhausted

Measured directly (not assumed): of all 70 real `kind:'nav'`/`kind:'optional'` panel-registry
entries, **67 are covered.** Four of those weren't mechanically slug-matched to their article key
and had to be confirmed by reading the real article title against the real panel label before
counting them: `planning` → `planning_hub`, `delivery-mix` → `delivery_3po` ("3PO Delivery —
Channel Mix & Delivery Platforms"), `dt-sos` → `speed_of_service_guide`, `checklist-fill` →
`digital_checklists_guide`.

**Only 3 panels remain uncovered in this tier: `about`, `kb`, `workflow`.** All three are
meta/self-referential (the About panel, the Knowledge Base panel itself, and the
workflow/changelog view) — the same classification batch 10's log already gave them. Below the
threshold for a real batch (no new article written, no PR opened this round) — writing a KB
article *about* the KB panel, or about the changelog viewer, isn't the kind of SOP content this
backlog exists to produce.

**Verdict: the `nav`/`optional` phase of task #75 is functionally done.** Two real next
increments exist, neither started yet:
1. **Sweep `kind:'hub-tab'`/`kind:'internal'`** (18 + 14 entries) — unmeasured. Some are likely
   already covered under a parent panel's article (e.g. Planning Hub's own sub-tabs under
   `planning_hub`); others may be genuinely new ground. A fresh batch should measure this tier
   specifically before assuming either way.
2. **The `InfoIcon` rollout** — flagged as unstarted in every batch's log since the first
   (2026-11-03). Wiring the now-111 real KB articles into more panel headers is UI work, not new
   content, and may be the higher-value next increment over chasing an ever-thinner article tail
   in the `hub-tab`/`internal` tiers.

Neither started without the owner's go-ahead — this section is the stopping point, not a
decision to proceed either direction.

## 2026-11-06 — batch 12: the `hub-tab`/`internal` sweep (first pass)

Measured directly: `grep -n "kind:'hub-tab'"`/`"kind:'internal'"` for real `{ id: ... }` entries
(not comment-line mentions, which inflate the count) gives **18 real `hub-tab` entries and 14
real `internal` entries — 32 total**, matching the "18 + 14" estimate batch 11 flagged as
unmeasured.

**28 of the 32 were already covered**, under a different key name, by an existing article —
mostly because a hub panel's own article already names every one of its tabs explicitly:

- `scheduling_hub`'s tab list already names `labor-allocation`, `labor-analysis` (also has its
  own dedicated `labor_analysis_guide`), `labor-analytics`, `sched-summary`, `scheduling`,
  `sched-retention`, `sched-retention-rollup`, and `skills-matrix` verbatim.
- `planning_hub`'s tab list already names `monthly-proj` (Monthly), `pace-target` (Pace),
  `yearly-proj` (Yearly), and `unified-targets` (Targets) verbatim. `smart-targets` has its own
  `smart_targets` article (`Access: Planning → Smart Targets tab`); the internal `targets` id is
  a legacy `showTargets` alias into the exact same `MonthlyTargetManager` component Planning's
  own Monthly tab uses — same content, not a gap. `smart-targets-v2` (hub-tab) was checked
  against `App.js`: it sets `planningTab('smart')` and routes to `planning` — it is the SAME
  Smart tab `smart_targets`/`planning_hub` already document under a newer id, not a second
  feature.
- `eom_dashboard_guide` already names its five folded-in tabs including `eom-summary`
  (Supervisor Rollup) and `count-cycle` (its own `count_cycle_guide` too).
- `food_cost_panel` explicitly documents `fob-eom` as its "📋 End of Month" mode tab, redirect
  included.
- `task_queue_guide` explicitly documents the Feature Request type `feature-requests` now
  redirects into.
- `delivery_3po` explicitly documents `channel-intel`'s content as its Overview tab.
- `crew_schedule_guide` explicitly documents `time-punches`'s content as its Punches tab.
- `leaderboards_guide` explicitly documents `record-day` (Record Days mode) and `top-bottom`
  (Top/Bottom mode).
- `events_guide` explicitly documents `event-impact`'s content as the Impact pill.
- `store_kb_guide`, `lifelenz_bridge`, and `targets_editor` (the *existing* key — see below)
  directly match `store-kb`, `lifelenz-bridge`, and (misleadingly, see below) a Planning Hub
  tab, not the registry's `targets-editor`.

**4 were genuinely uncovered under any name — written up this batch:**

1. **`review_target_overrides_guide`** (registry id `targets-editor`, Performance Reviews →
   Customize → Targets). This is the real finding of the batch: the *existing* KB key named
   `targets_editor` does **not** describe this panel at all — it describes "Planning → Monthly
   tab / Planning → Yearly tab → Target Categories," i.e. the same content `planning_hub`
   already covers under `monthly-proj`/`yearly-proj`. The registry's actual `targets-editor` id
   (company/state/patch/store override cascade for review fields with no workbook source,
   `src/views/targets-editor.js`'s `TargetsEditorSection`) had **zero** article anywhere, under
   any key, despite the near-identical name making it look covered at a glance. Confirmed via
   `App.js`: `modal==='targets-editor'` routes into `perf-reviews` → Customize → Targets, a
   completely different component from `MonthlyTargetManager`. New article's title
   ("Targets Editor — Panel Guide") is deliberately the plainer, more findable one since it's
   the registry id's real content; the existing `targets_editor` key keeps its own
   "Monthly & Yearly Targets — Panel Guide" title unchanged.
2. **`performance_calculator_guide`** (registry id `perf-calc`, Performance Reviews → Customize
   → Calculator). Read `performance-calculator.js` directly to confirm its own header's claim
   that it shares nothing with `review-engine.js`'s scoring functions — true, it's an unrelated
   drive-thru throughput slider (OEPE → cars/hr → GC → sales → labor hours → TPPH, via a fixed
   formula, capacity-limited vs. demand-limited conversion rate from the store's own KB tags).
3. **`calendar_manager_guide`** (registry id `calendar-manager`, Events → 📆 Calendar / 🔁 Rules
   pills). `events_guide` already existed but never actually described this content — its own
   "Five pills" sentence had silently substituted the "✎ Full ledger" button (not a pill) for
   the real Calendar pill, so Calendar Manager's month grid / recurring rules / AI-search
   pending-review queue (`src/features/calendar.js`'s `CalendarManagerPanel`, 3 internal tabs:
   grid/rules/pending) was undocumented. Fixed in the same commit — `events_guide`'s pill list
   now names the real 5 (Upcoming/Calendar/Log/Impact/Rules) plus the Full Ledger button
   separately.
4. **`fcst_accuracy_guide`** (registry id `fcst-accuracy`, Forecast Reports → 🎯 Forecast
   Accuracy tab). The engine-concept articles (`mape`, `model_types`, `model_health_scoring`,
   `adaptive_ensemble`) describe what MAPE/model-types mean conceptually, but none of them
   describe the actual UI workflow for running a live backtest (period picker, per-store
   sortable 6-model MAPE table including a "Sched Proj" scheduling-system comparison column,
   DOW/weekly breakdown expanders) — confirmed by reading `ForecastAccuracyPanel` in
   `analytics.js` directly. This was a real gap, not a naming mismatch like #1.

**Flagged, not acted on this batch — two real, named follow-ons:**

- **`signals_guide` is substantially stale**, discovered incidentally while checking whether
  `corr-explorer`'s Correlations tab was covered. It is — `signals.js`'s real tab bar is 10 tabs
  (Live Ops / Projection Accuracy / Park × OEPE / Store Controls / Built-in / Signal Lab /
  Scanner / Correlations / CSAT Drivers / Graveyard), but the article's own "Several tabs" list
  names only 5, and 2 of those 5 (`Baseline Anomalies`, `Speed of Service`) aren't top-level tabs
  in the real tab bar at all (likely sub-content under `Built-in`, not independently verified
  this batch). Correcting this properly means reading 5+ unfamiliar tab components
  (`ProjectionAccuracyTab`, `ParkOepeTab`, `StoreControlsTab`, `CsatDriversTab`, `GraveyardTab`)
  for accuracy — out of proportion to this batch's actual job (confirming `corr-explorer`'s
  coverage, which checked out). Left as a precisely-measured, real follow-on rather than a
  rushed partial patch.
- **`proj-brief`** (registry id, internal, renders `PreForecastBrief` — a standalone pre-
  forecast-run brief inside ⚗ Test Kitchen → Projections) has a genuinely distinct, real
  content, but its host panel (`proj`, `kind:'test-kitchen'`) itself carries zero KB coverage.
  Documenting the sub-panel in isolation from an undocumented parent would be a context-free
  article — this belongs to the `kind:'test-kitchen'` tier sweep (separate from both the
  `nav`/`optional` tier batch 11 closed out and this batch's `hub-tab`/`internal` tier), not
  this batch.

**Measured running total: 114 `KB_ARTICLES` keys.** 8 new tests (2 per new article):
`dispatch-kb-panel-guide-batch12-2026-11-06.test.js`.

**Verdict: the `hub-tab`/`internal` tier is now also functionally done** (28/32 pre-existing
coverage + 4 new articles = 32/32). The two real next increments for task #75 are now:
1. **Sweep `kind:'test-kitchen'`** — unmeasured, and now known to hold at least one genuinely
   uncovered sub-panel (`proj-brief`) plus its host (`proj`).
2. **The `InfoIcon` rollout** — still flagged as unstarted since the very first batch
   (2026-11-03); wiring the now-114 articles into more panel headers is UI work, not new
   content.

Neither started without the owner's go-ahead — per this task's own standing stop-and-wait rule
after each batch.

## 2026-11-06 — content correction: `signals_guide` was stale, now fixed

Follow-on to batch 12's own flag above. Confirmed by reading `src/views/signals.js`'s
`SignalsPanel` tab bar directly (not trusting either the old article or batch 12's own
unverified count): the real tab bar is exactly **10 tabs** — Live Ops (⚡), Projection Accuracy
(📐), Park × OEPE (🅿️), Store Controls (🎛️), Built-in, Signal Lab, Scanner (🔎), Correlations
(🔗), CSAT Drivers (😊), Graveyard (⚰) — confirming batch 12's "10 tabs" count exactly.

The old article's own "Several tabs" list named only 5 (LiveOps, Baseline Anomalies, Speed of
Service, Signal Lab, Scanner), and **2 of those 5 were not real top-level tabs at all**, not
just undercounted:
- **Baseline Anomalies** is a strip rendered *inside* the Live Ops tab (`LiveOpsTab`, the
  `anomalies` block), never its own tab.
- **Speed of Service** is not part of Signals at all — it's `src/views/dt-speedofservice.js`, a
  completely separate panel with its own existing article (`speed_of_service_guide`, batch 4).
  The old `signals_guide` text had conflated the two panels' names.

Rewrote `signals_guide`'s `detail` to describe all 10 real tabs from their own source files —
read `LiveOpsTab`, `ProjectionAccuracyTab`, `ParkOepeTab`, `StoreControlsTab`, the Built-in/
Signal Lab tab bodies inside `SignalsPanel`, `ScannerTab`, `CorrelationsTab`, and
`CsatDriversTab` directly, not just the tab-bar button labels — and explicitly states that
Baseline Anomalies lives inside Live Ops and that Speed of Service is a separate panel, so the
same mix-up can't recur. `KB_ARTICLES` key count unchanged (114) — this is a content fix to an
existing key, not a new article. 2 new tests
(`dispatch-kb-signals-guide-correction-2026-11-06.test.js`).

## InfoIcon rollout — Phase 1 (2026-11-06)

Not a new coverage batch — this is the OTHER flagged gap every batch above has carried forward
without starting: `KB_ARTICLES` entries exist but nothing in most panels' own UI surfaces them.
**Measured before building anything:** `InfoIcon({articleKey, inline})` (`src/engine/forecast.js`)
already existed, fully self-contained (its own inline modal — no dependency on
`KnowledgeBasePanel` or any deep-link mechanism needed), and was already wired into 4 places
(`store-dash.js`'s Leaderboards → `leaderboards_guide`, `management.js` → `model_health`,
`analytics.js` → `mape`). So this pass is wiring-only, not a new component — the thing flagged as
unstarted since the very first batch was never "build the icon," only "use it more."

**Phase 1 slice (mechanical, bounded):** 5 real `RoutePanelShell`-backed panels whose title
already has a matching `KB_ARTICLES` key — picked for being clean, single-location
`RoutePanelShell`/header calls. Not every panel is: `signals.js` and `sage.js`, for instance, use
neither `RoutePanelShell` nor a single clean header line, so they're deferred rather than forced
into this pass.

- **Needs Attention** (`analytics.js`'s `AttentionPanel`) → `attention_guide`
- **Food Cost / End of Month** (`analytics.js`'s `FOBAnalysisPanel`, one component, two modes) →
  `food_cost_panel` (default mode) / `eom_dashboard_guide` (`mode==='eom'`) — the icon's
  `articleKey` switches with the mode, same as the title already does.
- **Data Manager** (`analytics.js`'s `DataManagerPanel`) → `data_manager_guide` — this one has a
  hand-rolled header (not `RoutePanelShell`; a pre-existing, already-documented panel-contract
  gap, not touched here), so the icon was added next to its own title `div` instead.
- **Events** (`events-panel.js`'s `EventsPanel`) → `events_guide`
- **Inventory Intelligence** (`inventory.js`'s `InventoryIntelligence`) → `inventory_guide` —
  both of its two `RoutePanelShell` returns (the empty-state early-return AND the main panel
  body) got the icon, so it shows regardless of which branch renders.

6 new tests (one per wiring) in `dispatch-kb-infoicon-rollout-phase1-2026-11-06.test.js`, each
mounting the REAL panel component (not a stand-in) and clicking the real "?" control — per this
repo's "would this verification still pass if reverted" rule, removing the `InfoIcon` prop would
make the control vanish and these fail, unlike a test that only imported `InfoIcon` in isolation.

**Explicitly deferred, not forgotten — Phase 2 candidates:**
- The other ~109 panels with a real `KB_ARTICLES` key and no icon yet. 93 files in `src/` use
  `RoutePanelShell` at all (not all of those have a matching KB key), so this is a genuinely
  multi-pass rollout, not a single next PR.
- Panels like Signals/SAGE that don't use the clean `RoutePanelShell`-single-title pattern need
  their own per-file judgment call on where to place the icon, not the mechanical copy-paste this
  slice used.
- `window._openKB(articleKey)` (`App.js`) still ignores its `articleKey` argument (a separate,
  already-documented gap from the very first KB batch) — not needed for `InfoIcon` itself (it
  opens its own inline modal, no dependency on the standalone KB panel), but still open for a
  future "jump to this article in the full KB browser" flow.
