---
name: perf-review-data-sourcing
description: Owner-provided QSRSoft report sourcing spec (Notes 32 #2 follow-up, 2026-07-28) for the Performance-Review People/Profit metrics that still need data — Employee Roster (Shift-Certified Mgrs), Roster Statistics (Headcount), Turnover (0-90), Op Supplies (already pulled), Total Profit (derived), Digital App GC, McDelivery 3PO GC. Report names, filters, fields, historical-backfill approach, and mappings. This is the build sheet for the pull session (agent has no QSRSoft egress + no sample data yet).
metadata:
  node_type: memory
  type: project
---

# Perf-Review data sourcing — QSRSoft report spec (Notes 32, owner intel 2026-07-28)

**Constraint:** the agent cannot reach QSRSoft (egress blocked) and has no sample exports for the
NEW reports, so pull scripts + parsers must be built in a session WITH access (or from owner-supplied
sample files). Each report below is a new Playwright pull (pattern: `scripts/qsrsoft-*-pull.mjs`) →
Supabase table → parser (`src/parsers`) → loader (`src/lib/supabase.js`) → metric-source /
review-autoPopulate wiring. Historical months need a **month picker loop** (cycle each month of the
year) to backfill; then daily/monthly forward.

## 1. Employee Roster → # Shift-Certified Managers + manager location
- **Filter:** month picker (defaults to current month) → loop all months this year for history.
- **Fields to capture:** Job Title Codes; Employment Status (currently employed?); Termination Reason
  (term status); Job Title Code Start Date (when the title changed); Job Code Type (primary vs
  secondary); Primary Job Title Code Description (current role); Location Type (home store). Plus
  "a ton of other" fields — capture broadly, decide later.
- **Use:** count Shift-Certified Managers per (loc, month); detect promotions/demotions via JTC +
  start date; who is where (manager location roster).

## 2. Roster Statistics → Total Head Count
- **Filter:** month picker (defaults current) → loop months for history.
- **Fields:** **Active Crew** column = headcount; **Shift (Staff Size)** = shift-manager count.
- **CROSS-CHECK:** Employee Roster vs Roster Statistics should MATCH — reconcile to find the more
  reliable source for manager count & headcount.
- **Headcount = all hourly personnel** by default, BUT **make composition CONFIGURABLE in settings**
  (e.g. crew+maintenance only, or all hourly, or +managers) — map from the available JTC/role fields.

## 3. Turnover → 0-90 Day Turnover
- **Filter:** by location; separate run filtered by **LM tab** for the month's per-location result.
- **Tabs:** LM, Jan…Last Month, Trailing 13 Months. Needed value on the **default page**, row
  **"TTM Turnover"** or **"YTD Turnover"** (confirm which). Process ALL results (incl. ones not
  listed) and make them available for whichever metric is desired.

## 4. Op Supplies → Op Supplies vs Budget  ✅ DATA ALREADY PULLED
- Source: **`qsr_ebos_daily.ops_purchases`** (auto-pulled daily). `loadEbosMonthlyByStore(year,month)`
  already sums Σ ops_purchases per store. TARGET = `tOpSupply` (already in DEFAULT_TARGETS, auto-fills).
- **TO WIRE:** load monthly ebos ops_purchases into `ds` (it is NOT currently in ds — loaded
  on-demand only) so autoPopulateKPIs can fill the `opSupplies` ACTUAL. Small startup-loader + wiring.

## 5. Total Profit vs Target  ✅ DERIVED (no new pull) — BUILT v4.540
- Math from the category's own items: FOB% + Labor% + Op-Supplies $. Both ACTUAL and TARGET built
  from the same pattern. Engine `deriveTotalProfitVsTarget()` in review-engine.js (see below).

## 6. Digital App → Digital App GC/Rest/Day
- **View:** "Digital App" report; the metric **Digital App GC/R/D** is on this view. All locations.
- **Backfill options (owner open to suggestion):** (a) pull daily + roll up internally, (b) pull MTD
  for each month this year to seed + daily forward, or (c) daily backfill the whole year.
  → RECOMMEND (b)+daily-forward: seed MTD per month (cheap), then daily moving forward for accuracy.

## 7. McDelivery → Delivery GC/Rest/Day  (McDelivery 3PO tab)
- **Field:** **3PO GC** column = Delivery GC/Rest/Day.
- **Also capture now (future project):** Restaurant Time, CSAT, Orders-with-missing-items,
  **McDelivery Time**, **Total Experience Time**. Wire the whole row while we're here.

## 8. FS EcoSure — BLOCKED (owner awaiting EcoSure access). Come back later.

## 9. FS Completion T-60 — feasibility TBD
- Food-Safety app: **FL = Jolt, OK = Squadle** (two vendors, same function). Confirm owner has
  all-locations data access; if not owner resolves, then wire. Needs a dedicated session per vendor.

## Build order (when a pull session is available)
1. Op Supplies into ds (#4) — smallest, data exists. 2. Employee Roster + Roster Statistics (#1/#2)
— shared People pull, cross-checked, config headcount. 3. Turnover (#3). 4. Digital App (#6) +
McDelivery (#7) — Sales/Delivery. 8/9 blocked. Each: table + parser + loader + metric-source line +
review target/actual mapping + `missingReviewTargets` clears as they land.
