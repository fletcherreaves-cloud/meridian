---
name: project-reports-redesign
description: Owner request 2026-10-15 — redesign "Reports" into a real Reports hub (categorized,
  run-with-criteria, printable/shareable) plus a Custom Report Builder on top of the existing
  metric registries. External research + full inventory of what Meridian already has. Proposal
  stage — no code yet; see the open decisions at the bottom before building.
metadata:
  type: project
---

# Reports redesign — research + proposal (2026-10-15)

## The ask, verbatim

Owner: *"anytime I'm mentioning that I'd like a report... what I'm envisioning is as if I'm
working in the app and I want to go quickly find a report on certain metrics... categorized
within reports... click on the report and be able to pull up based off date range selection or
criteria... printable, shareable... We can create several base reports that are high-end valuable
input, data extracts... ready to go. But this is where I'd also like the reporting system to
become customizable even more so... to select the various metrics we have available and where
they appropriately line up with one another... side-by-side to be able to build a custom report
and save it out within the reporting system... under its own subtitled section of customized
reporting."*

Two distinct asks: (1) a real **Reports hub** — one place, categorized, every report run the same
way (criteria → print/share) — and (2) a **Custom Report Builder** — pick metrics, lay them
side-by-side, save, under its own "Custom Reports" area inside that same hub.

## External research — patterns that transfer

- **QuickBooks Report Center** — categorized sidebar hub holding BOTH standard and saved custom
  reports together; pick a category → preview thumbnails of its common reports → "Customize" on
  an open report starts from a close-fit template, not a blank canvas. Design guidance from a
  QuickBooks-adjacent source: start from the business question, not the field list; document a
  custom report's purpose/audience.
- **Restaurant365 "My Reports"** — closest direct analog (restaurant-vertical BI). Reports live
  under category tabs; a star icon favorites any report into a "Favorites" tab; users only see
  reports their **report role** grants — i.e. the same RBAC-gates-the-catalog idea Meridian
  already uses everywhere else. Separately, **Custom Financial Reporting** lets each user build
  their own report "tailored to their role."
- **Salesforce Lightning Report Builder** — the builder-UX reference for the "side-by-side" ask.
  Three panes: Fields (the catalog) → Outline (drag fields into Columns / Group Rows / Group
  Columns) → live Preview. Report Type is chosen first and fixes which fields are even offered.
  Grouping a field turns a flat table into a subtotaled summary; grouping on two axes makes a
  matrix.
- **Looker Studio / Tableau** — snap-to-grid canvas, drag a viz onto the page, bind it to fields.
  Good for free-form dashboards; heavier than what a tabular "metrics side-by-side over a date
  range" report needs — Salesforce's three-pane model is the better fit for this ask.
