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

## 2026-11-07 — fixed the dangling `launch_planner_guide` reference (flagged by Phase 3)

Phase 3's own log above flagged `launch-planner.js`'s `InfoIcon({articleKey:
'launch_planner_guide'})` as wired to a key that didn't exist in `KB_ARTICLES` — a missing-content
problem, not a missing-wiring one, left for whoever owned that content decision. By this point in
the session the orchestrator had just driven three real PRs through `launch-planner.js`/`new-store-
ramp.js` (the 12-month view + reconciliation, the day-of-week shape from the predecessor store, the
hourly/15-min breakdown) and so had direct, current knowledge of the panel's real mechanics — wrote
the article directly rather than deferring it to a future batch or a fresh research pass. Documents
the real `projectNewStoreSales`/`blendRampShapes` comparable-blending mechanism, the deliberate
separation between this engine's `dowShapeFor` and `forecast.js`'s own leak-free `_dowShape` (same
distinction PR #1714's own body already drew), the manual-override-never-touched-by-regenerate
mechanic, the corrected `($ ÷ avg check) ÷ TPPH` Suggested Hours formula, and the overnight-
comparability guard shared by both the Hourly and 15-min breakdowns. Removed the test-file stub
that had been rendering `InfoIcon` as a no-op specifically because the article didn't exist yet
(`dispatch-launch-planner-2026-11-06.test.js`'s `vi.mock('../engine/forecast.js', ...)` block, added
when PR #1706 first shipped the panel) and added a real test clicking the "?" icon and asserting the
article's real title appears — the same bar every other InfoIcon-phase test in this backlog uses.
`KB_ARTICLES` key count: 115 (was 114, flagged-but-missing since Phase 3).

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

## InfoIcon rollout — Phase 2 (2026-11-06)

Continued the mechanical wiring Phase 1 started. **13 more panels**, each a real
`RoutePanelShell`-backed panel with a single, clean header location and an already-existing
matching `KB_ARTICLES` key — confirmed by reading each file directly (grepping for
`RoutePanelShell` and its `title`/`subtitle` block) before touching it, same bar Phase 1 used:

- **Visit Readiness** (`visit-readiness.js`) → `visit_readiness_guide`
- **Graded Visits** (`graded-visits.js`) → `graded_visits_guide`
- **Customer Complaints** (`customer-complaints.js`) → `customer_complaints_guide`
- **Crew Schedule** (`crew-schedule-panel.js`) → `crew_schedule_guide`
- **Task Queue** (`task-queue.js`) → `task_queue_guide`
- **Pricing Engine** (`pricing-engine.js`) → `pricing_engine_guide`
- **Speed of Service** (`dt-speedofservice.js`) → `speed_of_service_guide`
- **Weekly Count Status** (`weekly-count-status-report.js`) → `weekly_count_status_guide`
- **Digital Checklists** (`checklist-fill.js`) → `digital_checklists_guide`
- **Promo / Discount ROI** (`promo-roi.js`) → `promo_roi_guide`
- **Trend Explorer** (`trends.js`) → `trend_explorer_guide`
- **Above-Store One-Pager** (`above-store-onepager.js`) → `above_store_guide` — only in the
  default/`'rollup'` view; the panel's own `'leadership'` view (Leadership One-Pager) has no
  matching article, so the icon is conditionally omitted there rather than mislabeling it.
- **Local News** (`news-panel.js`) → `news_guide`

**Checked, deliberately NOT wired this phase** (same per-file judgment call Phase 1 made for
Signals/SAGE): `labor-analysis.js` and `forms-library.js` both have a matching KB key
(`labor_analysis_guide`, `forms_library_guide`) but neither uses `RoutePanelShell` — `forms-
library.js` is the already-documented `panel-contract.md` gap (hand-rolled backdrop); `security-
panel.js` likewise has no `RoutePanelShell` call. Left for a future phase alongside Signals/SAGE,
not forced into this one's mechanical copy-paste.

13 new tests (one per wiring, mounting the real panel component and clicking the real "?"
control): `dispatch-kb-infoicon-rollout-phase2-2026-11-06.test.js`.

**Running total: 18 of ~114 real `KB_ARTICLES` panel-level keys now have a wired `InfoIcon`**
(5 from Phase 1 + 13 here; `mape`/`leaderboards_guide`/`model_health` were wired before either
phase started and aren't counted against the panel-level total). **Still open:** ~96 panels with
a real KB key and no icon yet, plus the Signals/SAGE/`labor-analysis`/`forms-library`/`security-
panel` tier that needs its own per-file judgment call rather than the mechanical copy-paste this
phase and Phase 1 both used.

## InfoIcon rollout — Phase 3 (2026-11-07)

Re-measured the real gap directly (grepped every `InfoIcon.*articleKey` call site in `src/views/`,
`src/features/`, and `App.js`, then cross-checked each against `KB_ARTICLES` and against every
`RoutePanelShell` call across `src/views/*.js`/`src/features/*.js`) rather than trusting Phase 2's
own "18 of ~114" count at face value, per the standing "measure it, don't reason about it" rule.
Wired **9 more panels**, each a real `RoutePanelShell`-backed panel with a single, clean header
location and an already-existing matching `KB_ARTICLES` key:

- **Market Intelligence** (`location-intel.js`'s `LocationIntelligence`, the standalone/
  non-`embedded` call shape only) → `loc_intel_guide` — the article's own title is "Market
  Intelligence" even though the file/component names and the registry's nav label both say
  "Location Intelligence"/"Market Intelligence" interchangeably; this is a pre-existing,
  already-flagged label mismatch (not something this phase fixes), not a wiring error.
- **Delivery & Channel Mix** (`delivery-mix.js`'s `DeliveryMixPanel`) → `delivery_3po`
- **Equipment Results** (`equipment-results.js`'s `EquipmentResultsPanel`) → `equipment_results_guide`
- **Reports Hub** (`reports-hub.js`'s `ReportsHub`) → `reports_hub_guide`
- **My Reports** (`report-subscriptions.js`'s `ReportSubscriptions`) → `reports_hub_guide`
  (cross-referenced, not a new article — `reports_hub_guide`'s own content already documents the
  "⭐ My Reports" tab as part of Reports Hub, same pattern `above_store_guide` and others already
  use elsewhere in this backlog for a sub-view of an already-documented panel).
- **SMG VOICE** (`smg-voice.js`'s `SMGVoicePanel`) → `guest_voice_smg` — wired into BOTH of its
  `RoutePanelShell` returns (the no-data empty-state early return and the main render), so the
  icon shows regardless of which branch renders, same treatment Phase 1's Inventory Intelligence
  wiring got.
- **Org Summary / Operator Summary** (`labor-tools.js`'s `OperatorSummaryPanel`) →
  `operator_summary_guide` — also wired into both of its two `RoutePanelShell` returns
  (no-data early return + main render) for the same reason.
- **Performance Reviews** (`performance-reviews.js`'s `PerformanceReviewsPanel`) →
  `performance_reviews_guide` — wired onto the panel's own top-level subtitle only.
  `performance_calculator_guide` and `review_target_overrides_guide` are explicitly NOT wired
  here: both belong to `CustomizePanel`'s own internal Targets/Calculator sub-tabs, which this
  single top header can't unambiguously represent — same reasoning that keeps Signals/SAGE
  deferred, applied to a sub-view of an otherwise-wireable panel rather than the whole panel.
- **Store One-Pager Generator** (`analytics.js`'s `StoreOnePager`) → `store_one_pager_guide`

**Real bugfix found and corrected while re-measuring** (not a new wiring — Phase 1 had already
wired this key, just to the wrong target): `analytics.js`'s `FOBAnalysisPanel` wired its `'eom'`
mode's subtitle to `eom_dashboard_guide`, apparently on the strength of the string "eom" matching
in both places. Reading `eom_dashboard_guide`'s actual `KB_ARTICLES` content
(`src/engine/forecast.js`) shows it describes a completely different, separate panel — Inventory
Control (`eom-dashboard.js`'s `EOMDashboardPanel`, registry id `eom-dashboard`) — not
`FOBAnalysisPanel`'s "End of Month" mode (which is really `FOBEOMPanel`/`fob-eom.js`'s old
content, merged in as a mode under dispatch #188; see `App.js`'s own comment on that merge).
`food_cost_panel`'s own content already explicitly documents the End-of-Month mode as a tab
within Food Cost itself, confirming it — not `eom_dashboard_guide` — was always the right key for
both of `FOBAnalysisPanel`'s modes. Fixed both halves: `FOBAnalysisPanel` now wires
`food_cost_panel` unconditionally (no more mode-dependent ternary), and `eom_dashboard_guide`
(previously wired nowhere correctly) is now wired onto the real `EOMDashboardPanel` it actually
describes. The now-corrected behavior is covered by an updated test in
`dispatch-kb-infoicon-rollout-phase1-2026-11-06.test.js` (its "End of Month mode" test now asserts
`food_cost_panel` renders and `eom_dashboard_guide`'s title does NOT appear), plus a new dedicated
test for `EOMDashboardPanel` itself in this phase's own test file.

**Found, flagged, NOT fixed this phase** (out of scope — a missing-content problem, not a
missing-wiring problem): `launch-planner.js:196` wires `InfoIcon({articleKey:
'launch_planner_guide'})`, but `launch_planner_guide` does not exist anywhere in `KB_ARTICLES`
(confirmed via grep — zero matches). `InfoIcon`'s own `if(!article) return null;` guard means
this fails completely silently (the "?" icon simply never renders) rather than crashing, so it
was never caught. This is a dangling reference from an earlier PR (#1706, not part of either
Phase 1/2/3), not a panel this rollout needs to wire — it already attempted wiring, just to a key
that was never written. Needs either a new `launch_planner_guide` KB article or removal of the
dead reference; left for whoever owns that content decision.

**Checked, deliberately NOT wired this phase** (same per-file judgment call Phase 1/2 made for
Signals/SAGE): `AIBacktestScanner` (`analytics.js`) is embedded directly into `App.js` at its call
site, not wrapped in its own `RoutePanelShell` — no clean single-header location to attach an
icon to without a larger refactor. `ProductMixPanel` and `DARDaypartPanel` (`labor-tools.js`) have
their own matching KB keys (`product_mix_dashboard_guide`, `dar_daypart_guide`) but no own
`RoutePanelShell` call in that file — they render as tabs/sub-content inside another wrapper, so
wiring them needs tracing their real render path first, not assumed this phase. `labor-
analysis.js`, `forms-library.js`, `security-panel.js`, `signals.js`, `sage.js` remain deferred for
the same reasons Phase 2 already documented (re-confirmed, not re-derived) — none use a clean
single-header `RoutePanelShell` pattern.

9 new tests (one per wiring, mounting the real panel component and clicking the real "?"
control), plus the `eom_dashboard_guide`/`food_cost_panel` bugfix assertion described above:
`dispatch-kb-infoicon-rollout-phase3-2026-11-06.test.js`.

**Running total: 29 of ~114 real `KB_ARTICLES` keys are now wired to a real panel** (measured
directly via grep against the current codebase, not derived from Phase 2's self-reported count —
18 before this phase + 8 newly-wired keys here: `loc_intel_guide`, `delivery_3po`,
`equipment_results_guide`, `reports_hub_guide`, `guest_voice_smg`, `operator_summary_guide`,
`performance_reviews_guide`, `store_one_pager_guide`; `eom_dashboard_guide` was already counted
from Phase 1 and is now correctly rather than incorrectly wired, so it doesn't add to the count).
Plus 1 dangling, non-functional reference (`launch_planner_guide`) flagged above, not counted
either way. **Still open:** roughly ~85 panels with a real KB key and no icon yet, plus the
Signals/SAGE/`labor-analysis`/`forms-library`/`security-panel`/`AIBacktestScanner`/
`ProductMixPanel`/`DARDaypartPanel`/`CustomizePanel`-sub-tabs tier that needs its own per-file
judgment call rather than the mechanical copy-paste this phase and Phase 1/2 all used. Candidate
pool for a clean mechanical next phase is visibly thinning — worth re-checking at the START of a
Phase 4 whether enough single-header, unwired-but-keyed panels remain to justify another
mechanical batch, versus moving on to the judgment-call tier directly.

## 2026-11-07 — judgment-call tier, batch 1 (5 wirings: Labor Analysis, Forms Library, DAR
Daypart, Product Mix, Signals)

Picked up the judgment-call tier directly (Phase 3's candidate pool was already thin) rather than
another mechanical sweep. Re-grepped every key this doc's Phase 3 section listed as deferred
(`labor_analysis_guide`, `forms_library_guide`, `dar_daypart_guide`, `product_mix_dashboard_guide`,
`signals_guide`) against every `src/views/*.js` file and confirmed all five were genuinely
dangling — a real `KB_ARTICLES` entry existing but zero `h(InfoIcon,...)` call anywhere in the
codebase referencing it. Same silent-failure shape as `launch_planner_guide` (fixed v5.675): no
crash, no test failure, the "?" control simply never existed.

- **`labor-analysis.js`** (`LaborAnalysisPanel`) — title div at its header (`'Labor Analysis'`
  plus the week-navigator `‹ Week of … ›` controls, all one flex row) now also carries
  `h(InfoIcon,{articleKey:'labor_analysis_guide'})` right after the title text, before the nav
  buttons.
- **`forms-library.js`** — same Data-Manager-style hand-rolled header (`'🗂 Forms Library'` title
  div, no `RoutePanelShell`) now wraps the title + icon in a flex row, matching the established
  workaround pattern exactly.
- **`labor-tools.js`**'s `DARDaypartPanel` and `ProductMixPanel` — both already had their own
  matching KB keys (confirmed in Phase 3 above) but, on actually tracing their render path this
  pass, both turned out to have perfectly ordinary single-title header divs (`'DAR Daypart
  Analytics'`, `'Product Mix Dashboard'`) — Phase 3's "no own `RoutePanelShell` call… needs
  tracing their real render path first" caveat held, but tracing it found an easy mechanical wire,
  not a structural blocker. Wired both the same way.
- **`signals.js`**'s `SignalsPanel` — despite being the single biggest judgment-call deferral
  (multiple tabs: Live Ops/Projection Accuracy/Park×OEPE/Store Controls/Built-in/Signal
  Lab/Scanner), the panel-level header itself (the `'Signals'` title + "Intelligence" eyebrow +
  one-line description, rendered once above the tab bar, not per-tab) is a single clean block.
  Wired `signals_guide` there — it documents the panel as a whole, not any one tab, so a
  panel-level icon is the right altitude regardless of which tab is active.

**Also wired the same pass (v5.678, found moments after opening the PR for the first five):**
`sage.js`'s `SagePanel` — also deferred by Phase 3 for lacking a `RoutePanelShell`, but like
Signals it turned out to have one clean single-block header (eyebrow "AI Assistant" + 'SAGE'
title + subtitle) above all its tabs/chat UI. Wired `sage_guide` there.

**Still deferred, unchanged from Phase 3's list:** `AIBacktestScanner` (embedded in `App.js`, no
own header), `CustomizePanel`-sub-tabs (`performance_calculator_guide`/
`review_target_overrides_guide`) — not inspected further this pass: real remaining judgment-call
work, not re-confirmed here.

**Running total: 35 of ~116 real `KB_ARTICLES` keys now wired** (29 after Phase 3, +5 in the
first commit, +1 here; `launch_planner_guide` from v5.675 already counted separately and not
re-counted). No new tests added for this batch — each wiring is a one-line sibling add next to
an existing title string, the exact same shape Phase 1's Data Manager fix and the
`launch_planner_guide` fix both already have test coverage patterns for; verified by local build
(clean, within payload budget) and the full suite (773/773 files, 7083+/7083+ tests) rather than
new assertions, consistent with how trivial a dangling-reference wire-up is to verify by
inspection plus a passing suite.

## 2026-11-07 — `security-panel.js` written AND wired (v5.679), correcting Phase 3's own claim

Phase 3 (above) and this doc's batch-1 section both described `security-panel.js` as needing a
**new** KB article written from scratch, AND as lacking a clean `RoutePanelShell` the way
Signals/SAGE turned out to have. Re-reading `App.js`'s actual routing (not assumed from the
earlier claim) found the second half was simply wrong: `routePanel==='security'` already wraps
`SecurityPanel` in `RoutePanelShell` at the App.js route gate (`title:'🔒 Security'`) — the exact
same "shell lives at the gate, not inside the component" pattern several other panels
(dicompare/forecast-reports/proj/report/fcst-ref) already use. Wiring the new article in was a
one-line `subtitle:h(InfoIcon,{articleKey:'security_panel_guide'})` add to that existing call,
not a structural fix.

Wrote `security_panel_guide` from the panel's real mechanics (read `src/views/security-panel.js`
in full relevant sections, not guessed): the subject-grouped-not-rule-grouped design rationale,
the four real verdict states (`flagged`/`clear`/`undetermined`/`hygiene` — `verdictState()`), the
RBAC gate (`securityPanelAccess()`, matching `security_findings`' own RLS tier exactly), name
masking + logged reveals, the three-tab domain split (Cash/Inventory/Labor), and the
cross-store-prevalence drill-down step that distinguishes a subject-specific lead from an
estate-wide pattern.

**Running total: 36 of ~117 real `KB_ARTICLES` keys now wired.** Same verification shape as
every other wiring in this doc — local build (clean, within payload budget) + full suite
(773/773 files, 7083+/7083+ tests), no new test since this is a pure content+wiring addition
with no logic change.

## 2026-11-07 — closing out the original judgment-call-tier list (v5.680)

Re-grepped the two remaining names from the ORIGINAL judgment-call-tier list (Phase 2's own
framing): `AIBacktestScanner` and `CustomizePanel`-sub-tabs. Both turned out to have real,
already-written `KB_ARTICLES` entries (`anomaly_scan_guide`, `performance_calculator_guide`,
`review_target_overrides_guide`) that were simply never wired — the same dangling-reference
shape as every other fix in this file, not new content needed.

- **`AIBacktestScanner`** — Phase 3's own note said this was "embedded directly into `App.js` at
  its call site, not wrapped in its own `RoutePanelShell`." Re-checked directly: it IS wrapped,
  just in a `ModalShell` (`title:'🔍 Historical Sales Anomaly Scan'`), not a `RoutePanelShell` —
  a different shell component, but the same `subtitle` slot exists on both. Wired
  `anomaly_scan_guide` there.
- **`performance-calculator.js`**'s `PerformanceCalculatorSection` (the Customize → Calculator
  sub-tab) has its own hand-rolled header div (🧮 icon + title + description), exactly the Data
  Manager workaround pattern. Wired `performance_calculator_guide` there.
- **`targets-editor.js`**'s `TargetsEditorSection` (the Customize → Targets sub-tab) has NO title
  div at all — just a description line directly in a bordered info box. Added the icon as a
  sibling inside that same box rather than inventing a title it never had.

**This closes the original judgment-call-tier list from Phase 2/3** (Signals, SAGE,
`labor-analysis`, `forms-library`, `security-panel`, `AIBacktestScanner`,
`ProductMixPanel`/`DARDaypartPanel`, `CustomizePanel`-sub-tabs) — every one of those eight items
is now wired. **Running total: 39 of ~117 real `KB_ARTICLES` keys wired.** Verified the same way
as every prior batch — local build (clean, within payload budget) + full suite, no new tests
(pure wiring, no logic change).

## 2026-11-07 — Notes 73 #1 ("info icon on panels") measured: this task is the answer, not a new ask

The owner's Notes 73 field queue (`memory/notes-73-queue.md` #1) asked for "adding info icon with
easy access click for help on panels," flagged there as a possible re-hit of this exact task.
Measured directly to confirm: `KB_ARTICLES` (`src/engine/forecast.js`) carries **116** real keys
(a plain-object parse of the whole block, not the old "~117" estimate); `grep`ing every
`articleKey:` call site across `src/app/`/`src/views/`/`src/features/` finds **41** wired (two
more than the "39" the 2026-11-07 batch above counted, from v5.681's Movers Alerts work touching
nothing here — the drift is just this count being re-measured, not new wiring). **75 keys remain
unwired** — this is a real, substantial remainder, not a stale task about to be closed. Confirmed
task #108 is this task (#75), not a separate ask.

Spot-checked four names that READ like duplicates of already-wired keys, to rule out a second
false-positive the way `AIBacktestScanner`/`CustomizePanel` turned out to be real gaps rather than
duplicates above — all four are genuinely distinct, separate panels, not a wiring target already
covered under a different key name:
- `targets_editor` ("Monthly & Yearly Targets — Panel Guide", Planning → Monthly/Yearly tabs) vs.
  the already-wired `review_target_overrides_guide` ("Targets Editor — Panel Guide", Performance
  Reviews → Customize → Targets tab) — same-sounding name, two unrelated features; the KB article
  for `review_target_overrides_guide` says so explicitly ("Do NOT confuse this with the Monthly &
  Yearly Targets grids"). **`targets_editor`'s own real on-screen home was not conclusively
  located this pass** — panel-registry.js's Planning hub-tabs (`monthly-proj`/`pace-target`/
  `smart-targets-v2`/`unified-targets`/`yearly-proj`) don't obviously match "Monthly tab / Yearly
  tab → Target Categories" by id name alone, and `UnifiedTargetsPanel` (store-dash.js, id
  `unified-targets`) turned out on inspection to be a tolerance-status rollup (Service/Labor/Food
  & Paper/POS/Sales vs. target), not an editable grid — the wrong candidate. Left unwired rather
  than guessed at; next pass should grep `saveMonthlyTargets`/`saveYearlyTargets` (named directly
  in the KB article's own detail text) to find the real component before wiring this one.
- `security_guide` (new finding-batch wording, "An investigation surface over `security_findings`
  …") vs. the already-wired `security_panel_guide` — both describe the Security panel, but are
  two separately-written, non-identical entries under different keys. Left as-is (did not merge
  or re-wire) — outside this pass's scope, flagged for whoever next touches this panel's KB
  content to decide whether one should redirect to the other or genuinely cover a sub-view the
  other doesn't.
- `morning_brief_guide` ("Daily Brief — Morning Intelligence Brief") vs. `brief_guide` ("Forecast
  Brief — Panel Guide") — confirmed genuinely different panels (`morning-brief` vs. `brief`
  registry ids), not a naming collision. Neither wired yet.

**Net finding: no duplicate-collapse opportunity found, and the 75-item remainder is real.**
Continuing the wiring itself stays task #75's open-ended scope — picking off a few more per pass,
same pattern as every batch in this file, verifying the real mount point before wiring each one
rather than assuming from the key name (exactly the discipline that caught `targets_editor` not
being `unified-targets` above).

## 2026-11-08 — ReportShell batch: one shared-component fix wires 12 panels at once

Re-measured directly before picking this batch (same grep the 2026-11-07 entry above used):
117 `KB_ARTICLES` keys, 43 wired, **74 unwired** (one fewer than the "75" the prior entry
recorded — re-measuring found no specific key that flipped; treat small re-measurement deltas in
this count as noise from grep/regex edge cases, not a tracked fix).

Grepped every real consumer of `ReportShell` (`grep -rl "h(ReportShell" src/views/*.js`) and
found **12 real "Reports Hub deep-dive" panels** — Cash Variance Pattern, Channel Mix,
Controls ↔ Food Cost Linkage, Conversion Efficiency Ratio, Custom Report Builder, FOB Reference
Table, Item Velocity, Labor Opportunity Cost, Loss Prevention Summary, Oil Efficiency, Price
Change Impact, Weather Impact — every single one of which already had a real, title-matching
`KB_ARTICLES` entry (confirmed by pulling each key's real `title:` field via regex, not assumed
from the key name) and **zero** of which could ever show an `InfoIcon`, for one shared reason:
`src/components/ReportShell.js` itself had no `articleKey` prop, so no per-file wiring could have
worked regardless of what the calling panel passed. (`access-log.js` was a false positive from
the initial grep — it only *mentions* `ReportShell` in a comment explaining why it deliberately
does NOT use it; confirmed real before counting it out.)

Fixed the shared component once instead of 12 separate call-site patches: `ReportShell` now takes
an optional `articleKey` prop and, when given, renders `InfoIcon` next to its existing subtitle
text (same visual convention — icon beside the descriptive line — every other `RoutePanelShell`
wiring in this backlog already uses). Wired all 12 real call sites with their already-verified
matching key. Each `panel-registry.js` label was also checked against the component's own
`title:` string passed to `ReportShell` (all 12 matched exactly — e.g. `custom-reports`/"Custom
Report Builder", `loss-prevention`/"Loss Prevention Summary") before wiring, catching no drift
this time.

12 new tests, one per panel, mounting the REAL panel component and clicking the real "?" control
(`dispatch-kb-reportshell-infoicon-2026-11-08.test.js`) — the same "would this still pass if
reverted" bar every phase in this file holds itself to: removing either the new `ReportShell`
prop or any one call site's `articleKey` makes that panel's control vanish and its test fail.

**Running total: 55 of 117 real `KB_ARTICLES` keys now wired.** Still open: ~62 unwired keys.
Flagged in passing, not acted on (outside this pass's pure-wiring scope, per task #75's own
standing rule to leave stale-content calls for whoever next touches that panel's copy):
- `security_guide` remains a genuine duplicate of the already-wired `security_panel_guide` — two
  separately-written articles for the same panel, under different keys. Still undecided which
  should win or whether one should redirect to the other.
- `targets_editor`'s real on-screen home was still not conclusively located this pass either —
  same open item the 2026-11-07 entry left (grep `saveMonthlyTargets`/`saveYearlyTargets` next
  time rather than guessing from `panel-registry.js` id names).
- `priority_brief` and `proj`/`proj-brief` remain real, legitimate candidates for a future pass
  (the first is already-good content per batch 9's own find; `proj`/`proj-brief` is Test-Kitchen-
  tier and was explicitly deferred by the batch-12 entry above).

## 2026-11-08 — batch 13: both carry-over items resolved, 15 more panels wired

Re-measured the real gap before starting (grepped `articleKey:\s*'...'` across `src/app/App.js`,
`src/views/*.js`, `src/features/*.js`, cross-checked against a direct walk of the `KB_ARTICLES`
object literal in `src/engine/forecast.js`): **117 real keys, 55 wired, 62 unwired** — matching
this prompt's own "roughly 55/62" expectation almost exactly (off by nothing once main had moved).

**Carry-over item 1 — `security_guide` duplicate: already resolved, not by this pass.** Grepping
`KB_ARTICLES` found zero `security_guide` key at all, and
`dispatch-kb-proj-workflow-staleness-2026-11-08.test.js` already carries a regression test
("only one 'Security — Panel Guide' article exists"). `git log` traces this to PR #1744 (commit
`79dc85af`, already merged to `main` before this session started), which this prompt's own
carry-over list predates. Nothing to do here — re-confirmed, not re-fixed.

**Carry-over item 2 — `targets_editor`'s real mount point: located and wired.** Grepped
`saveMonthlyTargets`/`saveYearlyTargets`'s real call sites (per the prior batch's own
instruction, rather than guessing from a `panel-registry.js` id) and found both: `saveMonthlyTargets`
is called from `MonthlyProjectionsPanel` (`src/views/analytics.js`, Planning → Monthly tab);
`saveYearlyTargets` is called from `YearlyProjectionsPanel`'s `TargetCategoriesView`
(`src/views/yearly-projections.js`, Planning → Yearly tab → 🎯 Target Categories view). Re-read
the existing `targets_editor` article content against both real components before wiring — it
already correctly describes both grids' real editing mechanic (click a cell, commit the WHOLE
row via `saveMonthlyTargets`/`saveYearlyTargets`, never a partial write) and the real "no lock
mechanic here, see Locked Projections" distinction, so no content fix was needed, only the
wiring. `MonthlyProjectionsPanel`'s header gets the icon unconditionally (it is the panel's only
mode). `YearlyProjectionsPanel`'s header gets it ONLY when `view==='targets'` — its default
`'sales'` (Sales Pace) view is a different rollup with no editable grid, so showing this article's
icon there would be wrong; the ternary matches the same mode-dependent-articleKey pattern
`FOBAnalysisPanel`'s Food Cost/EOM modes already use.

**Main batch — 15 more keys wired**, each matched to its real mount point by reading the
article's own content against the real component, not guessed from the key name:

- **`proj`** (Projections — Panel Guide) → `App.js`'s `routePanel==='proj'` `RoutePanelShell`
  gate. `locked_projections` (a narrower, already-existing sub-topic this article explicitly
  cross-references) stays unwired by design — one icon per panel, and `proj` is the panel-level
  article.
- **`workflow`** (Workflow Guide) → `WorkflowGuidePanel` (`App.js`), on the `ModalShell`'s own
  subtitle, conditionally combined with the existing "tailored to your role" text.
- **`pvsa`** (Proj vs Actuals) → `App.js`'s `showPVSA` `ModalShell`.
- **`di_calibration_panel`** (DI Calibration — Panel & Workflow) → `App.js`'s `showDialedIn`
  `ModalShell` (wraps the real `DialedInPanel`). Confirmed this is the right key over the
  metric-level `dialed_in`/`dialed_in_calibration` articles by reading all three — those two
  describe the grid-search math itself and stay cross-referenced, not wired to a panel (same
  treatment `mape`/`model_types` already get elsewhere in this backlog).
- **`date_range_report_guide`** (Date-Range Report) → `App.js`'s `routePanel==='report'`
  `RoutePanelShell` gate (wraps `DateRangeReport`).
- **`planning_hub`** / **`scheduling_hub`** → `PlanningHubPanel`/`SchedulingHubPanel` (`App.js`,
  "shell lives inside the component" pattern) — both `RoutePanelShell` calls had no `subtitle` at
  all before this, so the icon is the subtitle's entire content now. `PlanningHubPanel` was not
  previously exported from `App.js`; exported it (same treatment `SchedulingHubPanel` already
  got, per its own code comment, specifically so a render test could mount it).
- **`panel_manager_guide`** → `PanelManagerPanel` (`App.js`), hand-rolled header (no
  `RoutePanelShell`, same workaround pattern Data Manager/Forms Library/Labor Analysis already
  use elsewhere in this backlog).
- **`home_at_a_glance`** → `AtAGlance` (`at-a-glance.js`)'s own "At a Glance" title div — only
  when the header is NOT in its scrolled-compact state, since the compact header drops most of
  its own text too.
- **`store_dashboard_overview`** → `StoreDash` (`store-analytics.js`)'s store-name header,
  conditionally shown only when `tab==='overview'` (the header itself is shared across all of
  the dashboard's dozen-plus tabs).
- **`shift_analysis_tab`** → `ShiftAnalysisTab` (`store-analytics.js`, independently exported)'s
  own "⏱ Shift Analysis" title div.
- **`why_engine_guide`** → `WhyEnginePanel` (`analytics.js`), wired into both its no-data
  empty-state title AND its main header (same "both branches" treatment Inventory
  Intelligence/SMG VOICE got in earlier phases).
- **`gm_letters`** → `GMCoachingBrief` (`src/engine/coaching.js`), wired into both its no-data
  `ModalShell` and its main `ModalShell`'s subtitle.
- **`smart_targets`** → `SmartTargetsPanel` (`src/views/smart-targets.js`)'s own "Smart Targets"
  title div — a real gap despite `smart_targets` being one of the original 5 panel-level App
  Guide entries from the very first KB batch; it had simply never been wired into this
  component's own header until now.

**Verification split, by design, matching an existing precedent:** `proj`/`pvsa`/
`di_calibration_panel`/`date_range_report_guide` all use the "shell lives at the `App.js` routing
gate, not inside the mounted sub-component" pattern — the exact same pattern `security_panel_guide`
was wired into (2026-11-07 entry above), which that entry explicitly notes was verified by "local
build + full suite, no new test" rather than a dedicated render test, since meaningfully mounting
the wiring means mounting `App.js`'s own routing JSX, not the sub-component it renders. These four
get the same treatment here, for the same reason. The other 11 keys each wire an `InfoIcon`
directly inside an exported, independently-mountable component and get a real
mount-the-real-panel-click-the-real-"?"-assert-the-real-title test, in
`dispatch-kb-panel-guide-batch13-2026-11-08.test.js` (13 tests — some keys, like
`why_engine_guide` and `targets_editor`, get more than one test for their multiple real
branches/modes).

No stale `panel_index`/Workflow-Guide wording was found for any of the 15 panels touched this
pass (not re-checked exhaustively against every one, but nothing surfaced while reading each
component for its real mount point).

**Measured running total: 70 of 117 `KB_ARTICLES` keys now wired** (55 before this batch + 15
here). Full suite: 792/792 files, 7264/7264 tests passing. Build clean, eager payload
418.78 KB gzip entry / 682.16 KB gzip eager total (budget 850 KB, 167.84 KB headroom) — unchanged
in shape from before this batch, since every wiring here is a one-line `InfoIcon` sibling add, no
new chunk. **Still open:** ~47 unwired keys, including the still-deferred `calendar_manager_guide`
(real content exists for `CalendarManagerPanel`, `src/features/calendar.js`, but it renders
inside the already-icon-wired `EventsPanel` with no distinct sub-header of its own to attach a
second, more specific icon to — left unwired rather than forced, same judgment call this backlog
has made elsewhere for a sub-view with no clean header), `priority_brief`, `proj-brief`/`proj`
(Test-Kitchen-tier internal id, distinct from the now-wired `proj` nav panel), and the
metric/engine-concept articles this backlog has consistently left cross-referenced rather than
wired to any one panel (`mape`-style keys: `adaptive_di`, `adaptive_ensemble`, `cash_os`,
`condiment_pct`, `confidence_interval`, `daypart_engine`, `dialed_in`, `dialed_in_calibration`,
`drawer_open`, `event_registry`, `ewma_model`, `forecast_formula`, `gc_crosscheck`, `labor_pct`,
`mape_drift`, `model_health_scoring`, `model_types`, `new_store_ramp`, `oepe`, `plus_up`, `r2p`,
`roles_and_permissions`, `t_red`, `tpph`, `weather_adjustment`). The remaining real panel-level
candidates (`revenue_intelligence`, `intelligence_brief`, `competitive_impact_guide`,
`store_kb_guide`, `file_import_guide`, `lifelenz_bridge`, `store_compare_guide`,
`district_lens_guide`, `email_digests_guide`, `fcst_accuracy_guide`, `forms_print_guide`,
`metric_lineage_guide`, `pay_rate_history_guide`, `count_cycle_guide`, `brief_guide`,
`panel_index`) are candidates for the next batch — not yet re-checked against their real mount
points this pass.

## Batch 14 (2026-11-10)

Re-verified all 16 candidates named above by grepping `articleKey:\s*'<key>'` across `src/` —
0 matches for every one, confirming the gap was still real (not just this doc's own narrative
being stale, which this backlog has been bitten by before). Wired 3, each matched to its real
mount point by reading the component, not guessed from the key or title:

- **`store_kb_guide`** → `StoreKBEditor` (`src/views/labor-tools.js`)'s own hand-rolled header.
  Its real on-screen title is **"Restaurant Profiles"**, not "Store KB" — a display-name
  divergence from the registry label/KB title, noted and left alone (same class of mismatch as
  earlier batches' precedent, nothing here is actually wrong).
- **`revenue_intelligence`** → `RevenueIntelligence` (`src/views/store-analytics.js`)'s
  `ModalShell`.
- **`lifelenz_bridge`** → `LifeLenzBridgePanel` (`src/features/lifelenz.js`)'s real-content
  `ModalShell` (the `ds.loaded` branch — its separate "waiting on data" empty-state `ModalShell`
  was left alone, same as `why_engine_guide`/`gm_letters`'s precedent of only wiring the branch
  that actually has content to attach to, or both branches when both do).

**A real pitfall, caught before any of this shipped, not after:** `ModalShell` (`src/components/
ModalShell.js`) forwards its `title` prop straight into `ScreenshotShareButton`'s
`slugify(title)` and the native Web Share API's `title`, both of which expect a plain string — a
React node (an `InfoIcon`) placed in `title` degrades the screenshot filename and risks a runtime
error at the share-sheet boundary. `subtitle` is never forwarded to `ScreenshotShareButton`,
making it the only safe mount point for a node. Both `revenue_intelligence` and `lifelenz_bridge`
wire their `InfoIcon` through `subtitle`, with an inline comment in both files so this isn't
reintroduced by a future batch reaching for the more obvious `title` prop.

**`file_import_guide` investigated and deliberately left unwired** — same judgment call this
backlog has made before for a conceptual, cross-cutting "App Guide" article (it describes every
upload file type/naming/load order across the whole app, not one panel's behavior). There is no
single legitimate mount point: the actual "Load Files" control is a bare `<input type="file">`
click handler, no header of its own. Reachable via the Knowledge Base panel's own browse/search
index, same channel as `locked_projections`/`smart_targets`'s App-Guide siblings.

Each of the 3 real wirings gets a render-level test in `dispatch-kb-panel-guide-batch14-
2026-11-10.test.js` (3 tests) — mounts the real exported component, clicks the real "?" `InfoIcon`
control, asserts the real KB article title renders. Fixed 4 pre-existing test files whose full
(non-`importOriginal`) `vi.mock('../engine/forecast.js', …)` blocks broke when `lifelenz.js`
picked up a new `InfoIcon` import: `dispatch-105-lifelenz-bridge-daterange.test.js`,
`dispatch-106-forecast-reports.test.js`, `dispatch-117-lifelenz-accuracy-plausibility.test.js`,
`lifelenz-accuracy-winner-badge.test.js` — each now stubs `InfoIcon: () => null` alongside their
existing `forecastDay`/`getModelAssignment` stubs, since none of those tests are testing the KB
wiring itself.

**Measured running total: 73 of 117 `KB_ARTICLES` keys now wired** (70 before this batch + 3
here). Full suite: 828/828 files, 7698/7698 tests passing. Build clean, eager payload entry
425.37 KB gzip / 694.37 KB gzip eager total (budget 850 KB, 155.63 KB headroom). **Still open:**
~44 unwired keys — the 13 remaining named candidates from the previous batch's list
(`intelligence_brief`, `competitive_impact_guide`, `store_compare_guide`, `district_lens_guide`,
`email_digests_guide`, `fcst_accuracy_guide`, `forms_print_guide`, `metric_lineage_guide`,
`pay_rate_history_guide`, `count_cycle_guide`, `brief_guide`, `panel_index`), plus the same
metric/engine-concept keys this backlog has consistently left cross-referenced rather than wired
to any one panel, listed in full in the previous batch's entry above.

## Batch 15 (2026-11-11)

Re-measured all 12 real-candidate keys from batch 14's list (`articleKey:\s*'<key>'` grep across
`src/`) — all still 0 matches. Wired 3, each a standalone `ModalShell`-based panel with its own
dedicated file, no sub-component ambiguity to resolve:

- **`metric_lineage_guide`** → `MetricLineagePanel` (`src/views/metric-lineage.js`).
- **`pay_rate_history_guide`** → `PayRateHistoryPanel` (`src/views/pay-rate-history.js`).
- **`email_digests_guide`** → `EmailDigestSubscriptionsPanel` (`src/views/email-digest-
  subscriptions-panel.js`).

All three already had a plain-string `subtitle` (not `title`) — converted each to a `<span>`
node carrying the original string plus the `InfoIcon`, same subtitle-only placement the previous
batch established and explained (never `title`, since `ModalShell` forwards `title` into
`ScreenshotShareButton`'s `slugify(title)`/native-share `title`, both string-only).

`PayRateHistoryPanel` and `EmailDigestSubscriptionsPanel` both call real `src/lib/supabase.js`
loaders on mount (`loadLifeLenzShiftPay`/`loadLifeLenzShiftAssignments`/`logAppAccess`/
`loadMyEmailDigestSubscriptions`) — read each loader before relying on it rather than assuming:
all four are guarded `if (!supabase) return [...]` / `return new Set()`, and this sandbox has no
`VITE_SUPABASE_URL` configured, so the render-level test needs no mock.

`panel_index` (the 13th remaining named candidate from batch 14) re-confirmed as the one genuine
App-Guide exception in this group — a live map of every panel in the app, correctly with no
single panel header of its own — left unwired, same judgment as `file_import_guide`/
`locked_projections`.

Each of the 3 wirings gets a render-level test in `dispatch-kb-panel-guide-batch15-
2026-11-11.test.js` (3 tests) — mounts the real exported component, clicks the real "?"
`InfoIcon` control, asserts the real KB article title renders.

**Measured running total: 76 of 117 `KB_ARTICLES` keys now wired** (73 before this batch + 3
here). Full suite: 829/829 files, 7701/7701 tests passing. Build clean, eager payload entry
425.37 KB gzip / 694.37 KB gzip eager total (budget 850 KB, 155.63 KB headroom) — unchanged in
shape, since every wiring here is a one-line `InfoIcon` sibling add, no new chunk. **Still open:**
~41 unwired keys — the 9 remaining named candidates (`intelligence_brief`,
`competitive_impact_guide`, `store_compare_guide`, `district_lens_guide`, `fcst_accuracy_guide`,
`forms_print_guide`, `count_cycle_guide`, `brief_guide`, plus `panel_index` left deliberately
unwired as above), plus the same metric/engine-concept keys this backlog has consistently left
cross-referenced rather than wired to any one panel (listed in full in the batch-13 entry above).

## Batch 16 (2026-11-11)

Re-measured the 8 real-candidate keys from batch 15's list — all still 0 matches. Wired 3:

- **`store_compare_guide`** → `MultiStoreComparison` (`src/views/store-analytics.js`)'s
  `ModalShell` (on-screen title reads "📊 Multi-Store Comparison", not "Store Compare" — same
  class of display-name divergence earlier batches have noted and left alone, nothing to fix).
- **`forms_print_guide`** → `FormsPrintPanel` (`src/views/forms-print.js`)'s `ModalShell`.
  Confirmed by reading the component that its `fetch('/forms/index.json')` on mount is caught on
  both success and failure paths and falls back to an empty index either way — the title/subtitle
  render unconditionally, so no mock was needed for the render-level test.
- **`district_lens_guide`** → `DistrictLensPanel` (`src/views/analytics.js`)'s hand-rolled modal
  header — this one builds its own fixed overlay/header `div` rather than using `ModalShell`, so
  the `title`/`subtitle` string-forwarding hazard from the other two wirings here doesn't apply;
  the `InfoIcon` is appended directly to the title `div`, same pattern as `shift_analysis_tab`/
  `why_engine_guide` from earlier batches.

**5 named candidates NOT resolved this pass, left for a future batch rather than wired on a
guess:** `intelligence_brief`, `competitive_impact_guide`, `fcst_accuracy_guide`,
`count_cycle_guide`, `brief_guide`. `count_cycle_guide` specifically: its real content
(`CountCycleSection`, `src/views/count-cycle-panel.js`) is a "no fetch, no chrome of its own"
section the caller (`eom-dashboard.js`) owns the loading/header for, rendered as one tab inside a
hub shell with no dedicated per-tab header text of its own to anchor an icon to (`SummaryTiles`
and the tab-bar label are shared/generic, not this tab's own). The other 4 need more reading of
their host components before wiring confidently — not attempted blind.

Each of the 3 wirings gets a render-level test in `dispatch-kb-panel-guide-batch16-
2026-11-11.test.js` (3 tests).

**Measured running total: 79 of 117 `KB_ARTICLES` keys now wired** (76 before this batch + 3
here). Full suite: 830/830 files, 7704/7704 tests passing. Build clean, eager payload entry
425.40 KB gzip / 694.40 KB gzip eager total (budget 850 KB, 155.60 KB headroom). **Still open:**
~38 unwired keys — the 5 remaining named candidates above, plus `panel_index` (deliberately
unwired), plus the same metric/engine-concept keys this backlog has consistently left
cross-referenced rather than wired to any one panel (listed in full in the batch-13 entry above).

## Batch 17 (2026-11-11)

Resolves 3 of the 5 candidates batch 16 deferred (re-measured — all 3 still 0 matches before
this batch):

- **`brief_guide`** → `App.js`'s `routePanel==='brief'` `RoutePanelShell` — the real "🔭 Forecast
  Brief" sidebar panel, on-screen title "🧠 Intelligence Brief — &lt;scope&gt;". Confirmed by
  reading `RoutePanelShell`'s own export in `ModalShell.js` that it carries the SAME `title`→
  `ScreenshotShareButton` forwarding hazard as `ModalShell` — not assumed from the `ModalShell`
  precedent alone — so the `InfoIcon` goes in `subtitle`, same pattern as every other wiring so far.
- **`intelligence_brief`** → `Brief` (`src/views/store-dash.js`, re-exported through
  `store-analytics.js` as the Store Dashboard's "Intelligence Brief" tab), its own `'brief-hdr'`
  div. The KB article's own text covers BOTH this per-store findings list AND the `brief_guide`
  panel above under one "Intelligence Brief" umbrella — the two keys are deliberately separate
  articles for two related but distinct real surfaces, not a duplicate; each now points at its
  own real one.
- **`competitive_impact_guide`** → `ShiftAnalysisTab` (`src/views/store-analytics.js`)'s "🏪
  Competitive Intelligence" sub-section header, wired into BOTH its empty-state branch (no
  competition events tagged) and its real-data branch, same "both branches" treatment
  `why_engine_guide`/`gm_letters` got in earlier batches. This section (both branches) is gated
  on `hasSalesData` (derived from `metricSeries('sales')` over the trailing 6 weeks) — the
  render test feeds one `ds.laborRows` row 3 days back to satisfy that gate, discovered by
  reading the component rather than guessed; with two `InfoIcon`s on the same mounted page
  (this section's plus `ShiftAnalysisTab`'s own `shift_analysis_tab` icon at its top), the test's
  `clickInfoIcon` helper disambiguates by nearest-matching-ancestor text rather than
  first-match, since `InfoIcon` wraps its own "?" span in an extra div (one more hop up than a
  naive `parentElement` check would reach).

`brief_guide` is verified by build + full suite only, no dedicated render test — same precedent
as `proj`/`pvsa`/`di_calibration_panel`/`date_range_report_guide`/`security_panel_guide` in
earlier batches: its wiring lives at the `App.js` routing gate, and meaningfully mounting it
means mounting `App.js`'s own routing JSX, not a standalone sub-component. The other 2 wirings
get real render-level tests in `dispatch-kb-panel-guide-batch17-2026-11-11.test.js` (2 tests).

**2 named candidates NOT resolved this pass:** `fcst_accuracy_guide` (needs the
`ForecastReportsPanel`/`ForecastAccuracyPanel` hub read in the same depth `lifelenz_bridge` got
in batch 14), `count_cycle_guide` (its real content has no dedicated per-tab header to anchor to
inside its tabbed hub — confirmed in batch 16's entry, unchanged).

**Measured running total: 82 of 117 `KB_ARTICLES` keys now wired** (79 before this batch + 3
here). Full suite: 831/831 files, 7706/7706 tests passing. Build clean, eager payload entry
425.41 KB gzip / 694.41 KB gzip eager total (budget 850 KB, 155.59 KB headroom). **Still open:**
~35 unwired keys — `fcst_accuracy_guide`, `count_cycle_guide`, `panel_index` (deliberately
unwired), plus the same metric/engine-concept keys this backlog has consistently left
cross-referenced rather than wired to any one panel (listed in full in the batch-13 entry above).

## Batch 18 (2026-11-11)

Resolves the last real candidate from batch 17's deferred pair:

- **`fcst_accuracy_guide`** → `ForecastAccuracyPanel` (`src/views/analytics.js`), hosted by
  `ForecastReportsPanel` (`src/features/forecast-reports.js`)'s "🎯 Forecast Accuracy" tab — the
  other tab of the same hub `lifelenz_bridge` was wired into back in batch 14.
  `ForecastAccuracyPanel` builds its own hand-rolled title bar (not `ModalShell`/
  `RoutePanelShell`), so the `title`/`subtitle` string-forwarding hazard doesn't apply here — the
  `InfoIcon` is appended directly to the "🎯 Forecast Accuracy Report" title div, same pattern as
  `district_lens_guide` (batch 16).

One render-level test in `dispatch-kb-panel-guide-batch18-2026-11-11.test.js` — mounts
`ForecastAccuracyPanel` directly (it's independently exported from `analytics.js`, confirmed via
its own export list, so no need to go through the `ForecastReportsPanel` shell), clicks the real
"?" `InfoIcon`, asserts the real KB article title renders. Deliberately does NOT mock
`forecast.js` (unlike the existing `dispatch-106-forecast-reports.test.js`, which mocks it
including `InfoIcon: () => null` since it's testing backtest behavior, not KB wiring) — this test
needs the real `InfoIcon` to render.

`count_cycle_guide` remains genuinely unresolved — still no dedicated per-tab header inside its
tabbed hub to anchor an icon to, confirmed again across batches 16-18. Of the original 16
candidates named in batch 14's opening list, `count_cycle_guide` and `panel_index` (the latter
deliberately left as an App-Guide exception) are now the only two still open.

**Measured running total: 83 of 117 `KB_ARTICLES` keys now wired** (82 before this batch + 1
here). Full suite: 832/832 files, 7707/7707 tests passing. Build clean, eager payload entry
425.39 KB gzip / 694.39 KB gzip eager total (budget 850 KB, 155.61 KB headroom). **Still open:**
~34 unwired keys — `count_cycle_guide`, `panel_index` (deliberately unwired), plus the same
metric/engine-concept keys this backlog has consistently left cross-referenced rather than wired
to any one panel (listed in full in the batch-13 entry above).

## Batch 19 (2026-11-12)

Re-measured every unwired `KB_ARTICLES` key fresh (grepped `articleKey:\s*'<key>'` across `src/`,
excluding tests, against all 121 top-level keys) rather than trust batches 14-18's "117 keys"
figure, which was itself already stale (the key count has grown since from unrelated content
work). 35 keys came back unwired. Most are the already-documented, deliberately-left-
cross-referenced metric/engine-concept keys (`oepe`, `tpph`, `labor_pct`, `forecast_formula`,
`model_types`, `adaptive_ensemble`, etc. — 26 of the 35) plus the two standing App-Guide
exceptions (`panel_index`, `file_import_guide`, `locked_projections`). **Four genuine candidates
surfaced that no prior wiring batch's named-candidate list had ever included** — real
panel-level articles written in an early CONTENT batch (long before the InfoIcon-wiring phase
began at batch 14), simply never picked up by a later wiring pass because those passes worked
off `memory/plan-role-based-panel-gating-2026-11-03.md`'s named lists, not a fresh full sweep:

- **`settings_guide`** → `Settings` (`src/views/management.js`)'s own `ModalShell`
  (`title:'⚙ Settings'`, previously no `subtitle` at all — added one).
- **`troubleshooting_guide`** → `TroubleshootingPanel` (`src/views/troubleshooting.js`)'s own
  `ModalShell` — converted its existing plain-string `subtitle` to a `<span>` node carrying the
  original text plus the `InfoIcon`, same string-forwarding-hazard precedent batch 15 established
  (`ModalShell` forwards `title`, never `subtitle`, into `ScreenshotShareButton`'s
  `slugify(title)`/native-share `title`).
- **`calendar_manager_guide`** → `CalendarManagerPanel` (`src/features/calendar.js`)'s own
  hand-rolled header div ("📅 Calendar Manager" + subtitle text, not `ModalShell`) — the
  `InfoIcon` is appended directly to the title div, same pattern as `district_lens_guide`/
  `fcst_accuracy_guide`.
- **`quick_capture_guide`** → the `ModalShell` wrapping `QuickCapturePanel` in `App.js`
  (`title:'‼ Log Something'`) — `QuickCapturePanel` itself (`src/views/quick-capture.js`) has no
  header of its own, same "wiring lives at the App.js routing gate" situation `brief_guide`/
  `proj`/`pvsa` hit in earlier batches, so this one is build+full-suite verified only, no
  dedicated render test.

**`count_cycle_guide` re-confirmed still genuinely unresolved** — re-read `CountCycleSection`
(`src/views/eom-dashboard.js`); still a body-only component inside a tabbed hub with no dedicated
per-tab header of its own to anchor an icon to, unchanged across batches 16-18. Not re-attempted.

3 render-level tests in `dispatch-kb-panel-guide-batch19-2026-11-12.test.js` (mounting the real
`Settings`/`TroubleshootingPanel`/`CalendarManagerPanel` components, clicking the real "?"
`InfoIcon`, asserting the real article title renders) — `quick_capture_guide` has no dedicated
test per the precedent above. Build clean, eager payload entry 427.58 KB gzip / 697.56 KB gzip
eager total (budget 850 KB, 152.44 KB headroom).

**Measured running total: 86 of 121 `KB_ARTICLES` keys now wired** (83 before this batch + 3
directly wired here, +1 more via the App.js routing gate not counted toward the "wired" grep
total since `articleKey:'quick_capture_guide'` does appear in `src/` once this lands — so the
real count is 87/121 once that's included). **Still open:** `count_cycle_guide` and `panel_index`
(deliberately unwired), plus the same ~26 metric/engine-concept keys this backlog has
consistently left cross-referenced rather than wired to any one panel.

## Batch 20 (2026-11-13)

Re-measured the gap via a background fork before picking this batch (same methodology as every
prior batch — diff literal `articleKey:'...'` usages against the real `KB_ARTICLES` keys). The
fork's static grep had a real blind spot worth recording: `event_registry`/`forecast_formula`/
`new_store_ramp`/`weather_adjustment` read as "unwired" by a literal-string grep but are actually
wired *dynamically* as of this same session's v5.754 (`src/engine/why.js`'s `CauseLinks`
component passes `articleKey:cause.kbKey`, a variable, not a literal) — not a real gap, just a
grep limitation. Worth remembering for any future batch's own re-measurement.

Wired 2, both with an unambiguous single mount point and no overlap with an already-wired, more
specific article:
- **`roles_and_permissions`** → `AdminPanel`'s Roles & Permissions tab (`RolesTab`,
  `src/views/admin.js`) — the article (shipped under task #78) existed but had never been wired
  to any `InfoIcon` anywhere; added next to the tab's own explanatory text row.
- **`locked_projections`** → At A Glance's weekly-projections table's "Lock" column header
  (`src/views/at-a-glance.js`) — the actual UI the article explains, not just a page that
  mentions locking.

Left several fork-flagged candidates deliberately unwired this batch, each for a real reason, not
oversight:
- **`cash_os` / `drawer_open`**: the fork suggested `security-panel.js`, but that panel is a
  rule/finding-card architecture with no simple per-metric tile to anchor an icon to (confirmed
  by reading it — "Cash O/S" and "Drawer Open" appear only inside rule descriptions and finding
  text, never as a labeled tile header). Needs a real design decision on where in that
  architecture a definition icon would even go, not a mechanical wiring.
- **`condiment_pct`**: no single obvious FOB-breakdown tile found with its own header to anchor
  to in the time available — same "needs a closer look" as `cash_os`.
- **`dialed_in` vs. `dialed_in_calibration`**: two KB articles that may cover overlapping ground
  (Dialed-In calibration) — wiring one or both without first deciding whether they should be
  merged risks shipping a confusing double-icon or the wrong one. Left for a dedicated pass.
- **`file_import_guide` vs. `data_manager_guide`**: same redundancy concern — `data_manager_guide`
  is already wired on the Data Manager panel; `file_import_guide`'s actual scope relative to it
  wasn't confirmed this pass.
- **`priority_brief`**: Priority Brief is referenced in several files (`at-a-glance.js`,
  `tutorial.js`, `App.js`, `panel-registry.js`) but which one actually renders its title row
  wasn't conclusively located this pass.
- **`count_cycle_guide` re-confirmed still genuinely unresolved** — same `CountCycleSection`
  (`src/views/eom-dashboard.js`) situation as batches 16-19: a body-only component inside a
  tabbed hub with no dedicated per-tab header to anchor an icon to.

1 render-level test (`dispatch-kb-batch20-2026-11-13.test.js`, mounting the real `AdminPanel`,
clicking to its real Roles & Permissions tab, clicking the real "?" `InfoIcon`, asserting the
real article title renders). `locked_projections` has no dedicated render test — `AtAGlance` is
too large/dependency-heavy to mount cleanly in isolation, same "wiring lives somewhere too deep
to mount standalone" precedent `quick_capture_guide`/`brief_guide`/`proj`/`pvsa` already
established in earlier batches — verified by local build + full suite instead. Build clean,
eager payload 700.6x KB gzip eager total (budget 850 KB).

**Measured running total: 89 of 121 `KB_ARTICLES` keys now wired** (87 before this batch + 2
here). **Still open:** `count_cycle_guide` and `panel_index` (deliberately unwired), `cash_os`/
`drawer_open`/`condiment_pct`/`dialed_in`/`dialed_in_calibration`/`file_import_guide`/
`priority_brief`/`data_collection_bounds` (flagged this batch, need more than mechanical wiring),
plus the same ~15 Forecast Engine internals this backlog has consistently left cross-referenced
rather than wired to any one panel.
