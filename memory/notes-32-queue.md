---
name: notes-32-queue
description: Owner "Notes 32" (2026-07-28) — Performance Reviews auto-populate from yearly/monthly targets + per-metric data/target sourcing plan (RGR/Sales/Profit/People), 1:1 Checkpoint review-cycle progress, and a second round of Leadership One-Pager fixes (WTD anomaly, R2P/TPPH, Opportunity-GC blow-up, cascade selector semantics). Plus the FL FOB live-check handoff.
metadata:
  node_type: memory
  type: project
---

# Notes 32 (2026-07-28)

## A. Performance Reviews — auto-populate from TARGETS + per-metric sourcing
- **Auto-fill actuals AND targets from yearly + monthly targets where possible.** If a metric
  exists in both, **monthly target wins**. Fold into the existing `autoPopulateKPIs` (upload) routine.
- For **every KPI in the directory dropdown** (kpi-registry), ensure it can auto-pull DATA + TARGETS
  where applicable. Where no target is set → **prompt the user to set one**; **auto-suggest from
  Smart Targets** when available; if missing in Smart Targets too, flag/correct in this same pass.

### Per-metric sourcing plan (owner intel — what we pull vs. what's blocked)
**Running Great Restaurants**
- EPB2B (Pace Portal %) — different site; verify auto-pull feasibility (likely manual for now).
- Delivery Wait (sec) — should be pullable; wire it.
- 2nd Side Healthy Usage — may just be `scored:false` currently; confirm + optionally score.
- Complaint Contacts/100K — automation unclear; try (source TBD).
- FS Audits Completed — supervisor/mgr monthly audit requirement; **source from completed QSRSoft
  forms**. Org not using yet but WILL — build it out. Non-trivial but doable.
- FS EcoSure — blocked on owner's lack of EcoSure report access; wire once obtained.
- FS Completion T-60 — from Food-Safety app (org uses **Squabble** + **Jolt**); pull from there —
  needs a dedicated session to figure out.

**Sales Drivers**
- Digital App GC/Rest/Day — should already have access; **verify + correct if not**.
- Delivery GC/Rest/Day — should already have access; **verify + correct if not**.

**Profitability**
- Op Supplies vs Budget — data exists now, **just wire it**.
- Total Profit vs Target — should be **math-derived from this category's items** (Food Over Base +
  Labor % + Op Supplies). Confirm the composition + compute.

**People, Staffing & Retention**
- # Shift Certified Managers — pullable from QSRSoft (**owner will source report name + filters**;
  new data pull).
- # Shift Manager Verifications by GM — future; form-based (mgr name, verified-by, date, score).
  Not currently used by this org.
- Total Headcount vs Target — same report as Shift Cert likely; **target from yearly store targets**.
- 0-90 Day Crew Turnover — new QSRSoft report pull (**owner will source report name**).
- Execution of Crew Retention Prg. — subjective/effort-based; **almost certainly never auto-populate**.
  Keep manual/optional (already flagged subjective in perf-review-excel-audit.md).

## B. 1:1 Checkpoint — show review-cycle progress
- Want to show recipient the progress of the **current review cycle**. Owner notes the **Print/PDF
  already surfaces a review-period summary** → may be fine as-is. Only build a one-page/list rollup
  if there's added value for monthly reviews. **PROTECT the monthly-results aspect of 1:1 Checkpoint.**

## C. Leadership One-Pager — round 2 (extends Notes 31)
- **WTD (week-to-date) values look off; YTD probably correct.** (screenshot) — after the Notes-31
  range fix, the WEEK window still looks wrong. Investigate week-window sourcing / partial-week.
- **R2P + TPPH still not wired right.** R2P has NO cloud stream (manual opsRows only) → blank on a
  device w/o manual upload. TPPH now derives `gc/actual_punched_hours` from qsr_daily_activity —
  VERIFY `ds.qsrActSummaryRows` is actually loaded + actHrs>0. Re-check both end-to-end.
- **Opportunity on the table "way off" (super high) for weekly; MTD looks realistic.** (screenshot)
  Driven by the **Guest-Count pillar** = (benchGC/day − actualGC/day) × avgCheck × days. Suspect a
  partial-week window inflates the gap (e.g. avgCheck from a tiny denominator, or bench percentile
  vs a low actual). **Walk the owner through the GC math + fix the weekly blow-up.**
- **Cascade selector (Owner→DO / DO→Supervisor / Supervisor→GM): currently ONLY a label/tag** — it
  does not change content or focus. Owner asks what it does + offers to provide a **job-level flow /
  JobRole descriptions** to drive per-level focus. → design per-level focus (what each level cares
  about) and tailor the one-pager content/sections by cascade level.

## D. FL FOB live check — handoff
- Domain now allowlisted (Capabilities → network egress → `*.supabase.co`) but egress applies at
  SESSION START → needs a NEW session. Owner prefers to keep THIS session's momentum. Decision:
  keep a **bulletproof handoff md** current; run the live FL FOB check in a fresh session later.
  Query + logic already captured in `session-handoff-2026-07-28.md`.

## Status
NEW — working through C (One-Pager fixes, code-diagnosable now) + A (perf-review target auto-fill)
first since both are doable without live data. Per-metric wiring (A) proceeds where data already
exists; blocked ones (EcoSure/Jolt/Pace Portal) parked with owner action noted.