- **Ctuit RADAR (the restaurant-BI vendor behind QSRSoft's own lineage)** — ships an "Enterprise
  Report Designer" add-on: clients build reports against their own polled data/metrics and publish
  them back so other users on the account can run them. Structurally the same shape as "build a
  custom report, save it, let your team run it."

Common thread across all of them: **one categorized hub**, **standard reports ship pre-built**,
**a custom builder reuses the exact same metric catalog + the exact same run/print chrome** as the
standard reports — a custom report is not a second-class citizen living in a different UI.

## Where Meridian actually stands today (full inventory)

### "Reports" is a curated subset, not everything report-shaped

`panel-registry.js`'s `section:'reports'` only holds: Above-Store One-Pager, GM Letters, My
Reports, Store One-Pager, Org Summary, Leaderboards, Weekly Count Status. Meanwhile **Date-Range
Report** lives in `section:'daily'`, **Trend Report** in `section:'analytics'`, **Forecast
Reports** in `section:'forecasting'`, **Pay Rate History** in `section:'people'`. A report-shaped
panel today lands wherever its *subject* sits, not under "Reports" — exactly the scatter the owner
is describing ("usable but not what I'm envisioning").

### "My Reports" is the closest existing precedent, and it's narrower than it looks

`src/views/report-subscriptions.js` (panel id `my-reports`) is a saved-launch picker over a
**hardcoded 5-report catalog** (`above-store`, `calendar`, `visit-readiness`, `smg-voice`,
`weekly-count-status`). It already has a `LocationSelector` + a period picker (mtd/last7/
lastmonth/custom) for reports that declare `periods:true`, and persists each user's saved
scope+period+panel-subset choices to Supabase (`report_subscriptions` table, `subs jsonb`, RLS by
`auth.uid()`). It does NOT let anyone pick arbitrary metrics — it's "launch report X pre-scoped,"
not "build a report." This is real scaffolding (the save/launch/RLS pattern), just scoped too
narrow to be the customization layer the owner wants.

### Every existing "report" hand-rolls its own criteria + export — there's no shared report shell

- `DateRangeReport` (`src/views/analytics.js:6260`) — real date-range `<input type=date>` pair +
  store multi-select + CSV-via-Blob export + `window.print()`. The most "report-like" panel in the
  app today, structurally.
- `AboveStoreOnePager`, `OnePagerPanel`, `WeeklyCountStatusPanel`, `TrendReportPanel` — each has
  its own `LocationSelector` + period picker and exports via the shared `printHtml()` helper
  (`src/utils/print-html.js` — in-page iframe + `window.print()`, avoids iOS `window.open` bugs).
- `RoutePanelShell` (`src/components/ModalShell.js`) gives every route panel a **📸 Share** button
  for free (`capturePanelScreenshot` → `html2canvas` → `shareFileOrSave`'s native-share → clipboard
  → PNG-download fallback chain) — but that's screenshot/share chrome, not a criteria bar. There is
  **no shared "date-range + location + Run → print/CSV/share" shell** — each panel reimplements
  the criteria controls and the export action from scratch.
- CSV export is copy-pasted (hand-built Blob + `<a download>`) in ~20 files. XLSX *export* (not
  parsing) exists in exactly one place (`sage.js`, `XLSX.utils.book_new()`/`writeFile`) — not a
  reusable pattern yet. There is no real PDF generator (`jspdf`/`pdfmake` equivalent) — every
  "PDF" today is browser print-to-PDF via `window.print()`/`printHtml()`.

### Two metric catalogs already exist and should be reconciled, not re-invented

- **`src/engine/metric-source.js`** — `METRIC_SOURCES`, ~92 keys, each a fallback chain of
  `[sourceTable, field]` pairs (+ `derive` for computed ratios). This is the **resolution engine**
  (`metricDaily`/`metricSeries`/`metricAvg`/`metricSumRatio`) — it knows how to fetch a value, not
  how to label or group it for a human.
- **`src/engine/signal-registry.js`** — `METRIC_CATEGORIES`, ~114 entries, each carrying `label`,
  `unit`, `better` (higher/lower), category grouping, `source`/`field` — this is the
  **human-facing catalog** the Signals Scanner already uses, but it's not 1:1 with
  `metric-source.js`'s keys.
- `memory/notes-62-queue.md` (2026-08-08) already names this exact gap: *"Give SAGE the metric
  resolver as a generic tool and it can answer anything the app can compute... this is also the
  strongest argument for the Resolver — a generic 'query any metric' tool... would serve SAGE and
  the report builder from one place."* That note predates this request by two months and
  independently arrived at the same architecture. The reconciliation work is overdue regardless of
  reports — this just makes it load-bearing.

### No custom-report persistence exists at all (confirmed negative)

Grepped `src/` and `supabase/*.sql` for `saved_reports`/`custom_report`/`report_definition`/
`savedViews` — nothing. `report_subscriptions` (above) is the only saved-config table, and it only
stores a pointer into the hardcoded 5-report catalog, never a free metric selection.

## Proposed architecture

**A. A real Reports hub.** Keep `section:'reports'` as the sidebar entry point, but make it an
actual categorized landing page (QuickBooks Report Center shape): category tabs/groups — e.g.
Daily Ops, Labor & Scheduling, Food Cost & Inventory, Guest Voice & Visits, Payroll, Financial,
then **Custom Reports** as its own labeled subsection at the end, exactly as the owner asked.
Existing report-shaped panels (Date-Range Report, Trend Report, Forecast Reports, Pay Rate
History, Promo ROI, etc.) get **cross-listed into this hub by category tag** — no rebuild, no
relocation risk to their current nav slot, just a second, categorized entry point that launches
the same panel pre-scoped (the exact mechanic `my-reports` already proves out). "My Reports"
favorites become this hub's "Favorites"/"Recently run" row instead of a separate panel with a
narrower, hardcoded catalog.

**B. One shared Report Shell.** A new component (sits beside `RoutePanelShell`, or wraps it) that
standardizes: date-range picker, `LocationSelector`, a `Run` action, and a single export menu
(Print via the existing `printHtml()`, CSV via one generalized exporter instead of 20 hand-rolled
ones, Share via the Share button `RoutePanelShell` already gives free). Every **new** base report
builds on this shell; existing reports adopt it opportunistically (same "touch a panel, bring it
into line with the current contract" posture CLAUDE.md's panel-contract rule already uses for
other conventions) rather than all at once.

**C. Reconcile the two metric catalogs into one.** Before the picker can exist, `signal-registry.js`'s
labeled/grouped catalog and `metric-source.js`'s resolution functions need to agree on one key
space — this is the "Resolver" notes-62 already called for. This single reconciled catalog becomes
the data backbone for the Custom Report Builder's metric picker, and — as a side effect, not the
point of this project — the same tool SAGE's `search_qsr_kb`-style tools could eventually query
generically instead of each new SAGE tool hand-wiring its own metric.

**D. Custom Report Builder, Salesforce-shaped.** Pick metrics from the reconciled catalog (grouped
exactly like `signal-registry.js`'s own categories) → arrange as columns in a table over a
date-range/location scope (reusing `DateRangeReport`'s existing table-of-metrics shape as the
layout model, since it's the one real prior art for "multiple metrics side-by-side over a
range") → **Save**. A new `custom_reports` table (small JSON spec: `{name, metricKeys[],
defaultScope, defaultPeriod, groupBy}`), RLS'd the same way `report_subscriptions` already is.
Saved reports open through the same Report Shell as every base report — so a saved custom report
gets criteria/print/export for free, zero new per-report code, same as the hub's whole point.

## Decisions (owner, 2026-10-15)

1. **Cross-list, not relocate** — existing report panels (Date-Range Report, Trend Report,
   Forecast Reports, Pay Rate History, etc.) stay in their current nav slot; the hub adds a second,
   categorized, pre-scoped launch entry (same mechanic `my-reports` already proves). Owner flagged
   intent to relocate eventually — note that for a later pass, don't re-raise it as still open.
2. **Custom Reports are shareable across roles**, not personal-only. A DO/Owner can build one and
   a GM can run it. The report **definition** (which metrics, layout, default scope/period) is
   shareable; the **data** each viewer sees stays RLS-scoped to their own `accessible_locs`
   regardless of who authored the definition — same boundary every other panel already respects,
   so sharing the definition cannot leak data across stores a viewer shouldn't see. `payroll.view`
   -gated metrics need the same discipline inside the picker — see Phase 4 below.
3. **PDF + XLSX export are in v1**, not deferred. This means: a real PDF generator (not just
   browser print-to-PDF) and a first-class, reusable XLSX exporter (today exactly one usage
   exists, in `sage.js`) both need to be built as shared Report Shell actions, not per-report
   one-offs.

## Build order (phased, each phase its own PR per this session's established ritual)

**Phase 1 — SHIPPED 2026-10-15 (v5.571). Turned out much smaller than planned below, because a
real "resolver" basically already existed** — do not re-plan or re-scope this phase; the
corrected shape is what actually shipped, kept here so the next session reads the real state, not
the original guess. An exhaustive two-pass audit (full read of both files, every
`METRIC_SOURCES` key and every `METRIC_CATEGORIES` entry cross-checked) found
`signal-registry.js`'s `findMetric()`/`extractMetricValues()` — built for the Signals Scanner —
ALREADY resolve any of its ~101 labeled metrics by key, for any scope/granularity, bridging into
`metric-source.js`'s own auto-first chains via the existing `AUTO_FIRST_KEY_MAP` for anything with
a real chain there. There was no second resolver to build. What Phase 1 actually did:
1. **Fixed a real, pre-existing bug**: 16 metric-source.js keys (discount/promo/cash-O/S/
   refunds/overrides/T-Reds, $ and counts) had no `direction` even though signal-registry.js
   already declared `better` for every one of them — a gap dispatch #77's migration left open
   (it only touched the rate/% headline metrics). All 16 now agree, `direction:'lower'`.
2. **Fixed a real, pre-existing disagreement**: signal-registry.js's `parkPct`/`glParkedPct`
   declared `better:'lower'`, directly contradicting metric-source.js's own documented,
   owner-confirmed ruling that park has no single direction. Both now read `better:null`. **Note:
   `src/engine/kpi-registry.js`'s OWN separate `parkPct` entry (`better:'lower'`) has the SAME
   disagreement and was deliberately NOT touched** — it's a third, independent direction table
   dispatch #77 already knew about and explicitly left alone (CLAUDE.md: "the 4 existing
   panel-side direction tables... were NOT touched except the 3 owner-confirmed-wrong values"),
   so fixing it here would have been scope creep beyond this phase's stated reconciliation of
   metric-source.js ↔ signal-registry.js specifically. Flagging it as a known, real, low-risk
   follow-up fix for whoever next touches `kpi-registry.js`'s park entry — not an open question.
3. **Added 21 real, resolvable metric-source.js metrics with no signal-registry label at all**
   (projGC/projSales, kvsHealthy, otDollar, crewHrs, actVsNeed, floorMgmtNeeded/floorHrsSched/
   variableNeeded/fixedContractHrs/schedHrs/salaryMgrHrs, oppCostDollar/oppCostPct/actVsSched/
   actVsSchedOpp, spph, empMealAmt/mgrMealAmt/empMealCnt/mgrMealCnt/depositAmt) — added to both
   `METRIC_CATEGORIES` (label/unit/category) and `AUTO_FIRST_KEY_MAP` (the resolution bridge),
   so a report-builder picker can now offer them through the exact same path as everything else.
   Signed-gap metrics got `better:null` deliberately (matching `actVsNeed`'s own already-settled
   treatment), not an invented direction.
4. **Added the one genuinely missing primitive**: `metricRowsForRange()`/`metricValueForRange()`
   in `signal-registry.js`, right after `extractMetricValues()`. That function has always
   returned a metric's FULL loaded history (right for the Scanner's correlation sweep) with no
   date-range concept — a report needs "metric X for store Y between date A and B," which neither
   existing function gave directly.
5. **Deferred, not forgotten**: `signal-registry.js` is still a ~900-line Signals-Scanner-heavy
   file (`scanAllPairs`, `computeCustomSignal`, etc.) that a lazy Report panel importing it for
   just the catalog+resolver would pull in whole, same bundle-weight class of problem
   `correlation-stats.js`'s own split (dispatch #195) was carved out to avoid. Flagged with a
   comment right above the two new functions for whoever builds Phase 2's first real report
   panel: if that panel's own before/after bundle measurement shows this file's weight landing
   somewhere it shouldn't, extract `METRIC_CATEGORIES`/`METRIC_FLAT`/`findMetric`/
   `extractMetricValues`/the two range functions into their own `metric-catalog.js`, with THIS
   file importing back from it — same direction correlation-stats.js's split took. Not done
   preemptively since no real consumer exists yet to measure against.

Tests: `src/__tests__/reports-catalog-phase1.test.js` (75 tests) plus full suite
(614/614 files, 5794/5794) and build (clean, 563.21 KB eager / 850 KB budget) both green.

**Phase 2 — Report Shell + the two new export actions.** Date-range picker + `LocationSelector` +
Run action, wired to Print (existing `printHtml()`), CSV (one generalized exporter replacing the
~20 hand-rolled ones), a new PDF export (needs a real library — `jspdf` or `pdfmake` — lazy-loaded
like `pdfjs-dist`/`xlsx` already are, to protect the entry-chunk budget), and a new generalized
XLSX export (generalizing the one real pattern in `sage.js`). Prove it against one real existing
report before treating it as the standard.

**Phase 3 — Reports hub.** Category-tabbed landing page under `section:'reports'`; cross-lists
existing report panels (pre-scoped launch, no relocation) alongside any new base reports; "My
Reports" favorites/recently-run folds in here instead of staying a separate narrower panel.

**Phase 4 — Custom Report Builder.** Metric picker over the Phase 1 catalog → columns over a
date-range/location scope (reusing `DateRangeReport`'s table-of-metrics shape) → Save. New
`custom_reports` table: owner-authored definitions, RLS lets OTHER roles read/run a definition
marked shared (decision 2) while each viewer's actual query still runs through their own
`accessible_locs` scoping — the definition grants no data access by itself. The picker must hide
`payroll.view`-gated metrics (and any future tightly-scoped metric) from a builder who lacks that
permission, same as every other permission check in the app — a shared definition must not let a
non-privileged viewer back into wage data through a report built by someone who had it.

Then: curate and build the actual **base reports** (the owner's next ask) on top of Phases 1-3,
each one a small addition once the shell exists.
