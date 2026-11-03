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
- A full audit of `panel_index`'s own one-line descriptions against current panel-registry.js
  labels (the same kind of staleness check this session already ran on `WORKFLOW_GUIDE_SECTIONS`/
  `tutorial.js`) was NOT done -- worth a follow-up pass given how much staleness turned up
  elsewhere in the onboarding copy today.

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
