# Dispatch #171 — Projections vs Actuals: custom date-range picker (Feature Request)

## The live FR (read from Supabase `feature_requests`, 2026-08-27)

> **Title**: Projections vs Actuals
> **Description**: Add date range picker, if possible, so I can choose custom date ranges to
> review. Ex: I would like to be able to select an entire month.
> **Category**: Labor · **Status**: idea · **Created**: 2026-07-15

## Where this is

`ProjectionVsActualsReport` (`src/views/analytics.js:6850`) — the "PROJECTION vs ACTUALS
REPORT... Professional backtest comparison" panel, opened from `App.js`'s `showPVSA` modal flag
(single call site, not yet `route:true`). It compares the forecast engine's own backtested
prediction against real actuals, by location/patch/operator/org, week by week.

**The actual gap**: `weeksBack` (`React.useState(4)`) is the ONLY period control — three fixed
preset buttons, `[2, 4, 6]` weeks back (~line 7077). `runBacktest()` always builds `weeksBack`
complete Wed-Tue weeks counting back from today (~line 6864-6872); there is no way to pick an
arbitrary range, and no way to land on "a specific past month" the way the FR's own example asks
for.

## Reuse, don't reinvent — a working custom-range picker already exists in this same file

`DateRangeReport` (`src/views/analytics.js:6222`, a DIFFERENT report in the same module) already
has a real `startDate`/`endDate` picker (`React.useState(fmt(addD(today,-13)))` /
`React.useState(fmt(today))`, plain `<input type="date">` pair). Match that UI pattern rather than
inventing a new one — this repo's panel-contract precedent (`memory/panel-contract.md`) already
carves out "period-anchored" panels as sometimes correctly NOT using the shared `DateRangeControl`
component; check that file's date-mode table first to decide whether this panel fits the
period-anchored exemption or should adopt `DateRangeControl` properly — don't assume either way
without reading it.

## The real design question: this engine runs on WHOLE Wed-Tue weeks, not arbitrary days

`runBacktest()`'s loop is fundamentally week-shaped (it only ever evaluates full business weeks,
matching this project's standing 4am/Wed-anchored business-week convention elsewhere). A custom
date range needs a clear, stated rule for how it maps onto week boundaries — pick one and document
it in the PR, don't leave it ambiguous:
- **Option A**: the custom range selects however many complete Wed-Tue weeks OVERLAP the picked
  range (a "whole month" pick would include the partial weeks at the month's start/end, same as
  how a calendar month never divides evenly into business weeks).
- **Option B**: only weeks FULLY CONTAINED within the picked range count (stricter, but a "whole
  month" pick could silently drop the first/last few days' data with no explanation on-screen).
Whichever is chosen, the report's own UI must SAY which weeks it actually evaluated (start/end
dates and count), not just a bare "success" state — this matters because the panel already reports
MAPE/vs-LY at the week level, and a user picking "August" should be able to see exactly which
weeks that resolved to.

## Task

1. Add a custom date-range option to `ProjectionVsActualsReport`, additive alongside the existing
   `[2,4,6]`-weeks-back presets (same posture as dispatch #158's own One-Pager custom-range
   addition — presets stay for the common case, custom is the new option, neither replaces the
   other).
2. Resolve the week-boundary question above explicitly, and surface which weeks were actually
   evaluated in the report's own output.
3. A reasonable, low-effort addition given the FR's own named example: a quick "This month" /
   "Last month" shortcut alongside the raw date inputs, since "select an entire month" is the
   literal ask — but the raw custom start/end pair must work regardless of whether this shortcut
   is added.

## Verification

- Render-based test against the REAL `ProjectionVsActualsReport` component proving a custom range
  actually changes which weeks get backtested (not just that new UI renders) — per this repo's
  "verification must touch the call site" rule.
- Confirm the existing `[2,4,6]`-week presets are unaffected (regression-free).
- Standard suite + build bar.

## Out of scope

- `DateRangeReport` itself (the precedent panel) — read for its UI pattern, don't modify it.
- Any change to the forecast engine (`forecastDay`) or the MAPE/vs-LY math — this is a period-
  selection UI change only.
