---
name: notes-30-queue
description: Owner "Notes 30" (2026-07-28) working queue — data-write-back to QSRSoft targets, EOM qty-variance + Item-Journey reconciliation, Perf-Reviews add/remove/edit categories + KPI directory + threshold-authoring, and Leadership One-Pager scope (owner/org/OK-FL) + a generic printable discussion one-pager. Some may already be in progress separately.
metadata:
  node_type: memory
  type: project
---

# Notes 30 (2026-07-28)

## 1. Write data TO websites — Targets (exploration) → affects QSRSoft + Sync
Explore **pushing** data (not just pulling) — specifically **Targets** — into QSRSoft (and our
Sync). Two-way: today we only read. Research the QSRSoft target-set endpoint(s) (likely a POST
under `v3`/`api.reports`/`forms`); check the `datapass_access` lead (official export/import?).
Scope carefully (write ops are riskier). Exploration first, then a guarded write path.

## 2. EOM Dashboard
- **Food-Cost Diagnosis:** add **quantity variance alongside $ variance in ALL instances**
  throughout (not just Item Journey — every place $ variance shows, show qty too).
- **Item Journeys:** figure the math to **balance the product +/- flow so it reconciles to the
  current pulled report/data** (the flow's net should tie out to the Variance Stat report; today
  it's directional — make it reconcile exactly).

## 3. Performance Reviews — Weights (extends #59)
- **Add / remove / edit CATEGORIES** (not just competencies within them).
- **KPI directory → dropdown:** bank the major KPIs in a registry and let review-builders
  **select a metric from a dropdown** instead of free-text — controls the *source* (ties to a
  real metric/field), which simplifies wiring + scoring. (Mirrors the metric-source registry /
  signal-registry pattern; also the "unified form engine" direction.)
- **Rating-threshold authoring:** solve how to create thresholds for ANY new metric, with
  **plain-English directions** on how they work for future users (self-documenting threshold UI).
  Ties to the round-2 threshold decisions (perf-review-excel-audit.md) — the "% of target →
  1–4" convention needs a real-world-sane, well-explained authoring flow.

## 4. Leadership One-Pager
- **Scope presets:** make **supervisor(group), owner, org, and OK/FL** all pickable. (Have:
  All + Supervisor + Operator. ADD: Owner [=operators map, relabel], Org [=all], **OK / FL**
  state filters via INV_ORG_COORDS[loc].state.)
- **Generic printable open-ended one-pager:** a **blank** discussion template for any pairing
  (Owner↔DO, DO↔Supervisor, Supervisor↔GM) — auto current-state filled, but open blank
  sections (wins/concerns/action plan/follow-up/notes) to **force both parties to look things
  up** and drive the conversation. A print mode, no persistence required.

## Status
Owner said "yes to all"; some items may already be in progress separately (dedupe on pickup).
Leadership One-Pager scope + generic printable = DONE (#64, PR #79 merged).

**#3 Perf Reviews — SHIPPED (slice 1):** `src/engine/kpi-registry.js` = the shared KPI directory
(flattens DEFAULT_REVIEW_CONFIG.metrics + 4 extra operational KPIs: tpph/cashOSPct/tRedAPct/parkPct;
`explainThreshold(kpi)` = plain-English "how it scores"; `makeMetricFromKpi`). Wired into Customize:
Results-category add/rename/delete (Weights sub-tab), a KPI-directory **dropdown** per category
(select-a-metric, not free-text — seeds source + default thresholds, weight starts 0), and a per-metric
**ⓘ plain-English** threshold explainer in the Rating Thresholds sub-tab. Category label resolves from
`categoryWeights[cat].label` so custom results categories render. Engine already iterates
`categoryWeights`/`metrics[cat]` dynamically, so new categories flow through scoring. 12 new tests.
**Remaining #3:** the banked threshold-VALUE corrections (perf-review-excel-audit.md ROUND 2 — OEPE
%-of-target+120s floor, Shift-Certified gentle count step, FOB/Labor Bonus-Eligibility module,
Total Profit Excel bands) are separate deliberate changes, not part of this authoring-UI slice.
