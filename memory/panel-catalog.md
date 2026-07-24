---
name: panel-catalog
description: LIVE synopsis of every panel/view in Meridian — label, modal id, permission, one-line purpose, data source, and status. Maintained by Claude; update on every panel add/rename/remove. Source of truth for the menu-consolidation (Notes 24) and for fast "where does X live" lookups.
metadata:
  node_type: memory
  type: project
---

# Meridian Panel Catalog (live) — as of v4.511 (2026-07-24)

> **Now also in-app:** a user-friendly version ships as the **"Panel Index"** Knowledge Base
> article (`KB_ARTICLES.panel_index` in `src/engine/forecast.js`, category "App Guide", v4.511).
> Keep the two roughly in sync — THIS file is the exhaustive dev reference (modal ids / perms /
> sources); the KB article is the plain-language user synopsis.

> **Task B (per-station hours+cost) VERIFIED IN PROD 2026-07-24:** LifeLenz per-job pull ran
> clean — **1079/1079 role-rows saved across 27 stores × 4 weeks, zero GraphQL errors** after
> the query fix (v4.509). DeFuniak spot-check sane (Drive Thru 535.25h/$7,916/82 shifts, correct
> Variable/Floor/Fixed categories). `trigger-dar-sync` edge fn redeployed → Sync buttons fixed.

**How to read:** `Label` (`modalId`, `perm-key`) — purpose · *source* · status.
Nav lives in `src/app/shell.js`; modal routing in `src/app/App.js`.
Count: ~68 nav entries across 6 groups — this is the consolidation target (see Notes 24 →
`memory/notes-24-ux-architecture.md`). **Keep this file current on every panel change.**

Permission keys: `analytics.store/district/labor/brief/forecasting/ai/dashboard`, `reviews.view`,
`settings.view`, `data.upload`. `pis` = shows in beta; `pi` = hidden in beta (Test Kitchen).

---

## DAILY
- **Home** (`command`) — command center / landing; KPI overview + entry to everything. *ds cloud streams*. ✅
- **Needs Attention** (`attention`) — auto-flagged stores/metrics needing action; badge count. *derived*. ✅
- **Daily Brief** (`morning-brief`, analytics.brief) — Morning Brief KPI summary for the day. *At-A-Glance sources*. ✅
- **Date-Range Report** (`report`) — ad-hoc report over any date range. *ds*. ✅
- **Events & Tags** (`events`) — known-events/promo calendar + tagging that feeds forecasts & Smart Targets. *user_events*. ✅

## PERFORMANCE
- **Org Summary** (`operator-summary`, analytics.district) — org/district-level rollup scorecard. *derived*. ✅
- **Store Scorecard** (`ranking`, analytics.store) — per-store ranking across KPIs. *derived*. ✅
- **Performance Reviews** (`perf-reviews`, reviews.view) — modular weighted GM/mgr reviews; scoring engine (the seed for a future general form-builder). *Supabase*. ✅
- **Targets** (`unified-targets`, analytics.store) — monthly targets, Supabase-persisted. *monthly_targets*. ✅ **[Planning-hub merge]**
- **Monthly Projections** (`monthly-proj`) — per-store monthly projection + patch rollups. *forecast engine*. ✅ **[Planning-hub]**
- **Pace to Target** (`pace-target`) — MTD actual vs official target + pace/run-rate. *actuals + targets*. ✅ **[Planning-hub]**
- **Yearly Projections** (`yearly-proj`) — annual projection view. *forecast engine*. ✅ **[Planning-hub]**
- **Smart Targets** (`smart-targets-v2`) — median-of-simple recommended targets + backtest; multi-metric. *`src/features/smart-targets`*. ✅ **[Planning-hub]**
- **Labor Analysis** (`labor-analysis`, analytics.store) — weekly FLH/Band-1 (VLH/Fixed/Floor) derived from `lifelenz_schedule`; dollar-weighted subtotals. *`src/engine/labor-analysis.js`*. ✅ **[Scheduling-hub]**
- **Employee Skill Levels** (`skills-matrix`) — per-employee cross-training/skill matrix. *LifeLenz `employmentRoles`*. ✅ **[Scheduling-hub]**

## OPERATIONS
- **Labor Analytics** (`labor-analytics`, analytics.labor) — TPPH, labor%, OT, Act-vs-Need (Controls/Billable-Sales). *ctrlRows/DAR*. ✅ **[Scheduling-hub]**
- **Scheduling** (`scheduling`, analytics.store) — scheduling intelligence panel. *LifeLenz*. ✅ **[Scheduling-hub]**
- **Schedule Summary** (`sched-summary`) — LifeLenz weekly band across ALL stores (Labor%, Sales/GC fcst, Sched vs Fcst hrs, TPMH, **Fixed%/Floor%/F+F%**) + **per-station hours & cost** (expand). *`lifelenz_schedule` + `lifelenz_job_hours`*. ✅ **[Scheduling-hub]** (v4.506–4.509)
- **Food Cost** (`fob-analysis`, analytics.store) — FOB/food-cost analysis. *qsr_fob / FOB Excel*. ✅
- **End of Month** (`fob-eom`) — per-store EOM inventory troubleshooter. *FOB*. ✅
- **EOM Supervisor** (`eom-summary`, analytics.district) — supervisor EOM rollup. *FOB*. ✅
- **Guest Voice** (`smg-voice`) — SMG VOICE CSAT: Comments tab + FullScale scorecard (OSAT≥90, Acc B2B≥95). *SMG PDF/Excel + smg_voice_performance*. ✅
- **3PO Delivery** (`delivery-mix`) — third-party/delivery channel mix. *salesLedger/glimpse*. ✅
- **Promo / Discount ROI** (`promo-roi`) — matched-day promo/discount lift vs give-away @ incremental margin; per-store verdicts. *glimpse(promo)+cash(disc)*. ✅

