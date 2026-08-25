# Dispatch #134 — Schedule Summary: per-store training-retention report (period, side-by-side
# weeks) + print/export

**Owner's ask (2026-08-25):** *"For Scheduling > Schedule Summary > I need a report for each
location (it can be a permanent report) that allows for a period to be selected and then a side
be side of each week in that period for what is displayed on the panel currently. The goal is to
see (for now at least) if the stores are retaining their training from the schedule workshop they
attended > Bonus to tie in actual labor results and hours over/under once the week has completed.
I would like to see at least 4 weeks of schedules prior to class and all weeks since. Any provided
smart analysis would also be welcome for inclusion. Design layout, up to you to figure out a great
visual display that is easy to read and understand."* Plus: *"If it makes sense while in the
dashboard, add report options as well for print/export/etc."*

## Grounding — read the existing engine/panel first, this is a reuse job, not a rebuild

`src/views/schedule-summary.js` + `src/engine/schedule-summary.js` already compute and render
everything this report needs to show **per week, per store**: `fcstSales`, `fcstGC`, `laborPct`
(dollar-weighted, actual-sales-weighted — see `rollup()`'s `#361` comment, never re-derive this),
`schedHrs`/`fcstHrs`/`hrsDiff`, `tpmh`, `fixedLaborPct`/`floorLaborPct`/`combinedFixedFloorPct`,
plus the per-station hours+cost breakdown (`StationBreakdown`). **The "bonus" ask — actual labor
results and hours over/under once a week completes — is already IN this same rollup**: `sales`
(actual, vs `fcstSales`) and `laborPct` are computed from real actuals (`r.sales`/`r.laborPct`),
not forecast, whenever a week has posted actuals; a week with no actuals yet naturally leaves
those fields at their forecast-only state. **Do not re-derive any of this from raw
`lifelenz_schedule` rows** — call `rollup()` (or a very small wrapper around it) once per
LifeLenz business week (Wed-start, `WEEK_START_DOW`/`weekStartOf()` — reuse, don't reinvent) for
the selected store across the selected period, and reuse `schedHrsOf`/`fcstHrsOf`/`normLaborPct`
exactly as-is.

## Scope — build

1. **New report** (a real, permanent addition, not a modal — the owner said "permanent report"
   and this session's standing instruction is to keep building `route:true` panels; make this one
   from day one, per-location deep-linkable, e.g. `?panel=schedule-retention&loc=5985`).
   - **Location selector** — single-store focus (the report is inherently per-location; a
     `LocationSelector` in `mode:'store'`, per `panel-contract.md`, is the right shape here, not
     the full progressive hierarchy).
   - **Period selector** — `DateRangeControl` or a from/to week picker; whichever fits the
     "select a period, see every week in it side by side" framing best. No default auto-anchor
     to a stored "class date" is required — the owner will pick the period manually per store
     (at least 4 weeks before + all weeks since the workshop, per their own records) — **do not
     build a new class-date data pipeline for this**, that's out of scope; if you find it's
     trivial to also surface the org-structure "1st Schedule Week"/"Schedule Workshop" dates
     inside the picker as a convenience (e.g. once dispatch #135's spreadsheet data exists
     in-app some other way), note it as a follow-up idea, don't build new ingestion for it now.
   - **Side-by-side weeks**: each LifeLenz business week in the selected period becomes one
     column; the metrics listed above become rows — same shape as `schedule-summary.js`'s
     existing per-store row/expansion, just weeks-across instead of stores-across. Include the
     per-station breakdown per week if it fits the layout without becoming unreadable at 4+
     weeks wide (your call — a collapsible/expandable per-week detail is a reasonable
     compromise if the full grid gets too wide).
   - **Visual design — your call, but it must actually answer "did training stick?"** at a
     glance: a viewer should be able to look at the row for e.g. Labor % or Hours ± Fcst and see
     whether the trend improved/held/worsened across the weeks, not just read raw numbers. Color
     coding, sparkline-style trend indicators, or a simple "vs. pre-class average" delta column
     are all reasonable — pick something that reads clearly, consistent with this app's existing
     density-first, no-chartjunk conventions (see `dt-speedofservice.js`'s trend charts or
     `visit-readiness.js`'s per-store rows for this app's established visual language).
   - **Smart analysis**: a short, plain-language summary derived from the actual computed
     week-over-week numbers (e.g. "Labor % has moved from X% pre-class average to Y% post-class
     average, a Zpp {improvement/regression}" or similar) — grounded in real deltas from the
     rendered data, never a fabricated or generic insight. Follow this app's "voice by role"
     standing rule (CLAUDE.md UI Conventions) — state the number AND what it means in plain
     restaurant words, don't replace the exact figures.
2. **Print/export** on this new report — reuse `ExportDropdown` and this session's established
   printable-report pattern (`StoreOnePager`'s `generateAndPrint()`, or the pattern dispatches
   #122/#129 just used) rather than inventing a third approach. A side-by-side week grid is
   exactly the kind of wide table that needs the full-content (not viewport-clipped) print
   treatment those dispatches already established — don't reintroduce that bug in a new panel.

## Do NOT

- Do not re-derive `laborPct`/`schedHrs`/`fcstHrs`/`tpmh`/Fixed-Floor math — call into
  `src/engine/schedule-summary.js`'s existing exported functions.
- Do not build a new class-date/workshop-date data table or upload pipeline — period selection is
  manual, per the owner's own framing ("a period to be selected").
- Do not touch the existing `Schedule Summary` panel's current (all-stores, one-week) behavior —
  this is a new, additional report, not a replacement.

## Verification bar

- Render the report for a real store across a period spanning both pre- and post-actuals weeks
  (some weeks forecast-only, some with real `sales`/actual `laborPct` posted) and confirm the
  numbers for each week match what `Schedule Summary`'s existing per-store row shows for that
  same store/week when viewed there directly — this is a reuse job, the numbers must reconcile
  exactly, not approximately.
- Confirm the smart-analysis text changes when the underlying weekly figures change (i.e. it's
  computed from real data, not a static string) — trivial to prove with two different stores/
  periods producing different narrative text.
- Confirm print/export produces the full period's data, not just what's scrolled into view.
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build`
  clean; report before/after entry-chunk size (should be a new lazy-loaded panel).

## PM note (not part of the dispatch scope, context only)

A companion, already-delivered spreadsheet (updated copy of the owner's Organization Structure
workbook, with a live "1st Schedule Week" column added to the Locations sheet, sourced by formula
from the existing "Scheduling Setup" sheet) exists outside this codebase and is not part of this
engineer's task — mentioned here only so the report's period-selector isn't designed assuming
Meridian itself stores that date anywhere.
