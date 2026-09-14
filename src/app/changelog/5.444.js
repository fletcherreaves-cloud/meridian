// @ts-nocheck
export default {version:'5.444', date:'2026-09-14', changes:[
  'Performance Trends -- Email Summary: fixed a real data-accuracy bug the owner caught within ' +
  'minutes of shipping v5.443. Sales/GC comps previously used engine/vs-ly.js\'s matchedVsLY, ' +
  'which sums each day against its OWN 364-day-back/matched-weekday shadow value ' +
  '(qsr_daily_activity_rollup\'s ly_product_sales/ly_transactions) -- correct for a week-shaped ' +
  'window, wrong for a calendar MONTH (the "last year" days it lands on are weekday-shifted, not ' +
  'the real prior-year month). This is the exact bug class scripts/refresh-projections-' +
  'workbook.py\'s own docstring already documented and fixed for its own monthly comps. Sales/GC ' +
  'now use a genuine calendar-year-over-year comparison: this period\'s real total vs. the exact ' +
  'same month/day range one year earlier, both summed independently from real per-day rows via ' +
  'the new periodRealComp()/shiftYearBack() (engine/trend-report.js).',
  'Also fixed the missing-June symptom: Email Summary now fetches its OWN ~16-month window of ' +
  'qsr_daily_activity_rollup history (loadQsrActSummary, scopeSummaryFetchDaysBack()) on first ' +
  'entering that mode, instead of relying on ds\'s default 60-day load window (App.js\'s ' +
  '_stQsrsoftActSummary) -- nowhere near enough to cover a full year back from the oldest of the ' +
  '3 trailing months. Labor %/FOB % are unchanged (still ds-sourced via periodValue) -- the ' +
  'owner did not report those as wrong and nothing indicated their sourcing was the problem.',
  'Percents now render to 2 decimals everywhere in Performance Trends (was 1), and Avg Check ' +
  'gets its own \'$$\' unit ($xx.xx, cents-precision) distinct from Sales\' whole-dollar \'$\' -- ' +
  'both owner-requested.',
  '8 new/extended tests (periodRealComp, shiftYearBack, scopeSummaryFetchDaysBack, the fixed ' +
  'computeScopeSummary with a decoy lySales/lyGc field the fix must not read, 2-decimal ' +
  'formatting). Full suite 514/514 files, 4934/4934 tests. Build clean.',
]};