## ANALYTICS
- **Signals** (`signals`, analytics.store) — LiveOps tracking-to-plan ($+guests), baseline anomalies, Speed-of-Service, Signal Lab, **Scanner** (auto-correlation, FDR guardrails), metric registry (`src/engine/signal-registry.js`). *qsr_daily_activity + cloud streams*. ✅
- **DT Speed of Service** (`dt-sos`) — drive-thru SOS by station/daypart. *DAR*. ✅
- **Graded Visits** (`graded-visits`) — PACE graded-visit data/parser (CFV/RGR/EcoSure). *graded-visits parser*. ✅
- **Visit Readiness** (`visit-readiness`) — predicted PACE readiness score (Speed35/Acc30/Qual20/Lead15) + food-safety flag + drivers. *`src/engine/visit-readiness.js`*. ✅
- **SAGE** (`sage`) — AI advisor (Opus, streaming, live tools, RBAC-scoped); minimizable, history, prompt library + scheduling. *`sage-chat` edge fn*. ✅
- **Feature Requests** (`feature-requests`) — Supabase-backed roadmap/requests. *feature_requests*. ✅ ⚠️ *(owner adds items here; Claude can't read from repo)*
- **Task Queue** (`task-queue`) — data-pull/issue ticket queue. *Supabase*. ✅ ⚠️ *(same)*
- **Forecast Brief** (`brief`, analytics.brief) — pre-forecast analysis of the upcoming period. *forecast engine*. ✅
- **Market Intelligence** (`loc-intel`) — location intel + weather/market context. *external*. ⚠️ *(weather reported not showing — Notes)*
- **District View** (`district`, in-view) — district-wide rollup view. *derived*. ✅
- **Store One-Pager** (`one-pager`) — single-store summary sheet. *derived*. ✅

## ⚗ TEST KITCHEN (experimental / dev-gated; hidden in beta) — **primary consolidation + prune target**
Forecast/projection cluster (heavy overlap — candidates to merge into Planning-hub or retire):
- **Projections** (`proj`, forecasting) — projections workbench. · **Proj Workflow** (`proj`) — *same modal id* (redundant nav entry). · **Proj vs Actuals** (`pvsa`). · **Forecast Models** (`model-assign`). · **DI Calibration** (`dialedin`). · **Forecast Accuracy** (`fcst-accuracy`). · **DI Compare** (`dicompare`). · **Fcst Reference** (`fcst-ref`). · **LifeLenz Gap** (`lfz-gap`) / **LifeLenz Bridge** (`lifelenz-bridge`).
- AI: **Anomaly Scan** (`aiscan`) · **Why Engine** (`why-engine`) · **Priority Actions** (`priority-brief`).
- Store/analytics experiments: **Record Days** (`record-day`) · **Revenue** (`revintel`) · **Inventory** (`inventory`) · **Performance Calc** (`perf-calc`) · **Metric Correlations** (`corr-explorer`) · **Store Compare** (`compare`) · **GM Letters** (`gm-brief`) · **Channel Intel** (`channel-intel`) · **DAR Analysis** (`dar-daypart`) · **Product Mix** (`pmix`) · **District Lens** (`district-lens`) · **Calendar Manager** (`calendar-manager`, dashboard).
→ Action: triage each as **promote / merge / retire**; several duplicate shipped panels (e.g. `proj` ×2, Inventory also implied in Ops, Calendar Manager overlaps Events & Tags).

## ADMIN
- **Settings** (`settings`, settings.view) — app settings; **target home for retired top-bar items** (Notes 24). ✅
- **Changelog** (`about`) — version history (MERIDIAN_CHANGELOG in App.js). ✅
- **Knowledge Base** (`kb`) — in-app docs/help; **extend into the docs repository** (Notes 24 #3a). ✅
- **Data Manager** (`data-manager`, data.upload) — uploads + in-app Sync buttons (dispatch pull workflows). *all sources*. ✅
- **Save Session** / **Restore Session** — session file save/load; **move into profile menu** (Notes 24 #1). ✅
- **Help** (`help`) — help modal. ✅

---

## Consolidation shortlist (cross-ref Notes 24)
1. **Planning hub** ← Targets + Monthly Projections + Pace to Target + Yearly Projections + Smart Targets (+ Test-Kitchen forecast cluster as advanced tabs). Kills the biggest overlap.
2. **Scheduling hub** ← Labor Analysis + Scheduling + Schedule Summary + Labor Analytics + Employee Skill Levels → new **Labor & Scheduling** category.
3. **People/HR** ← Performance Reviews + Visit Readiness + Graded Visits (+ future coaching).
4. **Prune Test Kitchen**: dedupe `proj` ×2; fold Calendar Manager into Events & Tags; promote or retire the forecast-diagnostic panels.
5. **Docs**: grow Knowledge Base into the on-demand docs repository; surface THIS catalog in-app as the "Panel Index."
