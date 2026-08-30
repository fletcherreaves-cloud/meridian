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
| 1 | **#164 — DONE (2026-08-11, #184 dispatch item 5).** | Resumed from `labor-basis-resolver-deferred` (`a14a1b8`) rather than rebuilt. Migrated in 4 commits: engine (pipeline.js WATCH-LABOR/TREND-ALERT/concern, finding-rules.js dollar impact, one-pager-data.js, insights.js/eom-supervisor.js alignment), view batch 1 (store-dash.js, store-analytics.js), view batch 2 (labor-tools.js, analytics.js, at-a-glance.js, smart-targets.js), each with `npm test`+`npx vite build` clean. Invariant test (Ponce de Leon fixture) proves the score, the WATCH-LABOR text, and the finding's dollar figure now all cite the same number. Score-movement worked example in `memory/labor-park-oepe-score-attribution.md`. Deliberately NOT folded in, per the original triage: scheduling.js:445's `tJuneLaborPct` precedence (#176, item 6), labor-tools.js's unweighted-average district target (separate issue, not filed against #164), smart-targets.js's DEFAULT_TARGETS-direct-read bypass (field basis fixed; the sourcing bypass itself is a separate bug, same shape as #153's). |
| 2 | **#150** — `kvsHealthy`/`park` zeros discarded, park graded lower-is-better | Live, user-visible wrong. Body was corrected 2026-08-10 (the original text had park's polarity backwards) |
| 3 | **#157** — Spine 1 step 3 | Resumes the UX-coherence spine |
| — | #146, #155, #156, #167 | Behind the above |

**#166 — DONE (2026-08-11, #184 dispatch item 1).** `loadMonthlyTargets`/`loadAllMonthlyTargets`
(src/lib/supabase.js) now strip null/undefined columns before returning, so a NULL column falls
through to `DEFAULT_TARGETS` on merge instead of a present-but-null key erasing it. Also dropped
the argless branch's untiebreaked `.limit(27)` (confirmed dead — all 3 real callers pass an
explicit year/month). 6 new tests in `src/__tests__/monthly-targets-null-strip.test.js`.

