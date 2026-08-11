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

---

## Live PM queue as of 2026-08-11 (end of the targets/scoring session)

Written down because a session's task list dies with the session and this queue was
reordered twice in one evening on measured evidence. **GitHub issues are the source of
truth**; this is the ordering and the reasoning, which the issues don't carry.

| # | Issue | Why here |
|---|---|---|
| 1 | **#164** — labor-basis rollout, 69 `t.tLabor` readers | Live correctness. 20 of 27 stores are graded on a labor % the owner never approved; Ponce de Leon 43701 is graded 26.00% against an approved 24.00% — 2.00pp on a metric whose whole tolerance band is 2pp. #163 already delivers `tCrewLabor` into `mergedTargets` and **nothing reads it**. Resolver half-built and preserved on branch `labor-basis-resolver-deferred` (`a14a1b8`) — do not rebuild it. |
| 2 | **#150** — `kvsHealthy`/`park` zeros discarded, park graded lower-is-better | Live, user-visible wrong. Body was corrected 2026-08-10 (the original text had park's polarity backwards) |
| 3 | **#157** — Spine 1 step 3 | Resumes the UX-coherence spine |
| — | #146, #155, #156, #166, #167 | Behind the above |

### Two items the owner explicitly asked not to lose (2026-08-11)

1. **#154 — LifeLenz AOS. Needs an owner decision: rescope or close.** Its premise was
   retracted — `laborTargetOrg` is column L of `MBI_Labor_Analysis.xlsx` (owner-built,
   hand-typed at upload), **not** the AOS "Maximum labor cost percentage" as the PM
   claimed. Two of its three stated benefits evaporated with that. What survives is real
   but much smaller: AOS currently builds schedules against a flat 22% across all seven
   days that the owner didn't know was set. The basis question is closed (crew hourly,
   confirmed by the owner and by a "Skip scheduling Managers" screenshot), and LifeLenz
   support confirmed the AOS value *"is not treated as an official reporting target…
   mainly a guideline for schedule generation."* **It should not be picked up as filed.**
   Standing constraint if it is ever rescoped to a write: any AOS write would be the first
   write Meridian makes to a production scheduling system — stage it read shape → one store
   by hand → one store via API → rest. Never a 27-store script first.
2. **#167 — did the discarded-targets bug also hit Projections?** `sales_proj` is populated
   for all 27 stores (Durant $668,158) and maps to `tProdSales`, which `computeOpsScore`
   never reads. #153 proved one consumer of these targets was silently reading the wrong
   object for months; nobody has checked whether Projections resolves them correctly or has
   its own path. Note `analytics.js:7777/7900/8051` call `loadMonthlyTargets(year, month)`
   while `App.js` calls `loadAllMonthlyTargets()` — two different paths, reason unknown.
   **Do not assume it's fine. #153 was found because someone assumed exactly that.**

### Measured facts from this session worth not re-deriving

- `monthly_targets` is healthy: 27 populated stores/month back through May 2026 (April: 20).
  The 7 extra rows per month (`1291, 16392, 17750, 2010, 2370, 2510, 2920`) are all-null and
  **none appear in `DEFAULT_TARGETS`** — closed/sold locations and/or org-structure rows from
  the upload. Proven benign, not inferred. Don't re-investigate.
- `computeCtrlScore` reads **no per-store target at all** — it grades entirely on the
  district-wide `settings.scoring` thresholds. Controls Score does not move when targets change.
- Of `computeOpsScore`'s six target fields, only `tTpph` has a `monthly_targets` path today.
  `tKvst`/`tKvsu`/`tOepe`/`tPark` have no monthly path at all.
- `buildStore` has exactly **one** caller (`App.js:2920`). `coaching.js` imports it and
  `buildBrief` and calls neither — dead import.
