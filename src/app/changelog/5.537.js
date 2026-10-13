// @ts-nocheck
export default {version:'5.537', date:'2026-10-13', changes:[
  'Verified Record Hour\'s quarter-hour pull live (confirming v5.536\'s fix): the re-triggered ' +
  'run accepted segmentBy/timeInterval=\'qtr\' and returned 96 distinct qtr_slot values/store/day ' +
  '-- true 15-minute granularity, not a silent hourly fallback -- independently re-confirmed via a ' +
  'direct Supabase query (96 distinct slots, 04:15..28:00) rather than trusting the pull script\'s ' +
  'own log alone.',
  'Backfilled qsr_sales_quarter_hour\'s full available history: 2024-01-01 (the same floor ' +
  'qsr_daily_activity/qsr_cash_sheet/qsr_service_stats/qsr_sales_mix/qsr_labor_summary already sit ' +
  'at, for the identical QSRSoft endpoint) through today, in quarterly chunks via workflow_dispatch. ' +
  'Measured before assuming the API supported quarter-hour grain that far back -- a single ' +
  '2024-01-01 test date returned the full 96 distinct slots before committing to the full backfill. ' +
  'Table went from 90 days (235,872 rows) to the full available range (2,511,402 rows, zero gaps ' +
  'across spot-checked months).',
  'Record Hour -- added daypart-scoped records (Breakfast/Lunch/Afternoon/Dinner/Late Night, not ' +
  'just whichever daypart the single overall-best window happens to land in), a second metric ' +
  '(Transactions, alongside Sales $), and historical context: a "Previous [metric]" column (the ' +
  'prior record before the current one) plus a "Top 5 All-Time" view, both confirmed-days-only ' +
  '(today\'s still-open business day never enters the permanent ranking, same standing provisional ' +
  'rule the single-best-window feature already followed). New engine function ' +
  'computeHourLeaderboard()/scopeHourLeaderboard() (src/engine/record-hour.js) -- additive, built ' +
  'alongside the original computeHourRecords() rather than inside it, so that function\'s existing, ' +
  'already-tested "overall/sales, one value per store" contract can\'t be perturbed. Category + ' +
  'metric dropdowns and a Current/Top-5 toggle use the SAME S.select/S.ghostBtn/SortTH conventions ' +
  'every other Record Days tab already uses -- every column (Store/Value/Date/Daypart) is ' +
  'click-to-sort, uniformly, in both views.',
]};
