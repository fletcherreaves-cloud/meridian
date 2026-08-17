# Meridian Project Memory — Master Index

> Read this to discover what's documented. **Newest work is at the top.** When resuming a
> session, read the most-recent handoff first, then the relevant thread files.

## 🛑 BEFORE YOU THEORIZE ABOUT DATA — these questions are already answered

**Added 2026-08-16 because rediscovery, not bugs, was the largest single cost of that day's work.**
Three separate re-derivations in one day, each of an answer already sitting in this directory:
`#243` re-proposed from scratch what `#327` then built (four days apart, same two atoms); a PM
day-boundary theory was written into CLAUDE.md and refuted an hour later by a file from 08-07; and
`#330`/`#331` were filed twice, twelve seconds apart, by two agents who couldn't see each other.

None of that was carelessness. **`dar-vs-ops-reconciliation.md` was not in this index** — 43 of 124
memory files weren't. The answer existed and nothing pointed at it.

| If you are about to ask… | Read this FIRST | It already says |
|---|---|---|
| "Is the DAR aligned to the 4am business day?" | [dar-vs-ops-reconciliation.md](dar-vs-ops-reconciliation.md) | **Yes — measured 08-07.** `hour_slot` runs `05:00→28:00` = 04:00→04:00. Boundary RULED OUT as the cause of DAR-vs-Ops deltas. Also: deltas are ~0.01% **only on days with a complete 24 slots** |
| "Which labor % basis do we use, and does it include managers?" | [project-labor-pct-punched-vs-crew.md](project-labor-pct-punched-vs-crew.md) | Standardized on **Punched (all-hourly)** so FL and OK compare like-for-like. Crew Labor % silently includes salaried-manager $ where a store is configured that way (**FL is, OK isn't**). *"Read before touching any labor-basis code"* |
| "What's the 4am cutover helper?" | `src/utils/date.js:101,117` (code, not memory) | `businessDate()` / `lastClosedBusinessDay()`. Consolidated after recurring **five times** as signature #4 — see [plan-data-integrity-sweep.md](plan-data-integrity-sweep.md). Never re-derive inline |
| "Can I verify this from a sandbox session?" | [feedback-verification-in-sandbox.md](feedback-verification-in-sandbox.md) | The working Playwright/Chromium recipe, the CORS hard stop, and the merge-resolution class the suite does NOT catch |
| "Is this metric averaged correctly?" | [weighted-rollup-audit.md](weighted-rollup-audit.md) | Full average-of-averages sweep — what was fixed, what was already right, what was left alone and why |
| "Does the hourly projection have a known bias?" | [project-hourly-projection-accuracy.md](project-hourly-projection-accuracy.md) | Corroborates the 4am/`hour_slot` mapping independently (`:81`) |

**The discipline this encodes:** CLAUDE.md's *"check whether an affordance already exists before
adding one"* covers code. It applies just as hard to **explanations**. Search `memory/` and
`src/utils/` before writing a mechanism into any durable doc — the grep that refutes you costs
seconds, and the theory that survives one costs a PR.

## ⭐ READ FIRST — latest handoff & vision
- **⭐ [Normalization plan 2026-08-17](plan-normalization-2026-08-17.md)** — **NEWEST plan.** Where the
  app gets normalized against industry norms and against itself: forecast off the render path
  (`weekProjections` = 93% of render time), event scope+recurrence instead of 27 copies of one event,
  pipeline freshness/assertion contract, **design-system adoption** (`PanelControls.js` measured at
  **0/55** panels for `DateRangeControl` and **1/55** for `LocationSelector`/`ActionMenus` — the
  standard exists and is unused), routing-vs-modals, and **role-based voice** (say the number AND the
  decision; preserve analytical depth). Carries the sequencing gate, an explicit what-NOT-to-do list,
  and 8 advisory notes on running this solo.
- **⭐ [PM handoff 2026-08-15](pm-handoff-2026-08-15.md)** — **NEWEST handoff. Start here if you are taking the
  PM seat.** The PM/engineer arrangement and its disciplines, the live PR board (#298/#301/#297 awaiting
  review; #292/#286/#269 held and why), the engineer dispatch order, the owner's action list, the three
  Product Mix / `user/settings` captures and what they settled, PM debts not yet filed, the McValue FBP
  deadline (25 Aug), the corrections register, and the security constraints.
- **[Session handoff 2026-07-28](session-handoff-2026-07-28.md)** — MASTER handoff: everything
  shipped this session (v4.535–544), locked decisions, the next task (build QSRSoft pull scripts),
  access/settings, and pending items. **Start here after a session switch.**
- [Vision & roadmap](vision-and-roadmap.md) — ⭐ north-star, Smart Targets Model v2, accuracy-integrity
  system, deployment paths, prioritized roadmap.
- [North-star discovery lens](north-star-discovery-lens.md) — bridge QSRSoft's gaps, don't clone it;
  correlations, real-world decision trees, "learn and burn."

- [Docs + changelog refresh TODO](docs-refresh-todo.md) — owed after the v4.856–v4.875 sprint;
  lists exactly what is stale in the in-app changelog, CLAUDE.md and the panel catalog

## 🗂 Owner "Notes" working queues (most recent = most relevant)
- **⭐ [Panel decisions 2026-08-10](decisions-panel-inventory-2026-08-10.md)** — owner's keep/merge/retire
  call on all 97 panels; **the input the UI/UX redesign scopes from.** Carries the standing rule that
  RETIRE means harvest-then-remove, never delete-on-sight.
- [Notes 63 queue](notes-63-queue.md) — multi-user startup-load architecture answer, Needs Attention
  structural gap (no sales-decline detector — Atoka), Food Cost Panel RLS root cause, EOM Change
  Monitor qty-variance + case-conversion, scoring-system revisit (Ops/Controls/District/Model Health),
  Swing Watch "acknowledged" home, Events & Tags duplicates
- [Notes 62 queue](notes-62-queue.md) — SAGE capability audit, Event Tags panel, 1382ms click bug, 1.2M% chart bug
- [Notes 61 queue](notes-61-queue.md) — mobile perf, District View pass, the Resolver engine concept, SMG definitions
- [Notes 60 queue](notes-60-queue.md) — large triage: shared panel design system + cycle-agnostic engine spines,
  concrete bugs, new capabilities, naming
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

## 🎯 Scoring
- [Ops Score attribution: #183/#181/#164](labor-park-oepe-score-attribution.md) — worked
  four-stage before/after (baseline → OEPE fix → park removal → labor basis fix) showing which
  fix moves a store's Ops Score by how much and why. Synthetic performance numbers, real targets.

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

## 🖱 UI / UX defects
- [Modal/scroll sizing defect (#192 P1)](project-modal-scroll-defect-192.md) — the "one shared
  ModalShell bug" framing was wrong (none of the 5 reports actually use ModalShell); records the
  4 real, separate mechanisms and the guard test that found the anti-pattern was 4x more
  widespread than reported.

## 📦 Inventory
- [Inventory auto-wiring (#214)](project-inventory-auto-wiring-214.md) — wired the Inventory
  Intelligence panel (Service/Production/Overstock/Transfers) to qsr_inventory_summary,
  auto-first with manual gap-fill. Key finding the issue's own body missed: the table has
  NO producer script yet (confirmed via grep) — the wiring is correct and load-bearing the
  moment a pull ships, but shows honest "no cloud data yet" today. Folded in #207 batch-2's
  first item (inventory.js → lazyPanel, ~10.4KB gzip reclaimed) since it required splitting
  parseInventoryData out to parsers/inventory-parse.js anyway.

## 🎯 Coaching spine (Push 3: #209 → #210 → #208)
- [Waste-entry data-discipline (#209)](project-waste-discipline-209.md) — the trust leg.
  Derives each store's OWN expected waste-submission days-of-week from 8 weeks of observed
  qsr_waste history (reuses count-cycle.js's measured COVER_FRAC=0.75, not a new guess),
  flags recent gaps, estimates $ impact landing in Unexplained. "Missing != zero" throughout —
  qsr_waste has no null-vs-zero column. New engine/waste-discipline.js, new
  metric-source.js isLazyFillError() export, surfaced in FOBAnalysisPanel.
- **⭐ [Coaching feedback loop v1 (#208)](project-coaching-loop-208.md)** — the verify leg,
  the only genuine differentiator on the table per the owner. New coaching_cycles table
  (owner needs to run the migration), engine/coaching-loop.js (5 rules enforced
  structurally: auto-captured baseline, follow-up lands in Needs Attention as a new
  coaching-review item type, starts from an existing finding, verdict measured via a
  NOISE_THRESHOLDS map that ships EMPTY per the issue's own v1 fallback — every verdict is
  null until a future session runs measure-coaching-noise-threshold.mjs). Real correctness
  fix found while building: that noise-threshold script's FOB math was a mean of daily
  ratios, not dollar-weighted — fixed to match computeFOBMetrics' own convention. New
  src/views/coaching-modal.js (start/review), Patch Heatmap FOB/Labor "🎯 Coach" buttons,
  Needs Attention "🎯 Log Verdict →" action.
- [Labor gap split (#210)](project-labor-gap-split-210.md) — the diagnose leg. Splits the
  combined actual-vs-needed labor gap into planning accuracy (scheduled-needed, coach the
  scheduler) and execution (actual-scheduled, coach the shift manager). Found and fixed a real
  gap: loadQsrActSummary never carried total_scheduled_hours through on either read path, so
  the split was impossible from data Meridian actually read even though qsr_daily_activity
  always had it. New rollup-table migration (owner needs to run it) + engine/labor-gap-split.js
  (Wed-Tue pay week, signature #4 in-progress-day exclusion, null-vs-fabricated-zero when the
  migration hasn't landed yet). New Labor Tools tab: 🎯 Planning/Execution.
- **⭐ [Over-scheduling is a chaos problem, not a labor-cost problem](finding-overscheduling-is-chaos-not-cost.md)**
  — first finding Push 3 produced, measured within minutes of #210 going live: 21/27 stores
  grossly over-schedule (Ada 66% above need), but the district nets to only +9 hrs vs need
  (matches the Overview tile independently) because over-scheduling and mid-week cutting
  cancel — invisible on the P&L, real operational chaos the owner had suspected for years.
  Validates ranking by combined-magnitude (already shipped) and is the first case where
  "dollarize and sort by $" would be the WRONG instinct — it costs ~nothing but damages the
  operation. Coach column gate confirmed correct as-is. Open: why schedules run so high is
  still unknown; turnover_monthly correlation is the next measurable test.
- **✅ [Patch Heatmap bands + rollup tiles (#219/#220)](project-patch-heatmap-calibration-219.md)**
  — DONE. #219: owner ran the measurement script against production, found a structural bug
  (badAt is not the flag line — watch fires at 0.2*badAt, critical at 0.5*badAt), shipped
  Sales 27 / FOB 1.9 / Labor 8.8 / Speed 73 (was 15/3/3/20). #220: new patch-level rollup row,
  patchDimensions() aggregates raw dollars/sales FIRST then derives dimensions — never colours
  by worst store. Grouping via the LIVE supervisorGroups() (constants.js), not the frozen
  INV_ORG_COORDS.sup snapshot. Controls excluded from both (composite score, correctly out of
  scope). 18 new tests across both issues.

## ⚡ Performance
- [Instrument fix (#189)](project-instrument-fix-189.md) — click-trace's App-tree/AppSidebar
  spans were nested (same-commit layout effects end at one flush), not additive — a misreading
  already caught once by hand. Extended the same pattern to the 4 active-panel views and added
  automatic same-commit subtraction to the report. Not measured live; owner needs to re-capture.
- [Lazy fill + qsr_fob parallel pagination (#191)](project-lazy-fill-191.md) — auditRows now
  loads on demand instead of eagerly at startup (scoped to auditRows only, not gap-scoped —
  records why); qsr_fob switched from serial to parallel pagination. Records the 3 non-resolver
  consumer decisions and what's deliberately NOT verified live (no Supabase session here).
- [Startup render storm (#184 item 0)](project-startup-render-storm.md) — batched the 22
  ds-touching tiered-startup-loader stages behind 3 per-tier flushes (22 commits → 3); the
  ~19-commit remainder (IDB restore, org_config syncs, email/PDF auto-ingest) is enumerated but
  not yet fixed.

## 🏗 Data-refresh sprint & standards (standing rules)
- [Data-refresh sprint handoff](handoff-data-refresh-sprint.md) — the At-A-Glance freshest-wins rework.
- [⭐ Measure it, don't reason about it](feedback-measure-dont-reason.md) — **standing rule.** Diagnose by
  reproducing, not by plausibility; verify a command's output before reporting it. Real costs from 2026-08-07.
- [⭐ PM / worker split](feedback-pm-worker-split.md) — **standing rule.** Two-session arrangement: who owns
  which files (worker owns MERIDIAN_CHANGELOG, always), one task in flight, worker opens draft PRs / PM
  reviews+merges, and the PM review checklist. Written after two same-day cross-session collisions.
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
- [Performance budget + manual-sourcing audit](feedback-performance-budget.md) — speed is a feature; MANUAL_ONLY stays 0
- [Data-integrity sweep plan](plan-data-integrity-sweep.md) — greppable defect signatures + measured site counts
- `src/components/ModalShell.js` — shared modal shell (Workstream D, ✅ done v4.938–v4.939): standardizes
  the close-button/header pattern app-wide. See [[vision-and-roadmap]] Workstream D and [[notes-63-queue]].
- [PWA Share bug](project-pwa-share-bug.md) · [Backlog](project-backlog.md) · [Meridian status](project-meridian.md)

## 📇 Previously unindexed (added 2026-08-16)

**43 of 124 files were on disk but absent from this index** — measured, not estimated
(`comm -23` of the directory against every `.md` referenced here). Descriptions below are each
file's own front-matter, not a summary written after the fact. Several are cross-referenced above
in the "before you theorize" table because their absence has already cost real work.

### Data reconciliation & measurement
- [dar-vs-ops-reconciliation.md](dar-vs-ops-reconciliation.md) — why DAR-derived totals differ from the manual Ops Report, what was ruled out (**the 4am boundary WAS**), and why auto-first is still correct
- [project-labor-pct-punched-vs-crew.md](project-labor-pct-punched-vs-crew.md) — Notes 35: Labor % standardized on Punched; Crew silently includes salaried-manager $ (FL yes, OK no)
- [project-hourly-projection-accuracy.md](project-hourly-projection-accuracy.md) — tracks whether QSRSoft/LifeLenz hourly projections are systematically biased
- [weighted-rollup-audit.md](weighted-rollup-audit.md) — average-of-averages sweep, incl. what was deliberately left alone for want of a weighting basis
- [metric-inventory-2026-08-07.md](metric-inventory-2026-08-07.md) · [reference-r2p-formula.md](reference-r2p-formula.md) — R2P reconciled to the penny · [notes-57-metric-registry-plan.md](notes-57-metric-registry-plan.md)
- [project-noise-measurement-237.md](project-noise-measurement-237.md) · [project-labor-pct-tail-236.md](project-labor-pct-tail-236.md) — the 994 nulled rows (#243)
- [store-events-material-changes.md](store-events-material-changes.md) — the legitimate-gap ground truth #269's tolerance list is built on
- [project-pull-completeness-263-265.md](project-pull-completeness-263-265.md) — #263 makes a pull say so when it KNOWS it failed; #265 catches the gaps a pull never saw at all (QSRSoft had no row, nothing threw, success was reported truthfully). Neither substitutes for the other — **neither the Sulphur nor the Marietta outage would have been caught by #263 alone**

### QSRSoft / pulls / auth
- [project-qsrsoft-cognito-auth-312.md](project-qsrsoft-cognito-auth-312.md) — the #312/#323 token conversion + backfill record
- [project-product-mix-291.md](project-product-mix-291.md) — #292's design notes and next-session ordering
- [data-acquisition-shopping-list.md](data-acquisition-shopping-list.md) — every candidate endpoint, incl. addenda K (Product Outage) and L (Menu Price Comparison)
- [reference-shift-manager-summary.md](reference-shift-manager-summary.md) — per-daypart manager-on-duty attribution · [qsrsoft-kb-digest.md](qsrsoft-kb-digest.md)

### Security / RLS / infra
- [rls-table-audit-119.md](rls-table-audit-119.md) — full 82-table RLS audit; one real gap, one non-reproduction
- [session-2026-08-07-perf-and-rls.md](session-2026-08-07-perf-and-rls.md) — cold start 183s→59s, per-loc RLS after a rollback, **seven wrong assumptions caught by live queries**
- [project-security-notes.md](project-security-notes.md) — accepted-risk vs needs-fix tracker
- [attribution-validity-register-login.md](attribution-validity-register-login.md) · [project-salaried-coverage-guard-242.md](project-salaried-coverage-guard-242.md)

### Design & product threads
- [project-coaching-feedback-loop.md](project-coaching-feedback-loop.md) — the loop that turns Meridian from reporting into management
- [project-events-redesign.md](project-events-redesign.md) · [project-inventory-control-redesign.md](project-inventory-control-redesign.md) — both owner-signed-off designs
- [project-insight-ledger.md](project-insight-ledger.md) · [project-food-cost-labor-enhancements.md](project-food-cost-labor-enhancements.md) — the two P&L lines that are ~50% of sales
- [project-org-structure.md](project-org-structure.md) — supervisor→store, data-driven since v4.570, incl. the retroactive-attribution caveat
- [project-eom-scoreboard-notify.md](project-eom-scoreboard-notify.md) · [project-scoring-revisit.md](project-scoring-revisit.md) — a MEASURED divergence between two Model Health scorers
- [spine1-panel-controls-126.md](spine1-panel-controls-126.md) · [project-mcvalue-2-fbp-document.md](project-mcvalue-2-fbp-document.md)
- [project-sage-knowledge-grounding.md](project-sage-knowledge-grounding.md) — the handling-notice gate #269 deliberately did not bypass · [project-sage-manual-sourcing-270.md](project-sage-manual-sourcing-270.md)

### Process, capacity & planning
- [systemic-issues-and-next-phase.md](systemic-issues-and-next-phase.md) — **four recurring bug classes measured from 977 commits**, and the structural fix for each
- [plan-backlog-and-redesign-2026-08-15.md](plan-backlog-and-redesign-2026-08-15.md) — how the open issues collapse into a working order
- [plan-normalization-2026-08-17.md](plan-normalization-2026-08-17.md) — ⭐ the successor to the above: six workstreams (forecast off render path · event scope+recurrence · pipeline contract · design-system adoption · routing vs modals · role-based voice), the sequencing gate, and what not to do
- [feedback-verification-in-sandbox.md](feedback-verification-in-sandbox.md) — what a sandbox session can and cannot prove
- [benchmark-daily-readiness.md](benchmark-daily-readiness.md) — read before quoting any readiness number
- [capacity-and-onboarding-review.md](capacity-and-onboarding-review.md) — how many users can onboard today, and what must land first
- [mac-session-todo-2026-08-06.md](mac-session-todo-2026-08-06.md) — items that require the owner at a Mac
- [finding-padding-and-cash-hunt-2026-08-13.md](finding-padding-and-cash-hunt-2026-08-13.md)

### Owner notes queues
- [notes-33-queue.md](notes-33-queue.md) · [notes-54-56-triage.md](notes-54-56-triage.md) · [notes-66-bullseye-and-state-of-business.md](notes-66-bullseye-and-state-of-business.md) · [notes-66-staged-experiments-and-risk.md](notes-66-staged-experiments-and-risk.md)

---
*Index maintenance: when adding a memory file, add it here. Newest handoff always pinned at top.*
*Drift check — run it, don't trust the habit:*
```
comm -23 <(ls memory/*.md | xargs -n1 basename | grep -v '^MEMORY.md$' | sort) \
         <(grep -o '[a-z0-9-]*\.md' memory/MEMORY.md | sort -u)
```
*Empty output = index complete. It printed **43 filenames** on 2026-08-16 and is empty as of that
fix (125 files, 125 referenced). An index nobody can verify drifts back — run this, don't trust
the habit of "I added it."*
