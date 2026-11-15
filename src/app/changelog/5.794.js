// @ts-nocheck
export default {version:'5.794', date:'2026-11-15', changes:[
  '**Targets vs Actual: print matches the app view, one page per store.** Owner feedback: "Can ' +
  'we make the print view look like the app view, and one page per location." Print no longer ' +
  'renders the generic flat ReportShell table — it builds the exact same McDonald\'s-red workbook ' +
  'card (accent band, Metric/Target/Actual/Variance/Status table) every store already shows ' +
  'on-screen, one store per printed page (the same `page-break-before` convention ' +
  'skills-matrix.js/labor-analysis.js already use for multi-store print reports). ' +
  '`ReportShell.js` gained an optional `getPrintHTML` prop so a report can supply bespoke print ' +
  'HTML instead of the generic table — existing reports that don\'t set it are unaffected.',
  '**Sales $ now grades against a month-end pace, not the raw MTD total.** Owner follow-up: "for ' +
  'the sales target can you come up with a way to pace it based on what the actual is MTD vs ' +
  'projected." A flat monthly Sales $ target compared against a partial-month actual always read ' +
  'as a "miss" on day 3 of the month. New `monthEndPace()` (targets-vs-actual.js) projects the ' +
  'month-end total as MTD actual ÷ fraction-of-month-elapsed — the same linear run-rate the live ' +
  'Projection Workspace\'s Actuals-vs-Target pace table already uses (analytics.js\'s ' +
  'CurrentMonthPaceSection), so this report\'s pace never disagrees with that one for the same ' +
  'month. Target/Variance/Status now grade off the pace whenever the window qualifies (ends ' +
  'mid-month); the real, honest MTD actual still shows as a small "Pace: $X" companion line so ' +
  'nothing is hidden. Carries through to CSV/Excel/PDF export and the new print view too.',
  '14 new tests (31 total in the dispatch file).',
]};
