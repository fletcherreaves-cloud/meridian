// @ts-nocheck
export default {version:'5.582', date:'2026-10-18', changes:[
  '**New: per-item purchase/invoice pricing, persisted for the first time** (owner: "do we have ' +
  'data available for raw item pricing through invoices/purchases" -- a live ad-hoc pull found ' +
  'real paper-category price data and a systemic ~1.5-2.8% distributor-branch pricing gap, but ' +
  'confirmed no history was ever being kept to trend it month over month). ' +
  'scripts/qsrsoft-ebos-pull.mjs was already fetching full per-line purchase-ledger detail ' +
  '(wrin, description, invoice_identifier, per-line category $ split) from the same ' +
  'prod.ebos.qsrsoft.com store_ledger endpoint it has always read -- aggregateByDate() just ' +
  'summed it into 5 daily category totals and discarded the line-item detail before saving. Now ' +
  'every Purchase/Credit/Adjustment line (same filter the existing daily "Total Purchases" total ' +
  'uses -- Transfers excluded, they move stock between stores rather than invoice a new price) ' +
  'is ALSO persisted to new table qsr_ebos_line_items (supabase/schema-qsr-ebos-line-items.sql), ' +
  'alongside the unchanged qsr_ebos_daily aggregate -- both auth paths (direct-token fetch and ' +
  'the Playwright fallback) covered. A `raw` jsonb column keeps the complete original API item ' +
  'as a fallback, since the endpoint\'s full field list (e.g. a per-line quantity/unit-cost ' +
  'field, if one exists) hasn\'t been directly observed yet -- recovering it later needs no ' +
  'second migration. Same stale-range clear-then-insert pattern qsr_ebos_daily already uses (no ' +
  'natural key relied on for dedup), for the same reason: QSRSoft reassigns an invoice\'s ' +
  'posted_date between pulls as a normal correction on their end.',
  'New scripts/lib/qsrsoft-ebos-line-items.mjs holds the pure per-line transform ' +
  '(toLineItemRows/isPurchaseRecord) as an importable, side-effect-free module -- the pull ' +
  'script itself has no import.meta.url guard around main(), so it can\'t be imported directly ' +
  'in a test. 9 new tests.',
  'Needs manual action: supabase/schema-qsr-ebos-line-items.sql has not been applied -- this ' +
  'session has no direct Postgres connection. Run it once in the Supabase SQL editor; the pull ' +
  'script writes to the new table unconditionally once it exists, same "needs manual action" ' +
  'status every other new-table schema file in this repo ships with.',
  'Also fixed an unrelated pre-existing test flake surfaced by this session\'s full-suite run: ' +
  'cash-variance-pattern-panel.test.js\'s fixture built only 21 days of data on the assumption ' +
  'that matched the panel\'s real default range, which is ReportShell\'s 28-day preset -- a ' +
  '7-day shortfall that silently dropped whichever weekday fell in the uncovered gap below the ' +
  'table\'s own "minimum 3 observed days" threshold, flaky depending on which real calendar day ' +
  'the suite happened to run on. Fixed by matching the fixture to the real 28-day window (a ' +
  'multiple of 7, so every weekday gets exactly 4 occurrences regardless of alignment) instead ' +
  'of pinning the clock.',
  'Full suite 650/650 files, 6016/6016 tests green. Build clean, within budget (566.65 KB eager ' +
  '/ 850 KB).',
]};
