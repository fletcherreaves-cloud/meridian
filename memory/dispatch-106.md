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
