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
- [x] **Info icon scraper** — already substantially shipped (v4.388), this line had gone stale.
  Re-verified directly 2026-09-05 while building the Field Dictionary item below: `qsr_field_definitions`
  table exists (`supabase/schema.sql`), `scripts/qsrsoft-field-scraper.mjs` (Playwright ℹ-dialog
  capture) and `scripts/parse-field-defs.mjs` (structures the capture into `{page,label,description}`)
  both exist, `loadQsrFieldDefs()` (`src/lib/supabase.js:3065`) loads the table into `ds.qsrFieldDefs`
  at startup (`App.js` T2 stage), and it's consumed in two real places: `FOBAnalysisPanel`'s
  per-row tooltip lookup (`analytics.js`) and SAGE's system-prompt field-definitions section
  (`sage.js`'s `buildFieldDefsSection`). A real capture already sits in the repo too —
  `screenshots/field-definitions-parsed.json`, 418 structured entries across 14 QSRSoft report
  pages. What's still open: `qsr_field_definitions.db_col` (the column exists in the schema) is
  never populated by anything — nothing currently links a scraped QSRSoft label back to our
  internal db column name. Not blocking (the two live consumers above key off page+label, not
  db_col), but real follow-on scope if that linkage is ever wanted.
- [x] **Field dictionary** — 2026-09-05. `src/constants.js`: `QSR_DAR_FIELDS`/`QSR_FOB_FIELDS`/
  `QSR_EBOS_FIELDS`, db column → {label, desc, unit}, sourced from QSRSoft's own scraped field
  definitions (`screenshots/field-definitions-parsed.json`) plus the pull scripts' real columns.
  Also fixed: the pre-existing `QSR_DAR_FIELDS` was stale (named columns that don't exist on
  `qsr_daily_activity` at all) and was dead code — exported but never imported anywhere. Wired
  into SAGE's field-definitions context (`sage.js`'s `buildFieldDefsSection`) as a static
  fallback merged under the live-scraped `qsr_field_definitions` table, so SAGE always has real
  field definitions to answer "what is X" with, not only when that table happens to be populated.
  Guarded by a test that re-derives each table's real column list from the pull script/schema.sql
  source of truth so it can't silently go stale again (`src/__tests__/dispatch-qsr-field-dict.test.js`).
  Scoped to the 3 tables above (DAR/FOB/eBOS) in this pass — the JSONB-metrics ops-pull tables
  (cash sheet, labor summary, service stats, sales mix, peaks) and product mix are real follow-on
  scope, not done here. The companion **Info icon scraper** item (line above) was found to already
  be ~90% built — table, scraper script, parser script, and 418 real scraped field definitions
  already sitting in the repo — see the researched inventory in this commit's PR description.
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
(a click handler — already true for every existing print/export button). Browser support is real
but uneven — strong on iOS Safari/Android Chrome (where most GMs likely open Meridian), partial on
desktop Chrome/Edge (url+text yes, files OS-dependent), **absent on desktop Firefox**. So this is a
progressive enhancement, not a replacement: feature-detect `navigator.share`/`navigator.canShare`
and offer it alongside today's print/CSV/copy/email paths, not instead of them.

**⚠️ PARTIALLY shipped 2026-09-01 (v5.309) — do not read this as "done."** The primitive itself is
now proven and live: `src/utils/share.js`'s `shareOrCopy({url,title,text})` tries
`navigator.share()` first, treats a user-cancelled OS sheet (`AbortError`) as a normal cancel, and
falls back to clipboard-copy exactly as before everywhere `navigator.share` is unavailable. But it
is wired into exactly **two pre-existing, narrow "🔗 Share" LINK-copy buttons** — Count Cycle's
weekly share link and EOM Scoreboard's share link — which already existed and already shared one
thing (a URL). It does **not** touch anything else.
**The actual ask this backlog entry describes — a single, panel-agnostic `RoutePanelShell`-level
"Share" control that rolls up print/export/save/share for ANY panel app-wide, not just those two
link buttons — is still NOT built.** Confirmed 2026-09-01: the owner asked "where do I find that
[app-wide] share feature" after the narrow version shipped and it doesn't exist. Every other
print/export/copy button across the app (Missing Items, Recount Impact, Supervisor Rollup, FOB
Report, etc.) is untouched by this — still their own separate print/CSV/copy affordances, per
`memory/panel-contract.md`'s close-button/date-picker/LocationSelector-style per-panel conventions,
not a unified control. Scoping the real ask is still open work: what "current panel" means for a
generic export (screenshot? the panel's own existing HTML/CSV export, handed to
`navigator.share({files})` instead of a download?), which panels get it first, and whether it lives
in `RoutePanelShell`'s chrome (available to all 13 `route:true` panels for free) or has to be
added per-panel like print already is.

## Idea logged for later (2026-08-31, owner) — link cash controls to food cost / FOB reporting

Owner, verbatim, mid-conversation: *"which reminds me, at some point we have to link cash controls
to food cost and report that as well."* Not scoped, not designed — flagging so it isn't lost.

Context it came up in: reviewing a CoachQ (a competing/adjacent tool) sample report for store
35064, which included a "Controls Data" section — combined emp/mgr meal discounts vs. a target
(1.88% of sales vs. ~0.96% target, ~$1,800 over), overring/refund counts, no-sale drawer-open
counts, and a register-level cash-variance table naming specific managers/cashiers tied to
Register 13's recurring variances.

Two different ideas are bundled in that one CoachQ section, worth separating when this gets
scoped:
1. **Meal-discount % as a FOB/controls crossover metric** — this genuinely touches food cost (comp
   meals are a real $ leaving the food-cost bucket) and could reasonably live in the EOM/FOB report
   family. Meridian's `signal-registry.js` already tracks Controls loss-prevention metrics
   (T-Reds, cash/cashless refunds, promo, disc, POS-over $) as `(Cloud)` metric groups for
   Signals/Scanner — the atoms likely already exist; this would be surfacing a subset of them
   inside the EOM/FOB context specifically, not a new data pull.
