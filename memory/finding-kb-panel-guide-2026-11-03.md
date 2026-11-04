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
