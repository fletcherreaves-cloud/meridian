// @ts-nocheck
export default {version:'5.325', date:'2026-09-02', changes:[
  'New automated pull: Storewide Controls (memory/project-qsrsoft-controls-endpoint.md, ' +
  'discovered 2026-07-26, never built until now) -- per-store loss-prevention thresholds ' +
  '(T-Red before/after, HALO, skim, petty cash, cashless sign limit), discount %s by type ' +
  '(customer/employee-meal/manager-meal/police), active tax tables, daypart windows, and ' +
  'user-defined metric targets (DTDA/DTPH/KVST/SSPO/STV/SWC) -- real per-store values straight ' +
  'from what the owner actually configured in QSRSoft, several of which the Signal registry / ' +
  'DEFAULT_TARGETS currently only ASSUME as constants.',
  'A CONFIG object, not a metric -- one request per store (27 total, no comma-list/date-range ' +
  'shape like the sibling pulls), pulled weekly (Mondays) since config changes rarely. Stored ' +
  'as the FULL raw JSONB blob per store, not decomposed into named columns -- deliberate: the ' +
  'original finding curated a list of valuable fields from one live response, not the ' +
  'endpoint\'s complete shape (SafeCountControls/DrawerBanks/SpareDrawers/DepositSettings are ' +
  'named but never inventoried), so hand-picking columns now risks silently dropping fields ' +
  'nobody has looked at yet. Same discipline qsr_cash_sheet/qsr_labor_summary already use for ' +
  'their own flexible reporting-API payloads.',
  'scripts/qsrsoft-store-controls-pull.mjs reuses the same eBOS auth ladder ' +
  '(scripts/lib/ebos-auth.mjs) the recipe/inventory-history pulls already use. New table ' +
  'qsr_store_controls (schema SQL handed to the owner to run). Watched in ' +
  'sync-failure-watch.yml. loadQsrStoreControls() added for future consumption -- this PR is ' +
  'the pull only; wiring real thresholds into Signals\' Controls registry or DEFAULT_TARGETS is ' +
  'a follow-on, same "ship the data, build the view later" sequencing the outage/menu-price ' +
  'pulls used earlier today. Full suite (3718 tests) and build both clean.',
]};
