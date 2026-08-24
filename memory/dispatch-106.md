---
name: dispatch-106
description: Forecast Accuracy (analytics.js's ForecastAccuracyPanel) already has a period picker (2wk/4wk/6wk/3m/6m/YTD/Last Month/Last Year/Custom) but no week-by-week or day-by-day breakdown table like LifeLenz's own native Forecast Accuracy Analysis screen -- owner wants a weekly-cadence view added, anchored on settings.weekStartDay (already 3=Wednesday, McDonald's standard, already flowing into this panel as a prop -- not a new setting to invent). Owner also wants this panel and the reworked LifeLenz Bridge (dispatch #105) merged into one parent category with each as a selectable report inside it, once both have a consistent date/week control.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #106 — Forecast Accuracy weekly-cadence view, then merge with LifeLenz Bridge into one parent

**Read first:** `memory/dispatch-105.md` (LifeLenz Bridge's own date-range/Wednesday-week work,
Part 1 of which this dispatch's Phase B depends on).

**Status:** Phase A (Forecast Accuracy's own weekly-cadence view) is ready to build now. Phase B
(the merge) should not start until both panels have shipped their own date/week work — see
sequencing below.

**⚠️ UPDATE (2026-08-24) — dispatch #105 Part 1 has shipped; Phase B's sequencing dependency is
now satisfied.** `lifelenz-bridge` was renamed to the owner-confirmed **"MBI vs LifeLenz Accuracy"**
(not the "Forecast Reconciliation" name this dispatch's Phase B step 4 below still references —
that proposal is superseded, use "MBI vs LifeLenz Accuracy" instead), given a real date-range
control + Wednesday-start weekly grouping (reusing the pre-existing `weekStartOf()` helper in
`src/utils/date.js`, reading `settings.weekStartDay` — same pattern this dispatch's Phase A should
use), and a `route:true` entry in `panel-registry.js`. Both Phase A and Phase B can now proceed in
the same effort — Phase A first (this panel's own weekly view, independent work), then Phase B (the
merge) once Phase A is done, per the sequencing already described below.

---

## Owner's ask, in full

*"Forecast Accuracy > Add date selector to this as well (Weekly cadence with Wednesday start based
on system settings) > Let's come up with a plan to merge this and the LifeLenz Bridge rework into
the same parent category with each as options for reports within."*

## What Forecast Accuracy already has (checked, not assumed)

`ForecastAccuracyPanel` (`src/views/analytics.js`, ~line 3351) already has a real period picker —
`PERIODS` = 2wk/4wk/6wk/3m/6m/YTD/Last Month/Last Year/**Custom** (with `cStart`/`cEnd` date inputs)
— and computes district/store MAPE across whichever range is selected. **This is not "no date
selector at all"** — what's actually missing, matching LifeLenz's own native reference screenshots
(Forecast Sales/Actual Sales/Variance, one row per day, grouped into a Wednesday–Tuesday week), is a
**week-by-week or day-by-day breakdown table**, not just an aggregate MAPE number over the whole
period.

**"Based on system settings" is a real, existing setting — not a new one to add.**
`DEF_SETTINGS.weekStartDay = 3` (`src/constants.js`, ~line 103, comment: *"0=Sun 1=Mon 3=Wed
(McDonald's standard)"*) already exists and is already McDonald's/this district's real business-week
anchor. `ForecastAccuracyPanel` already receives `settings` as a prop — `settings.weekStartDay` is
directly available, no new plumbing needed. Use it, don't hardcode "3" or "Wednesday" a second time
in a new location (this repo has enough duplicated-constant drift already per CLAUDE.md's Dev
Rules — one shared setting, read wherever it's needed).

## Phase A — add the weekly-cadence breakdown view (build now)

Add a day-by-day (or week-grouped, matching the LifeLenz reference screenshot's exact shape:
Forecast / Actual / Variance per day, grouped Wed–Tue) breakdown to `ForecastAccuracyPanel`,
anchored on `settings.weekStartDay`. This is additive to the existing period-aggregate MAPE view,
not a replacement — the existing `PERIODS` picker and MAPE-by-model table stay as-is; this is a new
drill-down/detail view alongside them (exact placement — new tab within the panel, or an expandable
section — is an implementation choice, follow whatever this panel's existing internal layout makes
easiest to slot into cleanly).

## Phase B — merge Forecast Accuracy + LifeLenz Bridge into one parent, each as a report option

**Sequencing: do not start until BOTH of these have shipped:**
1. This dispatch's Phase A (Forecast Accuracy's weekly-cadence view).
2. Dispatch #105's Part 1 (LifeLenz Bridge's date-range selector + Wednesday-start weekly grouping).

Merging first and adding consistent date controls after would mean building the shared parent's
date/week UI twice, or building it once and then discovering the two panels' underlying data don't
line up on the same week boundary. Landing both panels on `settings.weekStartDay` first makes the
merge close to mechanical.

**How to structure the merge — follow this app's own established pattern, don't invent a new one.**
This repo already has the "one panel, multiple internal report/mode tabs" pattern working in
production: `eom-dashboard.js`'s Scoreboard/EOM Count/Count Cycle tabs, and `security-panel.js`'s
Cash/Inventory domain tabs. There is **no** existing "registry-level parent panel with child report
panels" pattern (checked `panel-registry.js` — no such structure exists yet) — so the natural,
consistent choice is a single new panel component with an internal tab switcher, not a new
registry-level hierarchy concept.

Concretely:
1. Create one new panel (new component, new `panel-registry.js` entry — under `section:'forecasting'`,
   matching where both `fcst-accuracy` and `lifelenz-bridge` already live) that renders an internal
   tab bar with (at minimum) "Forecast Accuracy" and the LifeLenz Bridge's new name (dispatch #105
   recommended **"Forecast Reconciliation"** — confirm the owner's final choice before shipping the
   label) as its two report options.
2. Each tab renders the existing panel component's body (reuse `ForecastAccuracyPanel`/
   `LifeLenzBridgePanel` as-is inside the new tab shell — do not duplicate their logic into the new
   parent; it should be a thin wrapper).
3. Retire the two standalone `panel-registry.js` entries (`fcst-accuracy`, `lifelenz-bridge`) in
   favor of the one new parent entry — check `panel-registry.js`'s promotion-test discipline
   (CLAUDE.md: *"kind: is lifecycle, section: is placement"*) so this doesn't silently double-render
   or leave a dangling nav item.
4. Propose a name for the merged parent category itself (distinct from the two report names inside
   it) — not yet decided; a reasonable starting candidate is **"Forecast Reports"** or **"Forecasting
   Center"**, but confirm with the owner rather than picking unilaterally.

## Verification bar

- Phase A: render the actual `ForecastAccuracyPanel` consumer, confirm the weekly breakdown groups
  days into real Wednesday-start weeks (verify against `settings.weekStartDay`, not a hardcoded
  assumption), and confirm the existing period-picker/MAPE view is completely unchanged.
- Phase B: render the merged parent panel, confirm both report tabs render their real underlying
  content unchanged (same data, same computations — this is a navigation/chrome change, not a
  logic change), and confirm the old standalone nav entries are gone with no dangling/duplicate
  render path (per CLAUDE.md's promotion-test discipline).

## Do NOT

- **Do not start Phase B before both Phase A and dispatch #105 Part 1 have shipped.**
- **Do not hardcode Wednesday/weekStartDay=3 in a new location** — read `settings.weekStartDay`,
  the one already-existing shared setting.
- **Do not invent a new registry-level parent/child panel concept** — use the existing
  internal-tab-switcher pattern this app already has in production (`eom-dashboard.js`,
  `security-panel.js`).
- **Do not finalize the merged parent's name or the "Forecast Reconciliation" rename without
  confirming with the owner** — both are proposed, not decided.

## Resolution (2026-08-24, v5.149)

Both phases shipped, in two commits on this branch: Phase A first (`ForecastAccuracyPanel`'s
weekly-cadence breakdown), then Phase B (the merge), matching the sequencing this dispatch
specified. dispatch #105's Phase B prerequisite ("MBI vs LifeLenz Accuracy" renamed + given a
real date-range control) was already live on `main` before this session started, confirmed by
reading `src/features/lifelenz.js`'s `LifeLenzBridgePanel` directly rather than trusting the
dispatch text alone.

**Phase A** — added a "Weekly / Daily Breakdown" section to `ForecastAccuracyPanel`
(`src/views/analytics.js`), collapsed by default, same expand/collapse pattern as the existing
Day-of-Week Accuracy Breakdown section right above it. It is additive: the existing `PERIODS`
picker and MAPE-by-model table are untouched — verified by rendering the real panel, running a
backtest, and asserting both the pre-existing "Best Model (District)"/"AI Forecast MAPE"/"MAPE
by Store" text AND the new section's content are present simultaneously, not one replacing the
other.

Implementation: the existing per-row backtest loop already computes `f.forecast` (the AI
Forecast model) and the row's actual `act` for every day — a small addition (`dailyMap`)
accumulates both, summed across every selected location for `'All Locations'`, into one entry
per calendar day (`dailyRows`). A new module-level helper, `groupForecastDaysByWeek()` (mirrors
`lifelenz.js`'s `groupDaysByWeek`/`groupAccByWeek` — same `weekStartOf` boundary math, different
per-day shape, so kept local rather than force-fit into an existing helper with the wrong
fields), groups `dailyRows` into weeks starting on `settings.weekStartDay` at render time. No
new `forecastDay` calls were added — Phase A is a pure read of numbers the backtest already
computes.

**Verified against real rendered behavior, not "should work":** a new end-to-end test
(`src/__tests__/dispatch-106-forecast-reports.test.js`) renders the actual panel, drives it
through a real Custom-range backtest over a 14-day fixture straddling a real Wednesday (Jul 15
2026), and asserts the rendered week headers read exactly `"Week of Jul 15–Jul 21"` and `"Week
of Jul 22–Jul 28"` — NOT a Sunday-start (`"Jul 12–Jul 18"`) or Monday-start (`"Jul 13–Jul 19"`)
boundary, which is the failure mode a hardcoded-Wednesday or off-by-one implementation would
have produced. The mock `forecastDay` returns a value that is a pure, deterministic function of
`date.getDay()`, so the test independently re-derives the expected weekly $ totals from the same
formula rather than asserting hand-computed magic numbers, and confirms the exact `$350 over`
weekly variance the fixture implies (every day is forecast exactly $50 over actual, 7 days per
week).

**Phase B** — merged `ForecastAccuracyPanel` and `LifeLenzBridgePanel` into one new component,
`ForecastReportsPanel` (`src/features/forecast-reports.js`), following the internal-tab-switcher
pattern already in production (`eom-dashboard.js`'s Scoreboard/EOM Count/Count Cycle segmented
control, `security-panel.js`'s domain tabs) — confirmed by reading both files before writing any
code, not assumed from the dispatch's description. `forecast-reports.js` is a thin shell: it
does not reimplement or duplicate either panel's logic. Both children reuse the two real,
existing panel components exactly as they already render (including their own internal
title-bar chrome), and stay **mounted simultaneously**, switched via CSS `display` rather than
conditional mount/unmount — deliberately, so a completed backtest or a live LifeLenz scan is not
thrown away by switching tabs and back. This is verified directly: the test suite runs a real
backtest, switches to the other tab, switches back, and asserts the backtest results are still
on screen (not reset to the panel's empty "Select a period and run the backtest" state).

The one code change to either existing panel: both `ForecastAccuracyPanel` and
`LifeLenzBridgePanel` gained a new, optional, additive `headerTabs` prop (undefined-safe — a
no-op for any other caller) that lets the new shell render its report-switcher segmented control
inside each panel's own existing header row, instead of layering a second header on top of their
own `position:fixed` full-screen chrome. This was a deliberate design choice over the
alternative (stripping each panel's own chrome into an `embedded` mode, as `SchedulingHubPanel`
does for its own tabs) — that alternative would have meant editing each panel's layout structure
non-trivially (their flex layouts depend on owning their own fixed-position sizing), a much
larger and riskier diff for the same user-visible result.

**Registry (`panel-registry.js`) — a deliberate departure from the dispatch's literal wording.**
The dispatch said "retire the two standalone entries." Literally deleting them would have broken
this repo's own registry-integrity tests (`panel-registry.test.js`'s "every onOpenModal handler
is registered" / "every registered panel has a dispatch handler" invariants, which the dispatch
itself references as something to check) — a legacy `modal==='fcst-accuracy'` dispatch branch
with no matching registry entry, or a registry entry with no dispatch branch, is exactly the drift
those tests exist to catch. Instead, `fcst-accuracy` and `lifelenz-bridge` were converted to
`kind:'hub-tab'` — the registry's own pre-existing "opens a hub and selects a tab, no sidebar
entry of its own" pattern, already used for `sched-summary`/`labor-analytics`/`skills-matrix`
pointing at `SchedulingHubPanel`. This is functionally equivalent to "retired" (neither renders
standalone anywhere, confirmed by the shell-nav-snapshot test's rewritten assertion that neither
label appears in ANY sidebar dimension any more) while keeping the registry internally
consistent using an established pattern rather than a special case. One new entry,
`forecast-reports`, carries `route:true` (both merged panels had grown a real date/week control
worth linking to) and `kind:'test-kitchen'` at `tkOrder:5` (`fcst-accuracy`'s old slot — not a
promotion).

App.js: `fcst-accuracy`/`lifelenz-bridge` dispatch branches now set a new `forecastReportsTab`
state (same pattern as the pre-existing `schedTab`/`planningTab`) before routing to
`'forecast-reports'`, so a stale deep link or the At-A-Glance "Forecast Accuracy (MAPE)" tile
still opens the correct internal tab rather than always defaulting to the first one.
`LifeLenzBridgePanel`'s import moved from a static `App.js` import to fully lazy (it is now only
reachable through `forecast-reports.js`'s own dynamic import) — a real entry-chunk win per
CLAUDE.md's performance-budget rule, not incidental: entry chunk `index.js` dropped from
1761.65 KB to 1566.23 KB raw (522.90 KB → 456.11 KB gzip, measured on the same rebased tree
before/after this change).

**⚠️ The merged parent's name/label — "Forecast Reports" — is a PROPOSAL, not owner-confirmed,**
exactly as this dispatch required. Both candidate names from the dispatch ("Forecast Reports" /
"Forecasting Center") remain viable; "Forecast Reports" was picked for this PR because it is
shorter and matches the existing `'reports'` section id's naming register, and is flagged as a
proposal in the registry comment, the App.js render comment, and the PR/commit body — not
presented as decided. Changing it later is a one-line edit (`panel-registry.js`'s `label` field)
plus the `RoutePanelShell` title string in `App.js`.

**Tests updated to match the new registry shape, not left passing by coincidence.**
`panel-registry.test.js`'s route-panel census (11 → 10) and route-id list, `routing.test.js`'s
`fcst-accuracy` → `forecast-reports` swap, and `shell-nav-snapshot.test.js`'s Test Kitchen census
(13 → 12), its full nav-text `EXPECTED` snapshot, its `analytics.forecasting` hidden-set list,
and its dispatch #55 Part A membership-diff `describe` block (rewritten — that block's own
assertion is superseded by this merge, since `kind:'hub-tab'` renders nowhere in the sidebar in
any dimension, unlike the `kind:'test-kitchen'` behavior it used to check) were all updated by
running the actual test suite against the actual registry change and fixing what broke, not by
guessing what should change.

**Full verification, on the rebased tree (this branch was rebased onto `origin/main` immediately
before the final commit, picking up dispatch #107 and #109 which landed mid-session):**
`npm run build` clean; full `vitest run` — 225/225 test files, 2336/2336 tests passing.
`node scripts/gen-changelog-latest.mjs --write` run after adding `src/app/changelog/5.149.js`.