**#174 — SHIPPED THEN REVERTED (2026-08-11, #184 dispatch item 2).** `monthly_targets` briefly
gained `park_pct`/`oepe_target` columns to give tPark/tOepe a cloud path. **Reverted the same
day** on two independent grounds: (1) the owner confirmed the real monthly workbook has neither
a Park% nor an OEPE column — the parser detection this shipped with was flagged UNVERIFIED at
the time and the verification came back negative; (2) #181 (same day) removed `tPark` from
`computeOpsScore` entirely, so even with the columns present there is no scoring consumer left
to justify persisting it. Reverted: `parseMonthlyTargets`'s column-detection, `saveMonthlyTargets`/
both loaders' park_pct/oepe_target read-write, the `monthly_targets` schema columns, the
standalone migration file (deleted — never run against the live project, so no data migration
was needed), and the two test files that covered it. `tKvst`/`tKvsu`/`tR2p`/`tOsat`/`tOsatB2B`
were never started and remain a possible future follow-up if a concrete need arises — not
queued. `tOepe` is unaffected by the revert (#183 already settled it stays unchanged, and it
was never actually populated by this persistence work either way, since the workbook column
doesn't exist).

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

**#176 — DONE (2026-08-11, #184 dispatch item 6, final item).** `tJuneLaborPct` retired per
the issue's own decision comment: it was redundant with the approved `tCrewLabor` (both trace
to the same organizational target, arriving via two different workbooks) and it outranked the
approved value in two fallback chains — `scheduling.js:445` and `morning-brief.js:352` both put
it first, so Scheduling and Morning Brief graded against stale June-upload data whenever no
fresher Projections file had been uploaded that session. Three changes, sequenced per the
decision: (1) both readers now call `resolveLaborTarget()` (#164's resolver) instead of reading
`tJuneLaborPct`/`tLabor` by name — removes the special-case precedence without touching the
data path; (2) `applyProjectionsToTargets` (`parsers/index.js`) no longer writes a labor % into
`DEFAULT_TARGETS` — the raw parsed value is still preserved unmutated in `ds.projRows` (already
existed, no consumer today) if a future ranked layer is ever wanted; (3) the `tJuneLaborPct:X,`
key removed from all 27 seed-constant lines (`constants.js:37-63`). **Left alone, per the
issue's explicit "check siblings before touching" warning:** `tJuneProj`/`tOperatorProj`/
`tQSRSoftProj`/`tJuneTpph` still ride the same `applyProjectionsToTargets` mutation and the same
constants.js seed block — `tJuneProj`/`tOperatorProj`/`tJuneTpph` have live readers in
`morning-brief.js` (lines 293/342/348) that were not audited this pass; `tQSRSoftProj` appears
to have none but wasn't confirmed either. None of the four were touched. `DEFAULT_TARGETS` is
still mutated at runtime for those three fields — the issue's point 2 (stop mutating the module
constant) is only resolved for the one field this issue scoped.

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
   what parking is actually FOR (*"keep the wheels moving and increase capacity… by parking
   cars with complex orders"* / other operational barriers) and a measured park%-vs-OEPE
   quadrant followed. **The taper was never the final call — it was superseded before this
   file was updated to say so, which is exactly the gap this bullet exists to close.** An
   earlier correction (#188) fixed the stale text on `main` after it caused a real
   contradiction the engineer had to stop and query; this entry folds that correction in and
   carries it forward. Owner sign-off 2026-08-11: *"#181, you have my sign off."*

   Final decision: **park is removed from `computeOpsScore` entirely**, not retuned — reverts
   #180's asymmetric band and the taper design in the same issue. Replaced with a park% x
   OEPE-w/o-park quadrant diagnostic (`engine/park-oepe-quadrant.js`, Signals panel → 🅿️ Park ×
   OEPE tab), district medians recomputed per period. **Why no band, in one line:** both tails
   of park% contain healthy stores — Elgin (30.5%) and Ponce de Leon (33.6%) park most *and*
   beat median flow (the tool working as intended), while Cottondale (2.1%), Lindsay (1.2%),
   Purcell (2.4%) park almost nothing and are at or better than median too — refuting
   "under-parking always stalls the line." A single-axis band scores both groups as failures;
   both are fine. `mode:'any'` zero-handling from #150 stays (needed for the diagnostic).
   `parkMaxPts`'s points are redistributed automatically by `computeOpsScore`'s self-normalizing
   `score/max*100` — removing a component from `max` proportionally increases the others'
   weight with no separate redistribution code needed. The `tPark` re-baseline is no longer a
   prerequisite for scoring (nothing scores `tPark` any more).

   **PM error worth not repeating, and the standing rule it produced:** the deferral was
   committed to a memory file, then superseded by a later decision in the same session, and the
   file was never updated. A committed memory file that contradicts the live decision is worse
   than no file — it is authoritative-looking and wrong. **When a decision recorded in
   `memory/` changes, amend the file in the same turn the decision changes**, not at the end of
   the session.
4. **The "targets describe history, not a standard" finding — now only about OEPE.**
   `r(tOepe, actual) = 0.897` (#183); only 4 of 27 stores meet their OEPE target — worth a
   deliberate standards conversation. The matching `tPark` finding (`r=0.890`, #181) is now
   moot entirely — `tPark` is no longer a scored target (see #3 above) AND #174's monthly-upload
   persistence for it was reverted the same day (workbook has no Park column, and no scoring
   consumer remained to justify it).

### Measured facts from this session worth not re-deriving

- `monthly_targets` is healthy: 27 populated stores/month back through May 2026 (April: 20).
  The 7 extra rows per month (`1291, 16392, 17750, 2010, 2370, 2510, 2920`) are all-null and
  **none appear in `DEFAULT_TARGETS`** — closed/sold locations and/or org-structure rows from
  the upload. Proven benign, not inferred. Don't re-investigate.
- `computeCtrlScore` reads **no per-store target at all** — it grades entirely on the
  district-wide `settings.scoring` thresholds. Controls Score does not move when targets change.
- ⚠️ STALE, corrected 2026-08-11 (twice — see #174 above): `computeOpsScore` grades **five**
  target fields now that #181 removed park. Of those five, only `tTpph` and `tOepe` have a
  `monthly_targets` cloud path — `tPark`'s brief #174 persistence was reverted the same day
  (real workbook has no Park/OEPE column; `tPark` also has no scoring consumer left to justify
  it). `tKvst`/`tKvsu` still have no monthly path and remain a possible future follow-up, not
  queued.
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

## Idea logged for later (2026-08-30, owner) — native OS Share sheet

Owner: *"In many apps and sites there is a share button that can be used to share the contents of
a focused panel/view... It could arguably take place of and enhance our current print/export/etc.
functions and add the ability to text, email, or perform any of the other current functions we do
now... allow the user to select where they would like to share the data. For example, Notes app,
office program, etc. Is this a possibility in this environment?"*

**Yes — the Web Share API (`navigator.share()` / `navigator.canShare({files})`) is exactly this
primitive.** It hands text, a URL, or actual files (PDF/CSV/image — construct real `File` objects)
to the OS's native share sheet, which routes to whatever the user has registered (Messages, Mail,
Notes, WhatsApp, AirDrop, a second app). Requires HTTPS (already true, Vercel) + a user gesture
(a click handler — already true for every existing print/export button). **Not yet measured in
this repo**, so re-check before scoping: browser support is real but uneven — strong on iOS
Safari/Android Chrome (where most GMs likely open Meridian), partial on desktop Chrome/Edge
(url+text yes, files OS-dependent), **absent on desktop Firefox**. So this is a progressive
enhancement, not a replacement: feature-detect `navigator.share`/`navigator.canShare` and offer it
alongside today's print/CSV/copy/email paths, not instead of them — a `RoutePanelShell`-level
"Share" action that falls back to the existing per-panel affordance when unsupported would unify
the UI without breaking desktop admins. Good candidate to scope as its own dispatch once the
current EOM-reports batch (#227) and the recount-impact SAGE tool (#226) land — not scoped or
built yet, logged here so it isn't lost.
