// @ts-nocheck
export default {version:'5.400', date:'2026-09-07', changes:[
  'District View "AI Insights" button (analytics.js generateInsights()) declared laborRows/' +
  'ctrlRows/opsRows (raw-filtered from ds) plus an avg helper, then never referenced any of ' +
  'them again anywhere in the function -- the AI prompt context is built entirely from already-' +
  'computed p./t./store. fields. Confirmed dead via a full search of the function body, not an ' +
  'unused-import guess, before deleting.',
  'This closes the labor_rows backlog sweep item -- every file the original grep flagged has ' +
  'now been read and classified. Final tally: 2 real UI violations already fixed this session ' +
  '(store-analytics.js Shift Analysis tab, signals.js location pickers), this dead-code cleanup, ' +
  '1 real but deliberately-deferred systemic gap identified (why.js/ds.loaded), 1 narrow ' +
  'documented gap left as-is (labor-tools.js crewHrs, no auto source exists yet), and roughly a ' +
  'dozen files confirmed already correct with real documented fix history.',
  'ratchet-raw-metric-rows.test.js CEILING 149 -> 143 to match. Full suite 487 files/4627 tests, ' +
  'build clean, eager budget 538.01 KB / 850 KB.',
]};
