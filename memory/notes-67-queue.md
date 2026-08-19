---
name: notes-67-queue
description: Notes 67 field queue (2026-08-19) — IA/navigation reorganization (URL-view conversion, section regrouping), a handful of concrete correctness bugs, and the "all-in" security build directive. Security content split out to plan-security-loss-prevention.md.
metadata:
  type: project
---

# Notes 67 — field queue (2026-08-19)

Owner's field notes, delivered in chat. Two distinct streams arrived in the same message:

1. **IA/navigation reorganization** — this file.
2. **Security & loss-prevention build directive**, plus three rounds of AI-engine research
   (Gemini in-chat, then two uploaded files from other engines) — split out to
   **[plan-security-loss-prevention.md](plan-security-loss-prevention.md)** because it's a design
   spec, not a checklist, and merits its own file per this repo's memory conventions.

---

## 1. Navigation / IA reorganization

The owner wants a broad restructuring of the app's navigation: converting standalone panels to
URL-addressable views, and regrouping existing panels into new top-level sections. Verbatim intent
below, organized as the owner listed it — **none of this has been scoped or verified against
current code yet**; it needs a PM pass before becoming a dispatch.

### New/changed top-level groupings

- **Reports** (new section) — Leadership One-Pager, Above-Store One-Pager, My Reports (+ add more
  metrics to build-your-own), Store One-Pager. Org Summary and Rankings also move here (owner:
  "Org Summary is a report", "Rankings can go under reports also").
- **Inventory and Food Cost** (new section) — Food Cost (Original), End Of Month, Inventory
  Control, Count Cycle.
- **Forecasting and Labor Projections** (new section) — Projections, Proj vs Actuals, Forecast
  Models, DI Calibration, Forecast Accuracy, Lifelenz Gap, DI Compare, Fcst Reference, Forecast
  Audit, Lifelenz Bridge.
- **Analysis** (new section) — Metric Correlations, Why Engine.
- **HR** (new/renamed section) — Performance Reviews. **Visit Readiness and Graded Visits should
  move OUT of People/HR** — owner explicitly flagged this as misplaced, doesn't say where it
  should go instead.
- **Calendar, Events and Tags, Event Impact** — possible new group, or could fold into a Planning
  section (owner: "Could be included in Planning").

### URL-view conversion (standalone panel → routable URL)

- Scheduling
- Performance Reviews
- Food Cost (Original)
- End Of Month
- Inventory Control
- Count Cycle
- **"All other panels unnamed"** — convert to URL view. Owner's phrasing implies this is a
  blanket policy, not an enumerated list; needs scoping to figure out which panels currently lack
  URL addressability.

### Right-side modal popups (explicit exception to the URL-view policy)

Owner named these as the panels that should **stay as right-side modal popups**, not convert to
URL views — but **every popup needs a minimize-and-close option**, which doesn't universally exist
today:

- SAGE (already right-side modal — "as-is")
- Knowledge Base
- About (**new** — doesn't currently have a right-side modal)
- Metric Lineage (**new** as a popup)
- Feature Requests (**new** as a popup)
- Local News (**new** as a popup)

### District Overview

- Needs a back button. No back-navigation currently, per owner.

### Fcst Reference / Forecast Audit

- **Fcst Reference:** "make sure it is current and updated" — implies possible staleness, not
  investigated yet.
- **Forecast Audit:** owner asks "why is it greyed out?" — reads as a live bug/regression, not a
  design ask. **Investigate first**, before assuming this is a build item.

### Lifelenz Bridge rename

- Rename to **"Recommended WFM Forecast Adjustments"** — cosmetic/naming only, no logic change
  implied.

### Help

- "Make sure it is current" — same staleness concern as Fcst Reference, not investigated.

### General UX policy asks

- **Make all data tables filterable/sortable as appropriate wherever possible.** Broad,
  cross-cutting — needs an inventory of which existing tables already have this vs. don't before
  it becomes actionable.
- **"For any use of AI in the project — what, if anything, should be migrated to SAGE?"** — this
  is a design/architecture question for the owner+PM to work through, not a build item on its own.
  Relevant existing AI touchpoints in the app: SAGE itself, and (per this notes batch) the new
  security-analytics engine's risk-scoring/explanation-tree layer will itself likely be
  AI-assisted — worth deciding SAGE-vs-standalone before that gets built, not after.

---

## 2. Concrete bugs (not design/reorg — these are correctness issues)

- **Food Cost (Original) date-selector defaults to May 2026** even though all data is showing
  correctly otherwise. Owner: "weird quirk... need to correct this." Sounds like a stale default
  value or a hardcoded month reference left in from testing/dev — worth a quick grep for a
  hardcoded `'2026-05'`-shaped literal in that panel's selector init before assuming anything more
  complex.
- **Speed of Service panel: DT History is slow to load** — 15+ seconds. Owner flagged as a
  performance issue, not a design ask. Given this repo's standing performance-budget rule
  (`memory/feedback-performance-budget.md`), this should get a proper before/after measurement if
  it becomes a dispatch, not just a "make it faster."
- **Forecast Audit panel appears greyed out** — owner asks why; likely a gating bug (permissions?
  a data-readiness check firing false?) rather than a URL-view/reorg task. Investigate before
  scoping.

---

## 3. New capability asks (owner's own words, "New Directions to add to our queue")

- Comprehensive security/loss-prevention section — **fully specified in
  [plan-security-loss-prevention.md](plan-security-loss-prevention.md)**, synthesized from three
  AI-engine research passes the owner ran (Gemini, and two more files from other engines) plus the
  owner's own follow-up prompts steering the research deeper.
- Make all data tables filterable/sortable wherever possible (listed above under UX policy, kept
  here too since the owner listed it under "new directions").
- AI-migration-to-SAGE design question (listed above).
- **Build something to show LifeLenz forecast alongside Meridian Forecast** — a side-by-side
  comparison view. Not otherwise scoped; likely lives in the new Forecasting and Labor Projections
  section once that exists. Related existing item: this backlog's Lifelenz Gap /
  DI Compare items already do *some* forecast-vs-forecast comparison — worth checking whether this
  is asking for something those don't already cover before treating it as fully new.

---

## How this file should be used

This is raw field intake, not a scoped plan. Before any of §1/§2/§3 becomes a dispatch to the
engineer: (a) verify current panel/routing structure against the code — several of these ("Org
Summary is a report", "Rankings can go under reports") describe *where things should live*, which
needs a real inventory of what exists and where it lives today; (b) the two flagged bugs (§2)
should get a quick code-level look before scoping, since "why is it greyed out" and "defaults to
May 2026" both smell like small, findable root causes rather than open design questions.