2. **Register/cashier-level variance naming** (the "Register 13 — Seth F, Bobbi J" table) is a
   DIFFERENT kind of thing — HR/loss-prevention attribution, not food cost. Deliberately NOT
   recommended for the EOM/FOB report family: this codebase's own standing convention for
   integrity findings is "verify, don't accuse" (see `eom-diagnosis.js`'s `INTEGRITY_LABEL`
   section and `dispatch-swing-ledger-report.test.js`'s framing) — naming specific employees by
   name in an automated report that a manager forwards around cuts against that. If this gets
   built, it belongs with (or stays in) the Controls/Signals panel, not the food-cost report.

Not scoped or built yet — needs the owner to say which metrics, which report(s), and whether (2)
is wanted at all before any implementation starts.

## ✅ RESOLVED 2026-10-12 (v5.520) — Alerts/Notifications customization + expiry (was "for later" below)

Scoped with the owner before building (2026-10-12): in-app bell kept simple (no settings page);
a GENERAL notification framework other features can plug into, not another EOM-specific table;
auto-clear wanted; and — after an initial "bell only" answer was revised mid-build — push/email
delivery too, "where appropriate and valuable."

Shipped: `supabase/schema-app-notifications.sql`'s type-agnostic `app_notifications` table +
`src/engine/app-notifications.js` (pure shape/validation, severity-based push/email delivery
defaults, the `resolvedKeys()` auto-clear primitive) + `src/lib/supabase.js`'s IO half +
`scripts/lib/app-notification-delivery.mjs` (reuses the EXISTING `sendWebPush`/`postResend`
primitives, no second integration). `shell.js`'s `NotificationBell` now merges this generic
source with the pre-existing `eom_count_notifications` rows (untouched rich rendering) into one
dropdown/badge; every row — EOM included, via a new `dismissed_at` column on that table too — gets
a real delete button. 37 new tests; full suite + build both pass clean.

**Deliberately NOT done, and said so in the changelog rather than implied:** no live producer
writes to `app_notifications` yet (EOM keeps its own table/delivery exactly as before — this is
additive, not a migration) and auto-clear/push/email are proven generic with synthetic test data,
not exercised by a real feature. This is the substrate the next notification-producing feature
(a Signals anomaly, a stale-stream alert, a forecast-accuracy drop) plugs into — do not read "no
live producer" as unfinished; it's the intended shape of a framework pass, matching how this
backlog file's own earlier EOM-count work shipped its table before every panel adopted it.

**Original "for later" entry, kept for context:**

## Idea logged for later (2026-09-05, owner) — Alerts/Notifications customization + expiry

Owner, verbatim: *"Work on Alerts Notifications in app — I would like to see some customization
options and the ability to delete notifications or have them fall off if no longer relevant.
Would also like other ideas for what or how this is implemented across the industry."*

**Current state** (`src/app/shell.js`'s `NotificationBell`/`NotificationRow`, dispatch #209): the
app's only real in-app notification surface is EOM count-completion alerts specifically (food/
condiment/paper/non-product count status), sourced from `eom_count_notifications` via
`loadEomCountNotifications({limit:20})`, polled every 60s. A row can be marked read
(`markEomCountNotificationRead`) but there is no delete, no expiry/auto-fall-off, and no
customization of what surfaces or how — exactly the two gaps the owner named. Not a general-
purpose alerts system yet; it's one notification TYPE with a bell UI, not an extensible one.

**Not scoped or designed yet** — needs the owner's input on which customization axes matter
(per-user? per-notification-type? snooze vs. delete? a settings panel vs. inline per-row
controls?) before implementation starts. Logging industry patterns worth considering when this
gets scoped, not a recommendation to copy any one of them wholesale:
- **Read/unread + swipe-or-click dismiss** (Gmail, most mobile OS notification centers) — the
  baseline: dismissing removes it from the list, doesn't undo whatever it was warning about.
- **TTL / auto-expiry** (Slack's `@here`-style ephemeral banners, GitHub's PR-check notifications
  that resolve themselves once the check re-runs green) — a notification tied to a state that
  later resolves itself (e.g. a count that gets completed) could auto-clear rather than needing a
  manual dismiss, which maps well onto Meridian's own "count completed" trigger.
  `sync-failure-watch`-style staleness already exists elsewhere in this app as a pattern worth
  reusing conceptually (a condition auto-clears once the underlying data catches up).
  ⚠️ Genuinely useful but unconfirmed which of Meridian's own current notifications resolve
  themselves this way vs. need a manual dismiss — would need auditing per type, not assumed.
  ⚠️ Speculative, not measured against Meridian's own data — flagging as an idea, not a finding.
- **Notification preferences/settings page** (Slack, GitHub, most SaaS dashboards) — per-type
  on/off toggles (e.g. "notify me about X but not Y"), often also channel selection (in-app vs.
  push vs. email) — Meridian already has push notifications (`upsertPushSubscription`) and email
  digests (`eom-digest.js`) as separate delivery paths for related data, so a unified preferences
  surface could plausibly cover all three rather than just the in-app bell.
  ⚠️ Speculative, not measured against Meridian's own data — flagging as an idea, not a finding.
- **Grouping/digest** (GitHub's "3 new comments" collapsing instead of 3 separate rows) — relevant
  once notification TYPES multiply beyond just EOM counts, so the bell doesn't become a long flat
  list.
  ⚠️ Speculative, not measured against Meridian's own data — flagging as an idea, not a finding.
- **Severity/priority tiers** (PagerDuty/Opsgenie's critical/warning/info) — could map onto this
  app's existing severity vocabulary elsewhere (e.g. Signals' anomaly flags, visit-readiness risk
  flags) if/when other alert types get added to the same bell.
  ⚠️ Speculative, not measured against Meridian's own data — flagging as an idea, not a finding.

Scoping questions for whoever picks this up: does "customization" mean per-user preferences, or
just better controls on the existing bell (delete button, mark-all-read, auto-clear-when-
resolved)? Does this stay EOM-count-specific or become a general notification framework other
features (Signals anomalies, forecast accuracy drops, etc.) could plug into later? Both are
reasonable directions — the owner hasn't said which yet.

## ✅ RESOLVED 2026-10-03 (v5.494, PR #1377) — Recount visibility report (was "for later" below)

Shipped the very next day, closing all 4 of this entry's own "likely real gaps, not yet checked"
questions — re-verified live 2026-10-12: `EOMRecountImpactPanel` (`src/views/eom-recount-report.js`)
is wired into `EOMDashboardPanel` (`src/views/eom-dashboard.js:3644`) with every prop populated.
1. **Dollar AND percent** — `moneyPct()` renders `"$-300 (-0.30%)"` in both the Baseline and
   Post-Recount columns (`basePct`/`curPct`, computed from the store's already-loaded period sales).
2. **Before/after FOB side by side** — "Baseline ($ / %)" and "Post-Recount ($ / %)" columns plus a
   Δ column, not just a net verdict.
3. **Per-location recounted-or-not roll-up** — the `locationSummary` table lists every in-scope
   store, including ones with ZERO recounts this period (Store / Recounted? / Items / Helped / Hurt
   / Net), which the item list alone can never show.
4. **Weekly coverage** — an EOM/Weekly mode toggle; Weekly reuses the exact recount-detection
   already proven live on the At-A-Glance "Items Recounted" tile, not a separate/narrower method.

3 tests in `dispatch-227-eom-reports.test.js` cover items 1/3/4 directly; re-ran them 2026-10-12,
still 13/13 passing on current `main`. **Do not re-build this — the backlog text below is what
triggered the 2026-10-02 audit and is kept only for the original ask's context.**

**Original "for later" entry, kept for context:**

## ✅ RESOLVED 2026-10-16 — Recount visibility report already fully shipped the day after this was logged (was "for later" below)

Verified against the live code (2026-10-16, Reports Hub Tier 2 pass): all 4 of this item's own
"open questions / likely real gaps" below are answered — `src/views/eom-recount-report.js`'s
2026-10-03 header comment (dated the day AFTER this backlog entry) documents the owner asked
for exactly this and it shipped same-week:
1. **Both $ and %** — `moneyPct()` combines them in one cell (owner's own "assign a dollar and
   percent to it" quoted verbatim in that file's header).
2. **Before/after side by side** — the item table has explicit "Baseline ($ / %)" / "Post-Recount
   ($ / %)" / "Δ" columns, not just a net verdict.
3. **One-line-per-location recount yes/no roll-up** — `locationSummary` prop
   (`recountLocationSummary`, `eom-dashboard.js`) renders every in-scope store, INCLUDING ones
   with zero recounts this period, with a "✓ Yes / — No" column — exactly the "simple recounts
   performed or not" roll-up asked for.
4. **Weekly coverage, not just EOM** — `mode`/`onModeChange` toggle (EOM default, Weekly reuses
   the same `autoWindowDays` clustering already proven on the At-A-Glance "Items Recounted" tile).

Live-wired: `eom-dashboard.js` imports and renders `EOMRecountImpactPanel` with all of the above
props already populated (not an orphaned file). 19 passing tests across
`dispatch-227-eom-reports.test.js` / `dispatch-cross-store-recount-consistency.test.js` /
`eom-recount-report-format-text.test.js`. **No code changes needed — do not re-build this.**
The `eom-dashboard` panel (which hosts this report as a tab) was also cross-listed into the
Reports Hub catalog the same session (Tier 1), so it's now reachable there too.

## Recount visibility report — which locations recounted, helped/hurt, FOB $/% before vs after (owner request, 2026-10-02, explicitly "for later") [SUPERSEDED — see ✅ RESOLVED note immediately above]

Owner, verbatim: *"I want to be able to go back and determine which locations performed any
recounts for weekly and eom inventory. Especially EOM. It would be nice to list the items
recounted along with a simple recounts performed or not. If we want to carry it further
diagnostically, let's also include whether the recount helped or hurt matters. If possible show
FOB at time of original count and then after recount occurred and assign a dollar and percent to
it."* Not implemented this session — logged here per standing rule so it isn't lost.

**Before building: this is likely largely ALREADY SHIPPED, not a from-scratch build — verify
against current code first (CLAUDE.md's own repeated lesson: a doc/backlog item can go stale
while the feature ships).** A quick look while logging this (not a full audit) found:
- `src/engine/eom-recount-detect.js` — detects recount passes vs. the original walkthrough
  (store-level count-window clustering, 4h+ gap or back-office source = recount) and already
  carries the exact "helped vs hurt" framing the owner wants (`RECOUNT_MIN_GAP_MS`, confidence
  tiers CONFIRMED/LIKELY).
  See `memory/reference-inventory-count-mechanics.md` for the full mechanics writeup.
- `src/engine/eom-ledger-baseline.js`'s `ledgerBaselineDiff()`/`itemCloseWindowRecount()` — the
  shared engine behind BOTH the SAGE tool `query_eom_recount_impact` (dispatch #226) and the
  dedicated report below; grades recounts via `recountVerdictText()` ("helped: corrected a $X
  undercount" / "hurt: moved further from expected usage" — a food-cost-accuracy statement, not
  raw dollar direction, matching the owner's own "improved or hurt final result" framing from the
  original #227 request). Also mentions a weekly-recount cadence/tile ("At A Glance weekly-recount
  tile," 2026-09-07), so weekly (not just EOM) recount detection may already exist at some level —
  unverified how complete.
- `src/views/eom-recount-report.js` — "EOM Recount-Impact Report" (dispatch #227, Report 3), owner
  request verbatim 2026-08-30: *"a report stating how many and which products were recounted and
  whether they improved or hurt final result. Sort by class here as well."* Already groups by
  location then result (helped/hurt), already has location scoping (All→State→Patch→Store), has
  a Copy/plain-text export and a print path.

**Open questions / likely real gaps, not yet checked:**
1. Does the existing report (or SAGE tool) express the impact as BOTH a dollar amount AND a
   percent, or just one? The owner's new ask explicitly wants both.
2. Does it show the actual FOB figure at time of ORIGINAL count vs. AFTER the recount side by
   side (two numbers + the delta), or only the delta/verdict? The owner's new ask is specifically
   for the before/after pair, not just the net effect.
3. Is there a blunt, one-line-per-location "recount performed: yes/no" summary anywhere, or does
   every existing surface assume you already know a recount happened and only reports on it when
   one did? The owner's phrasing ("simple recounts performed or not") suggests a roll-up view
   that doesn't exist yet even if the underlying detection does.
4. Weekly-count coverage: confirm whether `eom-recount-detect.js`/`eom-ledger-baseline.js`'s
   methodology (or the At A Glance weekly-recount tile) actually covers weekly (non-EOM) counts
   end-to-end with the same helped/hurt grading, or whether that engine is EOM-only despite the
   "weekly" mentions found in a grep.

**Next step when picked up:** read `eom-recount-report.js` and `eom-ledger-baseline.js` in full,
run the existing report against real data, and diff what it already shows against the 4 asks
above (recount yes/no per location, items list, helped/hurt, FOB $ and % before/after) before
writing any new code — most of this may already be a UI framing change on an existing report
rather than a new engine.

## ✅ RESOLVED 2026-10-03 — Inventory Excess Cases eaches-vs-cases bug (was "for later" below)

Fixed same day the owner asked for it. Measured live against `qsr_inventory_summary` (1000 real
rows): `uom` is NEVER `'Case'` — only Each/Container/Bag/Gallon/Packet/Pouch/Box/Pound, the
item's own natural count unit, with `case_sz` reported separately — confirming the hypothesis
below exactly, with no per-item split (every cloud row is the "eaches" shape). `eachFmt` flipped
from hardcoded `false` to `true` in `cloudRowsToPanelShape` (`src/views/inventory.js`). Verified
against the exact reported item (PEPPER PACKETS/BLACK, store 3708): excess cases drops from a
fabricated ~836 (mislabeled packets) to a believable ~0.14 cases. `excessValue` was confirmed
unaffected either way (it never divided by `caseSize`), matching the owner's own read ("value
looks ok, but cases way high"). 4 new tests (`dispatch-inventory-eaches-vs-cases-2026-10-03.test.js`),
including a regression test documenting the old buggy magnitude so it can never silently return.
The manual-upload path (`parseInventoryData`) was untouched — already correctly filename-detects
"Display as Each" vs "Display as Case" per workbook, unrelated to this cloud-path-only fix.

**Original finding, kept for context:**

## Inventory — Excess Cases is almost certainly showing eaches, not cases (owner report, 2026-10-02, "for later")

Owner, with a screenshot of the Overstock section: *"Excess cases can't be correct. value looks
ok, but cases way high. Maybe that's the eaches being displayed as cases. If so, just needs
converting to cases."* Screenshot shows rows like `SALT PACKETS` at **5538.62 cs** excess for a
$16.09 excess value, and `PEPPER PACKETS/BLACK` at **11091.01 cs** for $54.96 — those case counts
are implausible (tens of thousands of packets' worth, not tens of cases), while the dollar figure
sits in a believable range.

**This is already a known, explicitly-flagged uncertainty in the code — not a new bug to
discover, just one that needed a live measurement to resolve, and the owner's screenshot IS that
measurement.** `src/views/inventory.js`'s row-builder (the `rows.push(...)` block building each
item's `usageDay`/`eachFmt`) carries this comment verbatim:
> `⚠️ UNVERIFIED (no live data to confirm): assumes usagePerDay is already in CASES, matching
> startInv/endInv/purchases. If a live pull shows it's actually in EACHES, flip this to true —
> it directly changes the Overstock excessCases/excessValue math.`
and hardcodes `eachFmt:false`. The Overstock calc (`excessCases:+(((r.daysSupply-threshold)*
r.usageDay)/(r.eachFmt?(r.caseSize||1):1)).toFixed(2)`) divides by `caseSize` ONLY when
`eachFmt` is true — with it hardcoded false, a `usageDay` that's actually in eaches (not cases)
flows straight through undivided, inflating `excessCases` by exactly a factor of `caseSize`.
`excessValue` doesn't divide by `caseSize` at all (`(daysSupply-threshold)*usageDay*cost`), so if
`cost` is cost-PER-EACH (not cost-per-case) the dollar figure stays correct even while the case
count is wrong — consistent with the owner's own read ("value looks ok, but cases way high").

**Likely fix, NOT yet verified against a live item (per CLAUDE.md's "measure it, don't reason
about it" rule — don't just flip the flag on my read of a screenshot):** flip `eachFmt:false` to
derive from the real per-item data (or hardcode `true` if genuinely always eaches) once confirmed
against the actual source rows for an item like `SALT PACKETS`/`PEPPER PACKETS/BLACK` — check
`usagePerDay`'s real unit against `caseSize` (`parseInvUOM(r.uom)`/`r.caseSz`) and `startInv`/
`endInv`/purchases' own units for at least one item to be certain this isn't a per-item-type split
(some items might genuinely report in cases, others in eaches, same source feed). Also audit
whether this is a blanket `usagePerDay` issue (affecting Usage/Day display too, not just excess
calcs) or isolated to the Overstock excess math.

## Queued 2026-11-01 — two pre-beta cleanup items (owner: "I am really, really close to letting a
## few key people have login credentials and would like to clean up a few things first")

Both explicitly asked to be queued, not built now. Logged so they survive to whichever session
picks them up.

### A. Location-selector mode consistency sweep (dropdown vs. full-list)

Owner: *"we also need to sweep the app for consistency of our location picker as well. Some
places it is a dropdown, others it is just all listed out and in the latter it is very cluttered
looking."* Confirmed by grep (2026-11-01), not assumed — `LocationSelector` (`PanelControls.js`)
is already used in exactly two modes, split roughly like this:

| mode | panels | shape |
|---|---|---|
| `'full'` | `eom-dashboard.js`, `visit-readiness.js`, `weekly-count-status-report.js`, plus the two new reports this session (`count-timing-report.js`, `missed-count-report.js`) | every state/patch/store pill rendered flat, all at once — this is the "cluttered" shape the owner is describing |
| `'progressive'` | `crew-schedule-panel.js`, `customer-complaints.js`, `event-impact.js`, `events-panel.js`, `news-panel.js`, `schedule-retention.js`, `security-panel.js`, `smg-voice.js`, `store-assessments.js`, `targets-editor.js`, `top-bottom-performers.js`, plus the EOM Digest modal's inline Scope selector added 2026-10-30 | drills down one level at a time (All → State → Patch → Store) — the cleaner shape |

`eom-dashboard.js` itself uses BOTH modes in different places (full for its own main header, progressive for the Digest modal's inline selector) — this isn't hypothetical drift, it's visible within one file.

**Next step when picked up:** decide which mode is the standard (progressive reads like the better default for a new/less-technical user; full is faster for a power user who knows exactly which store they want — may be worth keeping full as an *opt-in* density setting rather than eliminating it), then sweep the 5 `'full'`-mode panels to match. Don't just flip the mode prop blindly — confirm `'full'` doesn't exist in those 5 specifically because something about their workflow needs direct single-click access (e.g. a report meant to be handed around and reused quickly) before converting it.

### B. Per-user panel access restriction (not just per-role)

Owner: *"I will also want to look at our ability to restrict any panel for any user I chose."*
Confirmed by grep (2026-11-01): **no per-user override mechanism exists today, at any layer.**
Access control is 100% role-based — `src/engine/permissions.js`'s `hasPermission(roleId, permKey)`
gates nav/panels via `panel-registry.js`'s `perm:` field, and RLS scopes data via
`accessible_locs`/`public.my_locs()` — both keyed on the user's **role**, never on an individual
user id. There is no `panel_overrides`/`userOverride`/`panelOverride` table, column, or function
anywhere in the codebase (checked `permissions.js`, `panel-registry.js`, `schema.sql`).

So every GM, every Supervisor, etc. currently sees the identical panel set as every other user of
that same role — fine while the only real users are the owner and a handful of trusted insiders
who all effectively need everything, but a real constraint the moment outside operators get
logins and the owner wants to hand one of them, say, every panel EXCEPT Pay Rate History or
Security.

**Next step when picked up:** this is a real schema addition, not a UI toggle — needs a
per-user allow/deny table (e.g. `profiles` gains a `panel_overrides` jsonb column, or a separate
`user_panel_access (profile_id, panel_id, allowed)` table) that `hasPermission`'s panel-visibility
check consults ALONGSIDE the existing role check, not instead of it (role stays the default,
per-user is an override layer on top — fails closed the same way the role system already does).
Scope the first version to panel VISIBILITY only (hide/show in nav), not a parallel permission
system for in-panel actions — that's a much bigger surface and not what was asked for.

**§A is still open** — the work below is a related but separate feature (custom location groups
+ a consolidated grouping tile), not the `'full'` vs `'progressive'` mode-consistency sweep this
section describes. Don't mark §A done from the entry below.

## Shipped 2026-11-01 — custom location groups + consolidated "Performance Summary" tile

Owner, from a screenshot of the District View Enterprise Overview (Sales Momentum Rank/Forecast
Accuracy Leaderboard/Supervisor Performance Summary/Operator Performance Summary/Organization
Breakdown) plus two QSRSoft screenshots of its own Locations/Patches multi-select picker: *"let's
move the total company performance off of the individual location tiles under district tile view.
Maybe give that a tile of its own that could be dynamically viewed by selecting the grouping to
see whether one location, a patch, operator, state, organization or a selected group of
restaurants of user choice. For the selecting groups of restaurants by user choice, we should
incorporate that throughout the app as well."*

- **Replaced** the three fixed, near-duplicate Supervisor/Operator/Organization Performance
  Summary sections in `store-analytics.js`'s `StoreDash` Enterprise Overview with ONE
  "📊 Performance Summary" tile, grouping-mode pills: Location / Patch / Operator / Organization /
  Custom Group. `'State'` and `'Organization'` deliberately collapse to one mode — for this
  fleet they're the same 1:1 partition (MCDOK=Oklahoma, Emerald Arches=Florida), so a separate
  `'state'` pill would render byte-identical groups under a second label. Fixed a real latent
  bug in the same pass: the old Operator section read the STATIC `INV_ORG_COORDS[loc].op`
  directly; the new one uses the live `operatorOf()` resolver (same dispatch #139 pattern the
  Patch tier already used) — confirmed live in testing that `INV_ORG_COORDS['3708'].sup` (static
  seed, "Robert Spencer") actually disagrees with `supervisorGroups()` (live, "Zukarr Eaves") for
  at least one real store, so this wasn't a no-op fix.
- **New**: `src/engine/location-groups.js` — pure CRUD (`addLocationGroup`/`updateLocationGroup`/
  `removeLocationGroup`) + the grouping math (`buildGroupSections`/`summarizeGroup`) that both the
  new tile and any future consumer share.
- **New**: `src/components/LocationGroupPicker.js` — QSRSoft-style modal (Locations tab:
  checkboxes + search + "All"; Patches tab: toggle a whole existing patch at once; name + save).
- **Persistence**: `org_config` key `custom_location_groups` (shared, not per-user — same
  table/RLS tier `supervisorGroups`/`operators`/`eom_digest_config` already use, admin/
  area_supervisor write). `loadCustomLocationGroups`/`saveCustomLocationGroups` in
  `src/lib/supabase.js`. Owner confirmed (AskUserQuestion, 2026-11-01): saveable & named, not
  ad hoc/session-only — "matches what QSRSoft's 'Patches' tab implies."
- **"Incorporate throughout the app"**: `LocationSelector`/`buildLocationHierarchy`
  (`PanelControls.js`) extended with an optional `customGroups` prop and a `'group'` value level
  — fully additive/backward-compatible (every existing caller that doesn't pass `customGroups`
  is unaffected; a saved group shows as a 🔧-prefixed pill alongside State/Patch once a caller
  does). Only the new Performance Summary tile passes `customGroups` today — wiring it into
  other existing `LocationSelector` consumers is opportunistic future work (this codebase's
  standing "bring it into line when you're already touching that panel" convention), not a sweep
  done in this pass.
- Tests: `dispatch-location-groups-2026-11-01.test.js` (16), `dispatch-location-selector-
  custom-groups-2026-11-01.test.js` (8), `dispatch-performance-summary-tile-2026-11-01.test.js`
  (7) — the last renders the real `StoreDash` Enterprise Overview, not just the engine function,
  per this file's own "would this still pass if reverted" standing rule.

## Queued 2026-11-01 — wire 44689 (Lindsay relocation) into Monthly Projections

Owner, explicitly queued, not built now: *"Need to wire in 44689 (New Lindsay Location for
projections). Use our research from before on monthly projections to guide and model please."*

**The research already exists and already shipped — this is a wiring gap, not a from-scratch
build.** v5.558 (2026-10-14) added 44689 (the new freestanding Lindsay build replacing 18213,
"Supervisor and GM and Owner assignments stay the same," projected open 11/14–11/15/26) to
`STORE_NAMES`/`STORE_COORDS`/`INV_ORG_COORDS`/`STORE_KB`/`supervisorGroups`/`operators`/`doGroups`,
and purpose-built `src/engine/new-store-ramp.js` for exactly this: a comparable-store ramp-
blending forecast (owner's own read, `STORE_KB['44689']`: *"volume similar to Tishomingo
[43380]... adjusted for inflation... Ponce de Leon [43701]... less comparable"*). It pulls each
comparable's real sales trajectory from its own first trading day, expresses it as a fraction of
its own mature run-rate (so differently-sized stores blend by SHAPE not dollars), blends by
weight, then applies that shape to a caller-supplied mature-weekly-sales assumption — 13 tests,
all passing, but **explicitly shipped as standalone: "not wired into the automatic nightly Model
Assignment backtest... callable today, UI surface is follow-up work once real open-date data
exists."** That follow-up never happened.

**Re-verified live today (2026-11-01), not assumed stale:** the one blocker v5.558 flagged (the
live Supabase `org_config` write for `supervisorGroups`/`operators`/`doGroups` — code-side seed
only at ship time) **is resolved** — confirmed via a direct service-role read, `supervisorGroups`
live today already lists `'44689'` under Krystiana Langford. So the org-structure half is fully
live; only the forecasting/projections half is still the gap.

**Next step when picked up:**
1. Confirm 44689's real opening date (was "exact dates not final" as of 10-14; today is ~2 weeks
   out from the projected 11/14-11/15 window — may be confirmed by now, check before building).
2. Wire `src/engine/new-store-ramp.js`'s `projectNewStoreSales`/`blendRampShapes` into whatever
   Monthly Projections / Smart Targets actually reads for 44689's forecast once it has sales
   history under `storeAgeDays()<400` (`forecastDay`'s existing `noLYData` branch in
   `src/engine/forecast.js` already calls `fetchRampSales` for a young store, but that's a
   DIFFERENT, simpler same-DOW trailing approach — not the comparable-store blend engine).
   Decide whether `fetchRampSales` should call into `new-store-ramp.js`'s blend for 44689
   specifically (comparables keyed by loc), or whether the comparable-blend is a separate,
   owner-facing "new store forecast" UI surface (e.g. a tile/panel for the pre-opening planning
   window where there's no own-store history yet at all) — the current engine's `comparables` and
   `matureWeeklySales` are caller-supplied, not auto-derived, so a UI decision on where that input
   comes from is real design work, not just an import.
3. `matureWeeklySales` for 44689 is still *"a judgment call only the owner can make"* per
   `new-store-ramp.js`'s own design note — don't fabricate one; surface it as an input the owner
   sets (likely near `DEFAULT_TARGETS['44689']`, itself still a verbatim 18213 copy flagged as a
   placeholder, not an owner-reviewed target).

## Queued 2026-11-01 — admin-authored mass-communication banner/alert

Owner, explicitly queued, not built now, prompted by today's LifeLenz outage: *"I will need a way
to send out mass communication via a splash screen or popup for future use for when similar
things happen and i discover them so i can let the users know it in progress of being updated or
fixed. Kind of like a bulletin alert or form."* The direct reference point he gave is the live
LIFELENZ app's own banner (the MFA notice: a dismissible bar, pinned top, with a close button) —
same shape as what he's asking for here, aimed at Meridian's own users.

**Confirmed by grep: no such mechanism exists today.** Meridian already has 3 banner components
(`App.js`'s `DataPolicyBanner`, `features/session.js`'s `SessionBanner`, `shell.js`'s
`DataErrorBanner`) but every one is **client-side and hardcoded** — fixed copy baked into the
component, triggered by local session/data-load state, dismissed via `localStorage`. None of them
is admin-AUTHORED or server-driven; there's no way for the owner to push new text out to users on
demand without a code deploy.

**Next step when picked up — the shape, not a full spec:**
- **Storage**: a shared `org_config` key (e.g. `'system_announcement'`), same admin-write/
  authenticated-read RLS tier `custom_location_groups`/`eom_digest_config`/`supervisorGroups`
  already use — no new table needed. Shape: `{active, message, severity, createdAt, expiresAt?,
  dismissible}` at minimum; `expiresAt` matters so a stale "fixing X" notice doesn't outlive the
  fix if someone forgets to turn it off.
- **Authoring UI**: a simple admin-only form (Settings, alongside the other org-wide config
  editors like EOM Digest's schedule config) — write the message, pick severity, set/clear
  active. Not a big build; reuses the same load/save round-trip pattern as every other org_config
  consumer in `src/lib/supabase.js`.
- **Display**: a new banner component following the existing 3's visual convention (fixed
  position, dismissible via localStorage keyed by message content/id so a NEW message re-shows
  even if an old one was dismissed) — mounted once near the app root (`App.js`), loaded on
  startup alongside the other org_config batch reads (`loadOrgConfigs`).
- **Scope question to settle when building, not now**: all users, or RBAC/location-scoped (e.g.
  only OK stores if only OK is affected)? Owner's phrasing ("let the users know") reads as
  all-users by default; a scoped version is a bigger, separate design question — don't build it
  unasked.

## Shipped 2026-11-01 — Schedule Discipline (LifeLenz Data Explorer "Schedule Variance")

Owner asked to build out the LifeLenz Data Explorer finding (the Lakehouse report API fully
mapped earlier this same session, see `memory/lifelenz-session.md`'s "New Data Explorer"
section) and come up with good uses for the data. Built end to end, real (not a stub):

- **`scripts/lifelenz-schedule-variance-pull.mjs`** (new, daily workflow
  `lifelenz-schedule-variance-pull.yml`) pulls LifeLenz's Schedule Variance report — a shift-
  EDIT audit trail: who edited a published schedule, what value changed, when, and the
  hours/cost impact. Uses the confirmed trigger→poll→download Lakehouse flow
  (`GetReportDataCsvAsync` → `AsyncReports` poll → CSV download). Direct-token-only auth
  (`LIFELENZ_TOKEN`), matching `lifelenz-attendance-pull.mjs`'s own precedent/reasoning for not
  duplicating the Playwright fallback a third time. Also runs a read-only `GetReportMeta`
  discovery pass for the other 4 Data Explorer tiles' best-guess reportKeys, logged but not
  acted on.
- **`lifelenz_schedule_variance`** table (new, `supabase/schema-lifelenz-schedule-variance.sql`)
  — same tenant+accessible_locs RLS and "names stored directly" precedent as
  `lifelenz_punch_edits`.
- **`src/engine/schedule-discipline.js`** (new) — pure aggregation functions:
  `dailyScheduleVariance` (per-(loc,date), feeds Signals), `storeScheduleDisciplineSummary`,
  `editorBreakdown`.
- **Schedule Discipline tab** (`ScheduleDisciplinePanel`, `src/views/labor-tools.js`) — new tab
  in the Labor & Scheduling hub, same tab-in-hub treatment as Pay Events: per-store summary
  (edits/hours/cost, sorted by cost impact), per-editor breakdown, recent-edits drill-down with
  the real before→after values. Windowed (7/14/30 days).
  Three new rendered/unit test files (parser, engine, real-component render), 682/682 test
  files passing, build within budget.
- **Signals**: `scheduleEditCount` / `scheduleCostVariance` added to `signal-registry.js`'s
  `labor` metric group (source: `scheduleVarianceDailyRows`), so the Scanner auto-correlates it
  against every other metric already covered.
- **Watched**: added to `sync-failure-watch.yml`, `stream-freshness.js` (`dateField:
  'occurredAt'`), and `scripts/lib/scheduled-pull-registry.mjs` — all three required (the
  scheduled-pull-registry test caught the third one missing).

**What's honestly NOT done, and why:** the real downloaded-CSV content has never been seen —
only the column NAMES were confirmed (owner-captured request curl), not real row values. The
parser, the `AsyncReportStatusEnum` completion check (lenient by design — treats a populated
`url`/`error` as done rather than trusting an unconfirmed status string), and the download-URL
auth-header handling are all defensive-but-unverified. **Live `workflow_dispatch` validation
with `debug=1` is required before this is trusted** — same discipline as the LifeLenz auth fix
earlier this session. If the real shape differs, the header-name-first/positional-fallback CSV
parser and the lenient poll completion check are the two places to check first.

The other 4 Data Explorer tiles (Compliance Audit, Employee Performance, Payroll Readiness,
Time Punch Activity Log) are **not built** — their real column schemas were never captured
(only Compliance Audit is confirmed to exist as a report at all). The discovery pass in the new
pull script logs whichever of the 4 best-guess reportKeys actually resolve; read that job log
before guessing at a build for any of them.

## ✅ Shipped 2026-11-02 — Compliance Audit (second Data Explorer build, v5.599)

Owner-queued next after Schedule Discipline (same session, same "build out the Data Explorer
findings" directive). All 4 remaining reportKeys were confirmed REAL via dispatch run
41349875190's discovery pass (full real column schemas captured, not guessed — see
`memory/lifelenz-session.md`'s "BUILT 2026-11-01" section); Compliance Audit was built first of
the 3 still-open ones (`employee_performance_report`/`payroll_readiness_report` remain
unbuilt — `time_punch_activity_report` is flagged there as likely overlapping
`lifelenz_punch_edits` and needs a side-by-side comparison before ever building a pull against
it).

**New table**: `lifelenz_compliance_audit` (`supabase/schema-lifelenz-compliance-audit.sql`) —
NOT YET APPLIED to production Supabase (same as every schema-*.sql in this repo; owner applies
manually via the SQL Editor). 15 of the 42 real columns are promoted to real table columns
(the ones the panel/Signals actually need — `compliance_warning_id`, `employee_name`, `geid`,
`shift_date`, `category`, `title`, `description`, `source`, `cost_penalty`, `hour_penalty`,
`warning_time`, `is_dismissed`, `dismissal_reason`, `dismissed_by`, `dismissed_on`); everything
else the live `GetReportMeta` call discovers lands in a `raw` JSONB column, same "avoids a
300-column schema" precedent `qsr_cash_sheet`/`qsr_labor_summary` already use.

**Architecturally different from Schedule Variance's pull**: Schedule Variance hardcodes its
9-column `columns` request from a captured curl. Compliance Audit has 42 columns and only a
*representative* subset was ever captured by hand, so
`scripts/lifelenz-compliance-audit-pull.mjs` calls `GetReportMeta(reportKey)` live at runtime to
get the real, complete column list AND each column's human-readable display label, then builds
both the trigger's `columns` request and the CSV header→member map from that live response
(`buildLabelMap`) — no hand-typed label guess for all 42 fields, unlike Schedule Variance's
`HEADER_LABELS` map. This also means the parser is self-correcting if the report's own labels
ever change.

**New "good use" consumer**:
- `src/engine/compliance-audit.js` — `storeComplianceSummary`/`dailyComplianceAudit`/
  `categoryBreakdown`/`employeeViolationSummary`, same shape as `schedule-discipline.js`.
- New "Compliance Audit" tab in the Labor & Scheduling hub (`ComplianceAuditPanel`,
  `src/views/labor-tools.js`) — per-store, per-category, per-employee rollups + a
  recent-violations drill-down, windowed 7/14/30 days, same template as Schedule Discipline's
  own tab.
- Signals: `complianceViolationCount`/`complianceCostPenalty` added to `signal-registry.js`'s
  `labor` group so the Scanner auto-correlates it against every other metric.
- Watched end to end: `sync-failure-watch.yml`, `stream-freshness.js`
  (`dateField:'shiftDate'`), and `scripts/lib/scheduled-pull-registry.mjs` — its own parity test
  (`scheduled-pull-registry.test.js`) passed on the first try this time (both files updated in
  the same pass).

**Honest gap, same as Schedule Variance at this stage**: NOT yet live-dispatch-validated.
`groupBy`/`sortOrder` are a reasonable adaptation of the one real captured trigger example for
this report (memory: `groupBy` on `locations_location_name`+`employees_employee_name`,
`limit:20`, `GetReportDataTreeAsync`) — adapted here to `GetReportDataCsvAsync` (no limit) for a
full export; `sortOrder` (by `shift_date` desc) is a sensible default, not captured live. Real
CSV header shape/data content for this specific report has never been seen — the parser's
dynamic label-map approach is designed to be robust to whatever shape it turns out to be, but
that is still a design argument, not a measurement. **Run a `workflow_dispatch` with `debug=1`
before trusting this in production**, same discipline as every prior LifeLenz Data Explorer
build this session — the job log will show the real `GetReportMeta` column list and, on a
parse failure, the raw CSV lines.

## Shipped 2026-11-02 — Employee Performance (3rd LifeLenz Data Explorer tile)

Third build against LifeLenz's Data Explorer, after Schedule Variance and Compliance Audit.
Owner ask was explicit and sequenced: "Build Employee Performance next" (after confirming the
app's EOM rollup method and shipping the Refresh-EOM-Data button), with a correction mid-build
(the night-shift presentation doc's "by supervisor patch" table wrongly lumped all 7 Florida
stores under one supervisor — fixed by querying Supabase's live `org_config` instead of
`constants.js`'s stale hardcoded seed) handled first.

**Measured live before writing any schema, not guessed**: a discovery-only probe
(`scripts/lifelenz-employee-performance-meta-probe.mjs`) was merged to `main` first (GitHub's
`workflow_dispatch` API only resolves a workflow by filename once it exists on the default
branch — PR #1611), then dispatched (run `41371639603`) to call `GetReportMeta` and capture one
real CSV before any table/pull-script design decision was locked in. See
`memory/lifelenz-session.md`'s "BUILT 2026-11-02" section for the full finding — in short: 30
real columns, confirmed via the live dispatch log, and (the one genuinely new design question
this report posed) NO per-row date column at all, unlike its two siblings. Every column is a
count/rate over the whole requested window per employee, so the table's grain and key had to be
synthesized the way `lifelenz_attendance_summary` already does it (rolling `period_end`,
advancing one day per daily run) — not copied from Compliance Audit/Schedule Variance's
per-event-with-a-real-date shape.

**Schema** (`supabase/schema-lifelenz-employee-performance.sql`): `lifelenz_employee_performance`,
primary key `(loc, geid, period_end)`. All 30 real columns promoted directly — no `raw` JSONB
bucket, unlike Compliance Audit's 42-column report with a long unused tail; this report's column
count is small enough, and nearly every field (attendance %, drop/pickup/swap counts, discipline,
commendations, leave days) is something the panel genuinely sorts/filters on. PII check: none of
the 30 fields are ssn/DOB/address/etc.; `employees_minor_age` kept per the same precedent
`lifelenz_compliance_audit` already set. Employee names stored in plain columns under ordinary
tenant + `accessible_locs` RLS — not routed through the separate identity-reveal vault mechanism
(`schema-identity-vault.sql`), which this codebase reserves for security/loss-prevention
accusation contexts, a narrower category than an ordinary attendance scorecard; Compliance
Audit (also a per-employee, named table) set the same precedent one build earlier.

**Pull** (`scripts/lifelenz-employee-performance-pull.mjs`): same trigger→poll→download
mechanism as its two siblings, including `stripReportPrefix()` from day one (not discovered the
hard way this time) and the corrected outcome-tracker pattern (`totalParsed`/`totalSaved`
tracked separately, a store only counts as "covered" once it actually wrote something) built in
from the start rather than retrofitted after a live-dispatch false-success, which is how both
Schedule Variance and Compliance Audit found that same bug the hard way one build earlier.
`periodEnd` = yesterday (today may be partial), `periodStart = periodEnd - 13` (14-day rolling
window, same default as Compliance Audit).

**New "good use" consumer**:
- `src/engine/employee-performance.js` — `latestPeriodEnd`/`latestPeriodRows` (every "current
  state" function must first narrow to the single most recent `period_end` present, since the
  raw table accumulates many overlapping rolling windows over time — summing across them would
  double-count), `storePerformanceSummary`, and `lowAttendanceEmployees` — the concrete,
  actionable surface per CLAUDE.md's "Voice by role" rule: who is below an 80% attendance floor
  right now, with enough shifts scheduled that the number means something, not just a sortable
  column a GM has to interpret themselves.
- New "Employee Performance" tab in the Labor & Scheduling hub (`EmployeePerformancePanel`,
  `src/views/labor-tools.js`) — per-store summary + the low-attendance flag list, same
  tab-in-hub treatment as Schedule Discipline/Compliance Audit's own tabs.
- **Deliberately NOT added to Signals' metric registry** — see `memory/lifelenz-session.md`'s
  write-up for why (rolling-window overlap would violate the Scanner's independent-daily-
  observation assumption). This is intentional, not a missed step; don't "complete the set" by
  adding it without addressing that first.
- Watched end to end: `sync-failure-watch.yml` ("LifeLenz Employee Performance Pull"),
  `stream-freshness.js` (`key:'employeePerformance'`, `dateField:'periodEnd'`), and
  `scripts/lib/scheduled-pull-registry.mjs` (`employeePerformance` key, matching
  `stream-freshness.js`'s key exactly — its own parity test enforces this both directions).

**Tests**: `src/__tests__/lifelenz-employee-performance-pull.test.js` (parser/label-map tests
against the REAL captured column list AND a real CSV excerpt — not synthetic fixtures, unlike
Compliance Audit's build, which had to synthesize labels since no real CSV had been captured
yet), `src/__tests__/employee-performance.test.js` (engine), `src/__tests__/employee-performance-
panel.test.js` (renders the real exported panel, not just the engine functions, per dispatch16's
"would this verification still pass if reverted" rule).
