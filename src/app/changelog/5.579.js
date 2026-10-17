// @ts-nocheck
export default {version:'5.579', date:'2026-10-17', changes:[
  '**Custom Report Builder — "View As" Daily/Weekly/Monthly breakout** (owner ask: "if [I] have ' +
  '28 day[s] selected, let me ch[oo]se how to view [the] report"). The picked date range is ' +
  'unchanged -- a new dropdown next to the results table breaks that same window out into one ' +
  'row per store per day/week/month instead of one totalled row. New engine/custom-report.js ' +
  'splitRangeByGranularity() clips weekly/monthly periods to the picked range at both ends (a ' +
  '28-day window starting mid-week never pulls in days outside what was actually selected); ' +
  'buildCustomReportRows()\'s new `groupBy` param defaults to \'range\' (the original, ungrouped ' +
  'one-row-per-store shape, unchanged for every existing caller/saved definition).',
  '**Date-range and location pickers on all 9 report panels condensed to dropdowns** (owner: ' +
  '"condense the date selections and location selections to drop downs and selector/pickers as ' +
  'we have before... a much cleaner look"). DateRangeControl and LocationSelector ' +
  '(components/PanelControls.js) both take a new `variant: \'dropdown\'` -- a single <select> in ' +
  'place of a row of pills, LocationSelector\'s using <optgroup> to keep the same All -> State -> ' +
  'Patch -> Store hierarchy the pill version has. ReportShell (and so every report built on it -- ' +
  'Controls Deep-Dive, Weather Impact, Price Change Impact, Item Velocity, Channel Mix, Labor ' +
  'Opportunity Cost, Custom Report Builder, Loss Prevention Summary, Cash-Variance Pattern) now ' +
  'passes `variant:\'dropdown\'` to both. The pill variant stays the default everywhere else -- ' +
  'this is additive, not a sweep of the ~90 other panels still on the pill standard.',
]};
