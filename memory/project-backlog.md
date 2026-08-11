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
| — | #146, #155, #156, #167 | Behind the above |

**#166 — DONE (2026-08-11, #184 dispatch item 1).** `loadMonthlyTargets`/`loadAllMonthlyTargets`
(src/lib/supabase.js) now strip null/undefined columns before returning, so a NULL column falls
through to `DEFAULT_TARGETS` on merge instead of a present-but-null key erasing it. Also dropped
the argless branch's untiebreaked `.limit(27)` (confirmed dead — all 3 real callers pass an
explicit year/month). 6 new tests in `src/__tests__/monthly-targets-null-strip.test.js`.

**#174 — PARTIALLY DONE (2026-08-11, #184 dispatch item 2): tPark/tOepe persist, priority pair
only.** `monthly_targets` gained `park_pct`/`oepe_target` columns
(`supabase/schema-monthly-targets-park-oepe.sql` — **owner needs to run this against the live
project**, no DDL access from this sandbox), `parseMonthlyTargets` gained column-detection for
them, and `saveMonthlyTargets`/both loaders round-trip them. `tKvst`/`tKvsu`/`tR2p`/`tOsat`/
`tOsatB2B` are NOT done — still a follow-up. `tLabor` deliberately NOT persisted (held for #164).
**Correction to the issue's premise, found while implementing:** its quoted code excerpt
(`src/parsers/index.js:783-800`) is `parseYearlyTargets`, not `parseMonthlyTargets` —
`parseMonthlyTargets` had no column-detection for Park/OEPE/KVS/R2P/OSAT at all before this
change (verified by reading its column map, not assumed). The structural gap the issue flagged
(no cloud path for 4 of 6 scored targets) was real independent of that mislabel. **Still
unverified**: whether the real monthly workbook actually has Park/OEPE columns — the new
detection reuses `parseYearlyTargets`'s proven header strings as the only available evidence;
if the monthly sheet's headers differ, extraction silently finds nothing (same no-op-if-absent
behavior every other field here already has). Owner should confirm against the real file. 8 new
tests across `monthly-targets-park-oepe.test.js` (parser) and
`monthly-targets-park-oepe-roundtrip.test.js` (parse→save→load).

**#183 — DONE (2026-08-11, #184 dispatch item 3).** OEPE switched app-wide to the w/o-park
formula `graded-visits.js` already had — `loadQsrActSummary` (supabase.js) was still computing
the WITH-parked-time variant, so the same metric name meant two different numbers depending on
the panel. New `src/utils/oepe.js` is the one shared definition now (`oepeSeconds` w/o-park,
`oepeWithParkSeconds` kept as a named diagnostic, never scored). Required a new
`qsr_daily_activity_rollup.dt_heldtime` column
(`supabase/schema-qsr-rollup-dt-heldtime.sql` — **owner needs to run this**) and
`scripts/qsrsoft-dar-pull.mjs` now sums it; historical rows outside the pull's normal window
need a one-time `QSRSOFT_DAR_FORCE_FULL=1` run to backfill, or age out naturally. `tOepe` (the
target) is deliberately unchanged per the #185 measurement (switching bases moves 1 store, not
the district). 6 new tests in `src/__tests__/oepe-shared.test.js`.

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

3. **#181 — SUPERSEDED, then DONE (2026-08-11, #184 dispatch item 4).** ⚠️ This entry
   previously said "DEFERRED — ship the over-target taper, revisit under-target later." That
   was the decision for about an hour, in the same conversation, before the owner explained
   what parking is actually FOR ("keep the wheels moving... park cars with complex orders or
   other operational barriers") and a measured park%-vs-OEPE quadrant followed. **The taper
   was never the final call — it was superseded before this file was updated to say so, which
   is exactly the gap this bullet exists to close.** Final decision: **park is removed from
   `computeOpsScore` entirely**, not retuned — reverts #180's asymmetric band and the taper
   design in the same issue. Replaced with a park% x OEPE-w/o-park quadrant diagnostic
   (`engine/park-oepe-quadrant.js`, Signals panel → 🅿️ Park × OEPE tab), district medians
   recomputed per period. Why: the district's heaviest parkers (Elgin 30.5%, Ponce de Leon
   33.6%) also beat the median on flow — the tool working as intended — while several near-zero
   parkers sat at/below median flow too, refuting "under-parking always stalls the line." A
   single-axis band scores both groups as failures; both are fine. `mode:'any'` zero-handling
   from #150 stays (needed for the diagnostic). `parkMaxPts`'s points are redistributed
   automatically by `computeOpsScore`'s self-normalizing `score/max*100` — removing a component
   from `max` proportionally increases the others' weight with no separate redistribution code
   needed. **Standing rule this session wrote down because of this exact miss: when a decision
   recorded in `memory/` changes, amend the file in the same turn it changes — not at the end
   of the session.**
4. **The "targets describe history, not a standard" finding — now only about OEPE.**
   `r(tOepe, actual) = 0.897` (#183); only 4 of 27 stores meet their OEPE target — worth a
   deliberate standards conversation. The matching `tPark` finding (`r=0.890`, #181) is now
   moot for scoring since `tPark` is no longer a scored target at all (see #3 above) — it may
   still matter for #174's monthly-upload persistence, which is unaffected by this.

### Measured facts from this session worth not re-deriving

- `monthly_targets` is healthy: 27 populated stores/month back through May 2026 (April: 20).
  The 7 extra rows per month (`1291, 16392, 17750, 2010, 2370, 2510, 2920`) are all-null and
  **none appear in `DEFAULT_TARGETS`** — closed/sold locations and/or org-structure rows from
  the upload. Proven benign, not inferred. Don't re-investigate.
- `computeCtrlScore` reads **no per-store target at all** — it grades entirely on the
  district-wide `settings.scoring` thresholds. Controls Score does not move when targets change.
- ⚠️ STALE, corrected 2026-08-11: as of #174 item 2 + #181, `computeOpsScore` grades **five**
  target fields (park removed). `tTpph`, `tPark`, `tOepe` now have a `monthly_targets` path
  (`tPark` no longer feeds scoring, but still persists for the quadrant diagnostic and #174's
  own purpose). `tKvst`/`tKvsu` still have no monthly path — that's the still-open follow-up
  #174's decision comment scoped as lower priority.
- `buildStore` has exactly **one** caller (`App.js:2920`). `coaching.js` imports it and
  `buildBrief` and calls neither — dead import.
- **Park is operational choice, not physical constraint** (measured 2026-08-11, 90d DAR +
  `store_vlh_config`): DT configuration does NOT predict park rate — `single_1booth` stores park
  LEAST (1.56% vs `single_2booth` 12.38%, `side_tandem` 10.88%), the opposite of the
  single-lane-needs-more-parking theory. Volume doesn't predict it either (`r = -0.135`). So a
  common park standard is defensible and no store has a structural excuse. Don't re-run this.
- **OEPE w/o Park is reconciled and settled** (2026-08-11, QSRSoft Service report, 27 stores ×
  10 days): subtract `dt_heldtime`, keep all cars in the denominator — `graded-visits.js:86`'s
  formula. `r(our gap, QSRSoft gap) = 0.9958`. The alternative (drop held cars from the
  denominator too) is ruled out. Don't re-derive this.
