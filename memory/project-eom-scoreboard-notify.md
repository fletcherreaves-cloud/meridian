---
name: project-eom-scoreboard-notify
description: EOM Completion Scoreboard (shipped v4.568) + the deferred idea of real (push/email) notifications when a store crosses 90% / new count data lands.
metadata:
  node_type: memory
  type: project
---

# EOM Completion Scoreboard + notifications

## Shipped (v4.568, 2026-07-29)
A **Scoreboard** tab in the EOM Dashboard (`src/views/eom-dashboard.js`, `mode==='scoreboard'`,
default during the last-3-day count window). Per-store triage checklist over `eom_count_status`:
- Tally band: Not started / Counting / Ready for you / Reviewed / Comms sent.
- Rows sorted ready-for-you-first: count progress bar + status pill + one-tap ☑ Reviewed / ☑ Comms
  (persist to `eom_count_status.diagnosis_status` / `comms_status` via `updateStatus`).
- Buckets: `sbBucket()` — comms > reviewed > ready(believesDone ≥90%) > counting > notstarted.
Backbone already existed: on-hand pull maintains `eom_count_status` (pct_counted, notified_90
fire-once trigger, diagnosis/comms status); engine `computeCountProgress` (believesDone ≥90%).

## Owner directive (2026-07-29): in-app band now; explore REAL notifications later
Owner chose in-app surfacing for now (the existing 🔔 "ready for review" band + Scoreboard),
and asked to **log the idea of actual push/email notifications for the future**.

### Future notification options (when we build it)
- **Signal already exists:** `eom_count_status.notified_90` fires exactly once per store when it
  crosses 90% (server-side, in `scripts/qsrsoft-onhand-pull.mjs`). That's the natural trigger.
- **Email (lowest lift):** the on-hand GitHub Action (or a tiny follow-on step) sends the owner an
  email when any store newly sets notified_90 — via a mail API (Resend/SendGrid) or a Supabase
  Edge Function. No client needed; fires from CI where the pull runs (~8a/10a/2p CT).
- **Push (PWA):** Web Push needs a service-worker subscription + VAPID keys + a push sender. More
  moving parts; also the PWA share/install path had a prior bug ([[project-pwa-share-bug]]).
- **In-app toast/badge (done-ish):** nav badge count of ready-unreviewed stores during the window.
- **SAGE scheduled prompt:** once `sage_prompts`/`sage_prompt_runs` are live + the runner is set up,
  a daily EOM-window prompt could summarize "N stores ready, M stalled" — reuses existing plumbing.

Recommend starting with the **emailed CI trigger** when we pick this up — least infra, reaches the
owner off-device. See [[project-eom-diagnosis-flow.md]] for the on-hand pull + status internals.

## EOM FOB freshness (Notes 34, 2026-07-29)
EOM Dashboard FOB% = `qsr_fob` (auto-pulled, `dsd:'d'`), MTD Σ(6 controllable components)/Σ prodSales,
dollar-weighted (`fobByStore` in `src/views/eom-dashboard.js`). It's a real download but was pulled
**once/day (~6am CT)** → a count finalizing mid-day (settling stat variance → moving FOB) didn't show
until next morning (Chipley read 3.47 vs QSRSoft 3.58). **Fixed:** `qsrsoft-pull.yml` now pulls FOB
**3×/day (11/18/22 UTC = 6a/1p/5p CT)**; the script re-pulls a recent window so later runs backfill.
- **Owner idea (follow-up): autopull FOB the instant a store's count completes.** The on-hand pull
  already fires `notified_90` (fireNow) exactly when a store crosses "believes done" — so in
  `scripts/qsrsoft-onhand-pull.mjs`, on any fireNow, dispatch `qsrsoft-pull.yml` (FOB) via the GitHub
  REST API (`gh workflow run` / `actions:write`). Marginal gain over 3×/day (hours → minutes); build
  if the owner wants instant. The dashboard's "data as of" stamp already exposes the FOB snapshot date.
