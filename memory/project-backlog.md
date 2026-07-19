---
name: project-backlog
description: Feature backlog — live checklist, updated every sprint so it stays accurate
metadata:
  node_type: memory
  type: project
  originSessionId: 5b414dcb-fdd6-4da2-ac88-7ae8b2b824d9
---

> **Rule:** Mark items ✅ the same commit they ship. Update CLAUDE.md Top Priorities to match.

## All "sprint" items — DONE as of v4.369

- [x] Data Manager: sync schedule + last-synced timestamp
- [x] Morning Brief: district hourly pace vs mean (TodayPaceCard)
- [x] Store Dashboard: daypart card from qsr_daily_activity (DaypartPaceCard, today/yesterday, vs mean/LY/proj/DT)
- [x] Signals: LiveOps tab using qsr_daily_activity
- [x] Morning Brief: email pipeline (glimpse/cash) wire-up + per-device localStorage fix (v4.365–368)
- [x] Projections: QSRSoft proj_sales_dollars baseline column (v4.369)
- [x] FOB / Food Cost panel — "Food Cost" + "End of Month" in nav, FOBAnalysisPanel + FOBEOMPanel
- [x] Supabase persistence — fobRows, opsRows, ctrlRows, smgFullscale all have save/load (v4.301)
- [x] Operator Summary: Patch/Operator/Org group selector already present
- [x] CLAUDE.md + backlog updated to reflect actual state

## Next: Higher complexity items

- [x] **MAPE at daily level** — already done in ForecastAccuracyPanel (analytics.js:2894). QSRSoft proj vs actual is the `qsr` column. Three-way includes LY Adj, AI, Blend, Dialed-In, QSRSoft MAPE. Requires running backtest — not real-time.
- [x] **`forecast_snapshots` table** — v4.374. Table SQL in schema.sql, save/load in supabase.js, backtest auto-upserts per-day rows. ⚠️ User must run schema.sql block in Supabase SQL Editor to create table.
- [x] **DT Speed-of-Service Analytics panel** — v4.371. 🚗 nav item under Signals. loadDtHistory(), 30/60/90d period, store ranking, hour-of-day table, FL/OK filter.
- [x] **SAGE tool use** — v4.373. query_daily_activity + query_lifelenz_labor tools. Streaming-first: text streams immediately, tool calls run server-side. Live "Querying…" status indicator in UI.
- [ ] **Info icon scraper** — Playwright → each QSRSoft report page → click ℹ → extract field definitions → qsr_field_definitions table. Powers tooltips + SAGE context.
- [ ] **Field dictionary** — src/constants.js: DB column → QSRSoft display label → description
- [x] **SMG VOICE thresholds** — v4.375. OSAT/Top-2/OSAT B2B → 90%, Accuracy B2B → 95%, Any Problem → 10%, avgStd → 4.5. Settings key bumped to v2.
- [x] **Performance Reviews** — v4.376. Wage inputs now use dollar formatting (FormattedNumInput). Print, blank form, and 1:1 checkpoint were already implemented.
- [x] **Data policy statement** — v4.377. Fixed-bottom banner, dismissed via mf_data_policy_v1 in localStorage. States data stored in Supabase, authorized access only, no third-party sharing.
- [x] **Beta/Release mode flag** — v4.378. Non-developer roles auto-get betaMode=true (Test Kitchen hidden) on first login. 🛠 Dev settings tab now developer-only. Data tab shown to admin+developer.

## Strategic notes
**DAR data enables (not yet built on):**
- MAPE: three-way Meridian forecast vs QSRSoft projection vs actual (daily)
- DT Speed-of-Service panel: 90-day cross-store trend from dt_untilserve
- SAGE tool use: answer "how is today tracking?" with live Supabase data
- Labor-adjusted forecasting: LifeLenz scheduled hours + DAR needed hours → throughput model
