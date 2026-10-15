// @ts-nocheck
export default {version:'5.569', date:'2026-10-15', changes:[
  'QSRSoft backfill driver -- fixed a real bug its own dry-run caught before it ever touched ' +
  'production: the OPS report type\'s bootstrap read used destDateCol:\'date\' for ' +
  'qsr_cash_sheet, but that table\'s real date column is \'dt\' (same as qsr_daily_activity) -- ' +
  'the bootstrap failed outright with "column qsr_cash_sheet.date does not exist" rather than ' +
  'silently reading the wrong column. EBOS and DAR bootstrapped correctly in the same dry run, ' +
  'confirming the fix is isolated to OPS.',
  'Added a cross-check test (qsrsoft-backfill-driver.test.js) that reads each real pull ' +
  'script\'s own query and asserts the driver\'s destDateCol matches it -- this exact class of ' +
  'bug (a wrong column name in a config literal) is invisible to nextChunk()/targetStartDate()\'s ' +
  'pure-logic tests and only surfaces on a real Supabase read, so without this the next drift ' +
  'would again only be caught live. Full suite green (611/611 files, 5692/5692 tests), build ' +
  'clean, within budget.',
  'Verified live: both pay_events and qsrsoft_backfill_cursor tables exist (service-role read, ' +
  '200 OK with content-range */0 on each -- real, empty tables, not a missing-table error) ' +
  'after today\'s SQL migrations.',
]};
