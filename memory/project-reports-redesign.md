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

## Open decisions before building (your call, not mine to assume)

1. **Relocate existing report panels into the new hub, or just cross-list them?** Cross-listing
   (B above) is lower-risk and ships faster; a full relocation makes "Reports" in the sidebar the
   single literal home but touches more nav/registry wiring for panels that already work fine
   where they are.
2. **Custom Reports: personal-only, or shareable across roles?** `report_subscriptions` today is
   personal (`RLS by auth.uid()`). A custom report could stay that way, or a DO/Owner could build
   one and let a GM run it — the data a GM sees is still RLS-scoped to their own `accessible_locs`
   regardless, same as every other panel, so sharing the *definition* doesn't leak data; it only
   changes who can define vs. who can merely run.
3. **Export scope for v1.** Print + CSV are both near-free (patterns already exist everywhere).
   A real generated PDF (not browser print-to-PDF) and a first-class XLSX exporter (currently one
   single usage, in `sage.js`) are bigger lifts — worth calling out explicitly as later phases
   rather than silently deferring them.

Once these are decided, the natural build order is: (1) reconcile the metric catalogs [C], since
everything else depends on it being correct, (2) ship the Report Shell [B] against one real base
report as a proof, (3) stand up the Reports hub [A] and migrate/cross-list the existing base
reports onto the shell opportunistically, (4) build the Custom Report Builder [D] last, since it's
the only piece with genuinely new UI and a new table.
