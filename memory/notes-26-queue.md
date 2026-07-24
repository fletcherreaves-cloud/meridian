---
name: notes-26-queue
description: Owner "Notes 26" (2026-07-24) — queued items. Mix of quick wins relevant to in-flight work and larger "expert-level" analysis+report ambitions (FOB / Scheduling / Projections), plus a key Visit Readiness reframe (only a few graded visits/year). Captures each + Claude's triage.
metadata:
  node_type: memory
  type: project
---

# Notes 26 — queue (owner, 2026-07-24)

## 1. Merge Task Queue + Feature Requests?  🟡 (IA decision)
- Pros/cons of merging into one panel "best of both worlds" without losing anything.
- Claude take (TBD): both are Supabase-backed lists; a single panel with a Type toggle
  (Task vs FR) + shared table could work. Pro: one place, less nav. Con: different
  lifecycles (tasks = data-pull issues to clear; FRs = roadmap to prioritize). Likely
  doable as a tabbed/filtered single panel. Needs a short design pass.

## 2. Email Reports retention  🟢 (question — answer, then maybe automate)
- Should emailed QSRSoft reports (in the `qsr-reports` bucket) be retained, or is deleting OK?
- What (if anything) is lost on delete? → Once parsed into `sales_ledger_daily` /
  `daily_glimpse_daily` / `cash_sheet_daily`, the DATA is retained in tables; the raw CSVs
  are re-parseable source-of-truth backups. Recommend a retention window (e.g. keep 90d,
  prune older) rather than immediate delete, in case a parser fix needs a re-run. CONFIRM + can
  add a cleanup step to the email-parse Action.

## 3. Catalog to direct users to data sources when unavailable  🟡 (relates to Notes 24 docs)
- When Meridian lacks a piece of data, point users to where to get it:
  - Which QSRSoft report to run.
  - Other websites + help topics.
- Ties to Notes 24 #3 (docs repository / Knowledge Base). Build as a "Where's my data?" catalog
  keyed by data type (extend the Data Manager SRC_INFO + KB).

## 4. FUTURE — "expert level" analyze-and-report engines  🔷 BIG (own workstreams)
Teach the app to analyze like the owner does manually + produce an easy send-ready report:
- **FOB** — analyze as owner does now; **diagnose & troubleshoot to find opportunities**; easy report.
- **Scheduling** — analyze as owner does now; easy report. (dovetails Notes 23 #8 per-location schedule report.)
- **Projections** — analyze as owner does now; easy report.
- → Each is a coach/report engine like the Visit Readiness coaching report, but domain-deep.
  Owner's manual method is the spec — will need to capture how he does each.

## 5. LifeLenz Gap — rework with the new Simple Models  🟡
- Rework the LifeLenz Gap panel to use/reflect the new **Simple Models** for clarity.

## 6. Implement Simple Models across ALL projection streams  🟡→🔷
- The simple trailing family (T3M/T6W/T3W, proven in Smart Targets v4.483) should feed every
  projection stream, not just Smart Targets. Cross-cutting; sequence with the projection work.

## 7. ⭐ Visit Readiness — rework "no recent visit" context  🔴 (relevant NOW)
- Reality: each store gets only a **few graded visits/year — ~3 CFV, 2 EcoSure, 1 RGR**.
- So "last actual visit" is usually stale/absent, and the v4.519 calibration (needs n≥3 recent
  visits) will rarely have data. **Rework how we handle "no recent visit"** for analysis.
- Owner open to suggestions. Claude ideas:
  - Calibrate against the **trailing 12-month** visit history (pooled across stores), not just
    "recent" — 27 stores × ~6 visits/yr ≈ 160 visits/yr is plenty in aggregate.
  - Separate the readiness estimate (always available, leading indicators) from the
    validation (rolls up district-wide over a rolling year).
  - Track **days-since-last-visit per type** (CFV/EcoSure/RGR) and a "due/overdue" signal — the
    Visit Patterns cadence table already computes days-since-last; surface an expected-cadence flag.
  - For "no recent visit" stores, lean on the leading-indicator score + peer comparison instead of
    a per-store actual.

---

## Triage
- 🟢 **Quick / answerable:** #2 (retention policy), parts of #1.
- 🟡 **Small-medium, relevant to in-flight:** #5 LifeLenz Gap rework, #7 VR no-visit reframe (do within VR), #1 merge panels, #3 data-source catalog.
- 🔷 **Big workstreams:** #4 expert FOB/Scheduling/Projections report engines, #6 Simple Models everywhere.
