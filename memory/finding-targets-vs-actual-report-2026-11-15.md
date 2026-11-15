---
name: finding-targets-vs-actual-report-2026-11-15
description: "New report, v5.792 — Targets vs Actual (owner request: Monthly/Daily tabs, target vs actual, per store, 7/14/21/28D+MTD date picker, workbook-style look). Monthly tab's 16 metrics map 1:1 onto the real monthly_targets table; Daily tab covers DEFAULT_TARGETS' daily operational fields with no monthly override. Built on ReportShell; every actual value reuses fob-reference.js's FOB-leg delta math (new resolveMetricForRange export) and metric-source.js's metricAvg/metricSumRatio, never re-derived."
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# Targets vs Actual report (2026-11-15)

## Ask

"can you create a new report that focuses solely on the monthly targets and daily targets
(separate tabs) that shows clearly what the current target is vs the actual results. For the
date picker, seed it with 7,14,21 & 28 day options plus MTD please. Bonus if you can mimic the
look from the monthly projections workbook sent out to each store."

## What shipped

- `src/engine/targets-vs-actual.js` — pure engine. `MONTHLY_TARGET_METRICS` (16 entries: Sales $,
  Crew Labor %, Labor % Overall, TPPH, and the 11 FOB-leg metrics + Op Supply $ — the same set the
  real `monthly_targets` table / `MonthlyTargetManager` edit) and `DAILY_TARGET_METRICS` (10
  entries: OEPE, KVS Time, Parked %, Average Check, T-Red A/B %, POS Over %, Cash O/S %, Drawer
  Opens, Promo % — `DEFAULT_TARGETS` fields with no monthly override). `effectiveMonthlyTarget()`
  reads the cloud `monthly_targets` override for the range's month, DEFAULT_TARGETS otherwise —
  deliberately does NOT read the device-local `loadTargetsV2()` draft (CLAUDE.md's cloud-first
  rule: a report reads the source of truth, not the live-editing surface). `targetStatus()` grades
  ok/watch/miss, with a near-zero-target absolute-threshold branch (e.g. `tUnex`'s 0.0 target)
  instead of a relative-% one that would blow up.
- `src/engine/fob-reference.js` — added `resolveMetricForRange(ds, loc, metricKey, range)`, an
  arbitrary-`[s,e]`-window sibling to that file's existing fixed MTD/L3M/L6W/LM windows. Reuses the
  SAME FOB-leg delta-reconstruction (`fobDailyDeltas`/`_resolveWindow`) — this file's own header
  explains why `qsr_fob`'s cumulative MTD snapshot can never be averaged directly; a second,
  re-derived implementation would be exactly the kind of drift CLAUDE.md's "check whether a helper
  exists before writing one" rule exists to prevent.
- `src/components/PanelControls.js` — added `MTD_PRESET` (`{id:'mtd', label:'MTD', mtd:true}`) and
  taught `resolveDatePreset()` to resolve it to `[1st of the month, lastClosedBusinessDay()]`.
  Additive only — `DATE_RANGE_PRESETS` itself is untouched, so every existing report's own preset
  list is unaffected; a report opts in by including `MTD_PRESET` in its own `datePresets` array.
- `src/views/targets-vs-actual-report.js` — the panel. Built on `ReportShell` exactly like
  `fob-reference-table.js`, so it gets the criteria bar (date range + LocationSelector + Run) and
  Print/CSV/Excel/PDF export for free. Two pill tabs (Monthly/Daily, both computed in one Run so
  switching tabs needs no re-fetch). Rendered **per store** — a card per location with a
  McDonald's-red (`#DA291C`) accent left-border + bold store name, echoing the owner's own printed
  monthly-projections workbook (the "bonus" ask) — under a plain, theme-token-based table
  (`var(--surf)`/`var(--bdr)`/`var(--text)`), so the brand accent is the one deliberate literal-hex
  touch and everything else stays correct in both light (shipped default) and dark mode.
- `src/app/panel-registry.js` / `src/app/App.js` — registered `targets-vs-actual`,
  `perm:'analytics.store'`, `kind:'nav'`, `section:'reports'`, `route:true` — the exact same
  treatment `fob-reference-table` already has, since this is a direct, scoped owner request, not
  an experiment.

## Verified, not just unit-tested

Ran the app locally (`npm run dev`) and drove it with Playwright: nav search finds "Targets vs
Actual" under Reports, the date-range `<select>` options are exactly `7D / 14D / 21D / 28D / MTD /
Custom…`, Run Report renders a red-accented card per store with real `DEFAULT_TARGETS` numbers in
the Target column (Sales $111,513, Crew Labor 21.00%, OEPE 140s, etc.), and switching to the Daily
tab swaps in the daily metric set. Actual/Variance/Status read "—" in this sandboxed dev
environment because it has no live QSRSoft/Supabase data to query — expected, not a bug (confirmed
against the "0 stores · no data" freshness indicator the app itself shows).

17 new tests (`src/__tests__/dispatch-targets-vs-actual-report-2026-11-15.test.js`): the MTD
preset's date math (including the ABC 4am-cutover "last CLOSED business day" edge — noon on the
15th resolves to the 14th, not the 15th), `targetStatus()`'s ok/watch/miss/near-zero-target
branches, `effectiveMonthlyTarget()`'s override-vs-fallback merge, `computeTargetsVsActual()`
against the exact fixture `fob-reference-table-panel.test.js` already proves resolves the FOB-leg
math correctly (same 30-day September data, store 3708), and full panel renders (pre-run empty
state, a real run, tab switching, CSV export).

## What's deliberately NOT in this report

Two monthly_targets fields (`tBonusLabor` — bonus-qualifying crew %, `tFOBBonusBase`) have no
verified actual-value source anywhere in this codebase — rather than fabricate one, they're left
out of the Monthly tab. If a real actual-source for either is found later, adding it is a one-line
addition to `MONTHLY_TARGET_METRICS`.

## Follow-up (2026-11-15, same day): "wire in the Food cost items on monthly" + a Yearly tab

Owner: *"Can we wire in the Food cost items on monthly and add a yearly targets as well for the
yearly workbook uploaded."*

**Food cost items (Monthly tab):** re-checked every `DEFAULT_TARGETS` field against
`MONTHLY_TARGET_METRICS` — the only Food-Cost-group field not already wired was `tFOBBonusBase`
(the one left out above). Read `src/parsers/index.js` (`fobBonusBase` parses the workbook's
"Bonus Food Over Base Target" column) and `src/views/analytics.js`'s own Monthly Projections
workbook grid (`PROJ_FIELDS`), which places `tFOBBonusBase` immediately after `tFOBTotal` in the
same Food Cost group with no actual column of its own. Conclusion: it's not a separate measured
metric — it's a second, stricter target line graded against the exact same real Total Food Cost %
actual `tFOBTotal` already uses. Added as a 12th `MONTHLY_TARGET_METRICS` entry
(`fobBonusBase`), reusing `resolveMetricForRange(ds, loc, 'totalFoodCostPct', range)` verbatim —
not a new resolver. `tBonusLabor` (the labor-side sibling, same workbook row shape) stays out —
out of scope for a food-cost ask.

**Yearly tab:** added a third pill tab reading `ds.allYearlyTargets[year]`
(`loadAllYearlyTargets()`, already loaded into `ds` at startup) via new `YEARLY_TARGET_METRICS` +
`effectiveYearlyTarget()` exports in `targets-vs-actual.js`. Scoped to the 8 yearly_targets fields
that already have a verified daily/auto actual resolver reusable at this report's day-range grain
(Sales $, Labor %, TPPH, OEPE, Parked %, KVS Time, R2P, FOB Target % — the same resolvers the
Monthly/Daily tabs already use). **Deliberately excludes** the yearly workbook's CSAT
(OSAT/OSAT B2B/EAD/1-800 Contacts), Digital (App %/GCRD, McDelivery GCRD/Wait/Stars) and People
(staffing targets, turnover) fields, plus KVS Usage — `src/engine/review-engine.js`'s own
`REVIEW_METRIC_TARGET_FIELD` mapping (the other real consumer of these same yearly targets)
already establishes which of these have a real actual source and which don't: some have **no**
verified actual anywhere yet (McDelivery Stars: *"no actual-data source exists yet, enter
manually"*; OSAT B2B: *"owner-held pending his own investigation"*; 1-800 Contacts: a rate/count
unit mismatch never wired), and the rest (OSAT, EAD, headcount, shift-cert, turnover, McDelivery
wait/GC/R/D, digital GC/R/D) are computed by review-engine's own monthly `byLocMonth()` rollup —
a real, separate reuse target, but at a different grain (SMG/Roster/Turnover are monthly-cadence
uploads, not the day-level auto streams metric-source.js resolves) than this report's
7/14/21/28D/MTD picker fits cleanly. Left for a follow-on pass rather than guessed at here —
same "don't fabricate an actual" discipline as `tBonusLabor`/`tFOBBonusBase` above, just a bigger
lift to close correctly. `effectiveYearlyTarget()` deliberately has **no** `DEFAULT_TARGETS`
fallback (unlike `effectiveMonthlyTarget()`) — a yearly workbook may simply not exist for a given
store/year, and `DEFAULT_TARGETS` has no year dimension to fall back to.

9 new tests added to the existing dispatch test file (26 total): `fobBonusBase` reusing
`fobTotal`'s actual, `effectiveYearlyTarget()`'s no-fallback behavior, every
`YEARLY_TARGET_METRICS` entry's resolver + field-name sanity, a full yearly-tab compute against
the same proven fixture, the no-workbook-uploaded degrade case, and a Yearly-tab panel render.

## Bug fix, same day: "Also check labor target monthly. It is not right."

Owner flagged the Monthly tab's labor row directly. Root cause: v5.792 shipped a second,
redundant "Labor % (Overall)" row hardcoded to `targetField: 'tLabor'` — the exact legacy field
`src/engine/labor-basis.js` exists to retire after issue #153 (*"computeOpsScore graded on
`tLabor` while the approval cycle only ever populates `tCrewLabor`"*). That file's
`resolveLaborTarget()`/`DEFAULT_LABOR_BASIS` (`'tCrewLabor'`) is the single resolver every other
labor-target consumer in the codebase routes through (`morning-brief.js`, `at-a-glance.js`,
`store-analytics.js`, `labor-tools.js`, `analytics.js`, `store-dash.js`, `pipeline.js`,
`finding-rules.js`, `insights.js`, `one-pager-data.js`, `eom-supervisor.js`, `scheduling.js`,
`store-cockpit.js`, `bullseye-tile.js`, `labor-analysis.js`, `review-engine.js`, and more) — this
report was the one place in the codebase that bypassed it and read the field directly.

Fix: removed the `laborPctOverall` row entirely (it duplicated `crewLaborPct` against the wrong
field, never added real information); `crewLaborPct`'s target now resolves through
`resolveLaborTarget(targets)` instead of a hardcoded field read.

**Found the identical bug a second time before it shipped**, in this same commit's own new
`YEARLY_TARGET_METRICS` (`yLabor`, also hardcoded to `tLabor`) — caught by cross-checking against
`review-engine.js`'s `REVIEW_METRIC_TARGET_FIELD.labor` comment, which documents that dispatch
#142 already corrected this exact field to `tCrewLabor` for yearly data too, and that
`tCrewLabor` is itself a real `yearly_targets` column (`crew_labor_pct`), not monthly-only. Fixed
the same way: `yLabor` now routes through `resolveLaborTarget()`, relabeled "Crew Labor %" to
match `LABOR_BASIS_FIELDS.tCrewLabor.label`.

No other `MONTHLY_TARGET_METRICS`/`YEARLY_TARGET_METRICS`/`DAILY_TARGET_METRICS` entry reads a
labor field, so this was the full extent of it. Test fixtures/assertions updated to set
`tCrewLabor` instead of `tLabor`; full suite (8204 tests) and build re-verified green after the
fix, on top of the Food Cost/Yearly additions above.

## Follow-up (2026-11-15, v5.794): print view + Sales $ pacing

Owner: *"Can we make the print view look like the app view, and one page per location. And for
the sales target can you come up with a way to pace it based on what the actual is MTD vs
projected."*

**Print:** `ReportShell.js`'s Print action always rendered `printReportHTML()`'s generic flat
table (title + one wide table), never the report's own on-screen look — every OTHER hand-rolled
print flow in the codebase (skills-matrix.js, labor-analysis.js, performance-reviews.js, etc.)
builds bespoke HTML and calls the shared `printHtml()` overlay directly, so ReportShell was the
one place that couldn't. Added an optional `getPrintHTML` prop to `ReportShell` — when a report
supplies it, Print calls `printHtml(getPrintHTML())` instead of the generic path; CSV/Excel/PDF
are untouched (still `getExportData()`'s flat `{headers,rows}` contract) and every other
ReportShell-based report that doesn't set `getPrintHTML` is unaffected. `targets-vs-actual-
report.js`'s `buildPrintHTML()` renders the exact same red-accent-band + Metric/Target/Actual/
Variance/Status table `StoreWorkbookCard` shows on-screen (literal hex colors, since this is a
standalone printed document, not the themed app shell), one `<section class="store-page">` per
store with `page-break-before:always` skipped on `:first-child` — the same established
multi-page-print convention `skills-matrix.js`/`labor-analysis.js` already use, not a new
mechanism.

**Sales $ pacing:** a flat monthly Sales $ target compared against a partial-month MTD actual
always reads as a "miss" early in the month, even for a store solidly on pace. Checked for an
existing pacing convention before writing one (CLAUDE.md's "check whether a helper exists")
and found `src/views/analytics.js`'s `CurrentMonthPaceSection` — the live Projection Workspace's
"Actuals vs Target" pace table already does exactly this: `frac = dayOfMonth/daysInMonth; pace =
actual/frac`. That logic lives inline inside a large stateful component with no exported pure
function, so rather than import it (not designed for reuse) or silently re-derive it elsewhere
(the drift risk the "check first" rule exists to prevent), extracted the identical 3-line formula
as a small, explicitly-cited, standalone `monthEndPace(actual, rangeEndIso, targetMonthYm)` in
`targets-vs-actual.js` — same math, so this report's pace can never disagree with what the
Projection Workspace already shows for the same store/month. Returns `null` (no pacing applied)
whenever the window doesn't qualify: a full prior month, a multi-month span, or no target month
at all. Wired via a new `paced: true` flag on `MONTHLY_TARGET_METRICS`' `salesAmt` entry only —
scoped to the one metric the owner asked about, not a blanket change to every monthly row.
`computeTargetsVsActual` grades `diff`/`diffPct`/`status` off the pace (not the raw actual) when
`pace != null`, while still carrying the real MTD `actual` on the row so nothing is hidden — the
UI shows the real actual as the primary number with a small "Pace: $X" companion line underneath
(same text embedded inline for CSV/Excel/PDF/print, where there's no second line to use).

14 new tests (31 total): `monthEndPace()`'s qualifying/non-qualifying windows, `salesAmt` grading
off pace vs. a non-paced metric on the identical partial-month window never pacing, the on-screen
"Pace:" line, and the print HTML containing the page-break convention + the red accent + the pace
text. Live-verified via Playwright in the running dev server (card layout, tab switching, Print
overlay producing one `store-page` section per store with the red accent and gold header row);
this sandboxed dev environment has no live Supabase data, so Actual/Pace read "—" there exactly
like the original v5.792 live-verification — expected, not a gap, and covered by the fixture-based
tests above instead.

## Follow-up (2026-11-15, v5.795): FOB load-speed fix + Yearly tab year-to-date rollup

Owner: *"For monthly, the fob eventually loaded previously, but [is] not seeming to [load] now. Is
there anything we can do to load them faster? On the yearly, for sales[,] add the monthly actuals
together [to] generate the yearly actual based on that for completed months and pace for any
current month. For labor and fob, any suggestions on how we could calculate those? Monthly maybe
with a roll up based on dollars."*

**FOB load-speed fix (measured root cause, not a guess).** `fob-reference.js`'s
`resolveMetricForRange()` — the public resolver this report's Monthly tab calls once per store
**per FOB-leg metric** (12 of them: 11 `_FOB_LEG_MAP` entries + `fobBonusBase`) — called
`fobDailyDeltas(ds)` on every single invocation with **no cache**. `fobDailyDeltas` re-sorts and
re-reconstructs daily $ deltas for **every store's entire qsr_fob history** from scratch, just to
read one store's slice. With ~27 stores × 12 metrics = up to 324 full recomputations per report
run, this is an O(metrics × stores × all-history-rows) blowup that gets slower every month more
`qsr_fob` history accumulates — exactly matching "eventually loaded previously, but not now." Fix:
a `WeakMap` cache inside `fobDailyDeltas` itself, keyed on the `ds` object identity. Zero call-site
changes needed (`computeFobReferenceTable` and `resolveMetricForRange` both benefit automatically).
Safe because `App.js`'s `setDs` always replaces `ds` with a new object on any data change
(`setDs(prev => ({...prev, ...patch}))`) — a stale cache entry is simply unreachable (and GC'd) the
moment new data arrives, and re-renders against the same `ds` (switching this report's tabs
without re-running) correctly reuse the one computed result. 2 new tests prove reuse-by-reference
and no cross-`ds` leakage (`fob-reference.test.js`).

**Yearly tab — year-to-date rollup.** Every yearly metric's `actual` used to be computed over
whatever narrow 7/14/21/28D/MTD window the report's own date picker had selected — comparing a
few weeks of data against a full ANNUAL target never made sense. `computeTargetsVsActual` now
widens that window to Jan-1-through-the-picker's-end-date (clamped into the target year) for the
whole Yearly tab via a new `_yearToDateRange()` helper, and passes that widened range into every
yearly metric's `actual`/`paceFn` instead of the raw picker window.
- **Sales $**: a flat day-fraction pace at the YEAR grain would extrapolate an entire year from a
  handful of real months — far noisier than finishing the one month already in progress. So
  `_yearlySalesRollup()` sums each **completed** month's real total (Jan .. the month before the
  current one) plus the **current** month's own `monthEndPace()` projection — the literal "add the
  monthly actuals together ... for completed months and pace for any current month" the owner
  asked for. Returns `{real, paced}`: `real` is the honest to-date total (no projection) shown as
  the row's `actual`; `paced` drives `diff`/`status` via the same `paceFn` mechanism the Monthly
  tab's `salesAmt` already uses, generalized here since a year-grain pace needed different math
  than a month-grain one.
- **Crew Labor % / FOB Target %**: these were already dollar-weighted (`metricSumRatio`'s
  Σnumerator/Σdenominator, `resolveMetricForRange`'s Σ$-delta/Σsales) — simply handing them the
  widened YTD range **is** "a monthly rollup based on dollars" in one call, since summing day-level
  $ amounts across a year is mathematically identical to summing each month's own $ subtotal. No
  new math needed, just a wider window. A dedicated 3-month test fixture (July/August/September,
  each a different $ magnitude and %) proves the dollar-weighted result measurably differs from a
  naive average of monthly percentages (0.2766 dollar-weighted vs. 0.25 naive-average for labor;
  2.57% vs. 1.79% for FOB) — a single-month fixture can't distinguish the two, which is why the
  existing fixture alone wasn't enough to prove this correct.
- **TPPH/OEPE/Parked %/KVS Time/R2P** were left untouched (still graded over the picker's own
  narrow window) — the owner asked specifically about sales/labor/FOB, and these aren't $-based,
  so the "never average averages" argument doesn't apply the same way. This is a real, known
  inconsistency within the same tab (worth asking about as a follow-on), not something fixed
  silently.

9 new engine tests (45 total in the dispatch file) using a dedicated multi-month fixture
(`buildYtdDs()`) with deliberately different $ magnitudes per month so a naive-average bug would
be caught, not masked. Full suite (8219 tests) green, build clean, live-verified in the running
dev server (Yearly tab renders the updated explanatory copy, no console errors beyond the
sandbox's known unrelated 429 rate-limit noise).

## Follow-up, same day: auto-refresh after a late-arriving stream ("disappearing on mobile")

Owner, after the above shipped but before it merged: *"Fob loaded finally again. Just see if we
can make it quicker please. But, oddly enough just clicking back and forth between Meridian and
here on mobile made them disappear again. Almost seems like running the 28 day view populates it."*

Spawned a research fork (code-review only, no changes) to trace exactly how `ds.qsrFobRows` gets
into the app, since the symptom (data vanishes, a later run "fixes" it) pointed at something
beyond the per-call caching bug already fixed above. Findings, confirmed by reading the code
directly (not guessed):
- `qsrFobRows` loads **exactly once**, in the tiered startup sequence's T2 stage
  (`_stQsrsoftFob` → `loadQsrFob({daysBack:500})`, a ~16-month pull across all stores). There is
  no automatic reload afterward — only a manual Data Manager "↻ Sync" click re-fetches it.
- The app's one `visibilitychange` listener (`src/app/App.js`) only refreshes DAR rows
  (`refreshDar`) — it never touches `qsrFobRows`, never clears anything, and no other
  visibility/focus listener exists anywhere else in the app.
- `qsrFobRows` has **no IndexedDB/Dexie fallback** — `src/db/index.js`'s `DATA_STORES` list is
  the *manual*-upload streams only (the manual `fobRows`, distinct from the auto `qsrFobRows`).
  So after any full page reload, `ds.qsrFobRows` is empty until the T2 network fetch completes
  again, with nothing to show in the meantime.
- No on-demand/lazy backfill exists for FOB either (unlike `CurrentMonthPaceSection`'s
  `dsCoversMonthStart` pattern for sales streams) — FOB is pure "wait for T2."

**Conclusion (code-review level, not reproduced on a live mobile device — this sandbox has no
real device to test on, so this is the structural explanation, not a measured repro):** mobile
browsers commonly discard and reload a backgrounded tab. That resets the whole app, including
`ds`, and restarts the T2 FOB fetch from scratch. `TargetsVsActualReportPanel` is click-to-run
and doesn't react to `ds` changing after the click — so clicking Run Report immediately after
reopening the app, before T2's FOB fetch lands, shows blank FOB rows. Trying again a bit later
(the 28-day run) succeeds simply because, by then, the background fetch had finished — nothing
about "28 days" specifically triggers anything.

**What was fixed:** the loader itself (`loadQsrFob`'s `_pagedParallel` scheduling) carries its
own standing comment that two earlier tuning attempts made it *slower*, not faster, and says not
to re-tune it without a live before/after measurement — not available from this sandbox, so left
untouched. Instead, fixed the half that's actually under this report's control: added an
auto-refresh effect (`_dsFingerprint` + a `useEffect` in `targets-vs-actual-report.js`) that
notices when a stream that was still loading at Run time later lands, and silently recomputes
with the same params — so a report that was run too early self-corrects instead of sitting on a
part-blank result until the user happens to run it again. Deliberately fingerprints
`opsLaborRows`/`qsrFobRows`/`ebosRows`/`allMonthlyTargets`/`allYearlyTargets`, NOT
`laborRows`/`ctrlRows`/`opsRows` — those three are exactly the raw fields
`src/__tests__/ratchet-raw-metric-rows.test.js` (CLAUDE.md's "source data through the shared
helpers" standing rule) guards a panel against reading directly, and the excluded fields already
correlate with the same stream-arrival timing this exists to catch, so nothing is lost by leaving
them out. One new test (`buildYtdDs`-adjacent, in the main dispatch file) mounts with an empty
`ds`, runs, confirms blanks, then re-renders the same instance with real data and confirms the
report updates itself with no second click.

**What this does NOT fix:** the underlying T2 load time itself, and the "full reload wipes
React state back to the pre-run empty screen" case — if the whole app genuinely reloads, the
user still has to click Run Report once; the auto-refresh only prevents that one click from
landing on a stale, part-blank result if it's clicked impatiently. A faster FOB load (shrinking
`daysBack`, or re-touching the already-tuned pagination scheduling) would need a live
before/after measurement against production first, per that file's own standing warning —
flagged to the owner rather than guessed at.

## Correction, same day: TPPH/OEPE/Parked %/KVS Time/R2P were NOT actually excluded

The Yearly-tab writeup above told the owner these five metrics were "deliberately left on the
narrow picker window" — **that was wrong, and said without re-reading the code that had just
been written.** `computeTargetsVsActual`'s own dispatcher computes `actualRange` (the widened
Jan-1-through-asOf window) once and passes it into **every** `YEARLY_TARGET_METRICS` entry's
`actual()`, with no exceptions — `yTpph`/`yOepe`/`yPark`/`yKvst`/`yR2p` were already receiving
the widened range the moment the YTD rollup shipped, same as `yLabor`/`yFobTarget`. They need no
pacing (same reasoning as the dollar-weighted ratios: a mean-of-daily rate metric's YTD average
is already the honest, complete "actual" — nothing to project), so there was genuinely nothing
left to build.

What there WAS a real gap in: no test had ever proven this with real multi-month data — the
existing fixtures were single-month, so a "narrow window" bug and a "correctly widened window"
fix would have produced the identical number and passed either way. Extended `buildYtdDs()` with
per-month `tpph`/`oepe`/`kvst`/`park`/`r2p` values (July/August/Sep-partial, each a different
number) and added a test asserting all five read the real day-weighted mean across the full
year-to-date span, not the flat September-only value the narrow window would give. All passed on
the first run, against the pre-existing code — confirming the fix needed was to the test suite
and this file's accuracy, not to `targets-vs-actual.js`. CLAUDE.md's own "measure it, don't
reason about it" rule exists precisely to catch this kind of mistake; this is a case of it being
violated and then caught, not followed from the start.
