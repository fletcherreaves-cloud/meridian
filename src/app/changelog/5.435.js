// @ts-nocheck
export default {version:'5.435', date:'2026-09-13', changes:[
  'Data freshness -- QSRSoft Inventory Summary Pull now checked per-stream, closing a ' +
  'documented gap: the workflow was already watched in sync-failure-watch.yml, but ' +
  'qsr_inventory_summary was fetched panel-locally by InventoryIntelligence only, never loaded ' +
  'into ds at startup like every other stream-freshness.js STREAMS entry. Rather than reuse the ' +
  'existing full-table loader (10.5k+ rows, no rolling-window param, no per-row business date), ' +
  'a new lightweight loadQsrInventorySummaryFreshness() fetches just the single newest ' +
  'updated_at row. Measured live before picking that signal: the whole daily batch shares one ' +
  'updated_at timestamp per run, and it moves forward day to day -- a real freshness signal, ' +
  'not a value frozen at first insert. InventoryIntelligence\'s own data path is unchanged. ' +
  'Full writeup: memory/dispatch-inventory-summary-stream-freshness-2026-09-13.md.',
  '3 new tests confirmed to fail against pre-fix code (stream-freshness.test.js); ' +
  'scheduled-pull-registry.test.js\'s existing two-way ratchet extended with the matching entry.',
  'Full suite 506/506 files, 4824/4824 tests. Build clean, 542.09 KB / 850 KB eager-payload ' +
  'budget (541.91 -> 542.09 KB, +0.18 KB gzipped).',
]};
