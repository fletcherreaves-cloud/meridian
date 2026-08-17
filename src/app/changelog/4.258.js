// @ts-nocheck
export default {version:'4.258', date:'2026-07-01', changes:[
  'detectType now recognises QSRSoft underscore-separated filenames (labor_analysis_daily, sales_ledger_daily, cash_sheet_extract_daily, daily_glimpse_daily, labor_exceptions_daily). Previously sales_ledger and daily_glimpse were undetected, cash_sheet fell through to the wrong type (ctrl), and labor_analysis was caught only by a fuzzy low-confidence match.',
]};
