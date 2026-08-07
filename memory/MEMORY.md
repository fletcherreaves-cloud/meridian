# Meridian Project Memory — Master Index

> Read this to discover what's documented. **Newest work is at the top.** When resuming a
> session, read the most-recent handoff first, then the relevant thread files.

## ⭐ READ FIRST — latest handoff & vision
- **[Session handoff 2026-07-28](session-handoff-2026-07-28.md)** — MASTER handoff: everything
  shipped this session (v4.535–544), locked decisions, the next task (build QSRSoft pull scripts),
  access/settings, and pending items. **Start here after a session switch.**
- [Vision & roadmap](vision-and-roadmap.md) — ⭐ north-star, Smart Targets Model v2, accuracy-integrity
  system, deployment paths, prioritized roadmap.
- [North-star discovery lens](north-star-discovery-lens.md) — bridge QSRSoft's gaps, don't clone it;
  correlations, real-world decision trees, "learn and burn."

## 🗂 Owner "Notes" working queues (most recent = most relevant)
- [Notes 59](notes-59-online-reputation.md) — online reputation/social analytics: Google/FB/Yelp/Reddit/3PO
  ratings + reviews per location, local news, community-sentiment source tracing. Key constraint:
  **prominence beats recency** (what is displayed as current matters, even if old)
- [Notes 58](notes-58-queue.md) — Inventory Control weekly-count rules (Food+Condiment every week,
  floating mid-month Paper count); per-item variance charts; Items Recounted tile blank;
  ⚠️ **absolute must** — one-directional swing alarm w/ click-ack + auto-compiled cause report (store 10422)
- [Notes 32](notes-32-queue.md) — Perf-Review target auto-fill + per-metric sourcing; 1:1 Checkpoint;
  One-Pager round-2 (weekly Opportunity blow-up fix, cascade focus, R2P/TPPH).
- [Notes 31](notes-31-queue.md) — One-Pager v2 (metricSeries range bug, FOB anomaly, range compare,
  L/F/G, cascade dropdown).
- [Notes 30](notes-30-queue.md) — target write-back to QSRSoft; EOM qty-variance; Perf-Review KPI
  directory + threshold authoring; One-Pager scope + generic printable.
- [Notes 29](notes-29-queue.md) · [Notes 28](notes-28-queue.md) · [Notes 27 + feedback](notes-27-and-feedback.md)
  · [Notes 26](notes-26-queue.md) · [Notes 25](notes-25-queue.md) · [Notes 24 UX architecture](notes-24-ux-architecture.md)

## 👥 Performance Reviews
- [Perf-Review data sourcing](perf-review-data-sourcing.md) — QSRSoft People/Digital/Delivery report
  specs + the built+validated parsers (`src/engine/people-reports.js`); job-code taxonomy; cross-check
  finding; owner-confirmed decisions (shift-cert scope, 0-90 turnover).
- [Perf-Review Excel audit](perf-review-excel-audit.md) — threshold decisions vs the authoritative
  workbook; ROUND 2 banked corrections (OEPE %-of-target, Shift-Certified step, Bonus-Eligibility, etc.).
- [Performance Review System](project-perf-reviews.md) — engine, data model, scoring, roadmap.

## 📋 Leadership One-Pager + Opportunity $
- [Opportunity-$ design](design-opportunity-dollars.md) — Labor/Food/GC gaps → recoverable dollars;
  benchmark modes; the engine (`opportunity.js`) + adapter (`one-pager-data.js`) + view.

## 🖨 Forms
- [Forms library index](project-forms-library-index.md) — Pre-Shift Checklists + Travel Paths printable
  blanks; QSRSoft forms auth (Cognito ID token in localStorage).
- [Unified form engine design](design-unified-form-engine.md) — normalize→render, the pull method.

## 🔗 QSRSoft data & intelligence
- [QSRSoft report catalog](qsrsoft-report-catalog.md) — full system map from the owner walkthrough (what
  QSRSoft does, per-menu, to inform Meridian's roadmap).
- [QSRSoft RBAC & permissions](qsrsoft-rbac-and-permissions.md) — SSO getOrgInfo taxonomy.
- [QSRSoft email pipeline](project-qsrsoft-pipeline.md) · [Daily Activity + Shift Dashboard](project-qsrsoft-daily-activity.md)
  · [DAR columns](project-qsrsoft-dar-columns.md) · [CoachQ](project-qsrsoft-coachq.md) +
  [query patterns](coachq-query-patterns.md) · [Controls endpoint](project-qsrsoft-controls-endpoint.md)

## 📈 Signals / Smart Targets / Accuracy
- [Signals scanner](project-signals-scanner.md) — auto-correlation across metric pairs, guardrails.
- [Simple-models propagation](simple-models-propagation.md) — T3M/T6W/T3W family engine-wide.
- [Smart Targets / graded / accuracy handoff](handoff-smarttargets-graded-accuracy.md) ·
  [Accuracy layer](project-accuracy-layer.md) · [Graded Visits PACE](project-graded-visits-pace.md)

## 🧮 EOM / Inventory / FOB
- [EOM diagnosis flow](project-eom-diagnosis-flow.md) · [Item Journey](project-eom-item-journey.md) ·
  [FOB context](project-fob-context.md)

## 🧠 SAGE
- [SAGE AI](project-sage.md) — edge fn, live tools, RBAC, auto-scheduling, self-instrumenting.

## 🏗 Data-refresh sprint & standards (standing rules)
- [Data-refresh sprint handoff](handoff-data-refresh-sprint.md) — the At-A-Glance freshest-wins rework.
- [Data-sourcing standard](data-sourcing-standard.md) — metric-source.js / vs-ly.js; never filter raw
  rows for a metric. **Standing rule.**
- [Data source redundancy](project-data-redundancy.md) — auto/emailed-first, manual = last-resort fill.
- [Panel catalog](panel-catalog.md) — every panel + status.

## 🔒 Infra / security / deploy
- [RLS hardening plan](project-rls-hardening-plan.md) — require-auth policies (Phase 1 done).
- [Project audit 2026-07-27](project-audit-2026-07-27.md) · [Supabase priority](project-supabase-priority.md)
  · [Data model](project-data-model.md) · [Sync rework](project-sync-rework.md) · [Hosting](project-hosting.md)
- [Deploy rule](feedback-deploy.md) — push to branch; Vercel auto-deploys. [Selector UI standard](feedback-selector-ui-standard.md).
- [LifeLenz session](lifelenz-session.md) — token lifecycle, dead ends. [VLH config](project-vlh-config.md).
- [Labor Analysis FLH](project-labor-analysis-flh.md) · [LifeLenz schedule/jobs](project-lifelenz-schedule-jobs.md)
  · [Crew skills matrix](project-crew-skills-matrix.md) · [Feature Requests](feature-requests.md)
- [PWA Share bug](project-pwa-share-bug.md) · [Backlog](project-backlog.md) · [Meridian status](project-meridian.md)

---
*Index maintenance: when adding a memory file, add it here. Newest handoff always pinned at top.*
