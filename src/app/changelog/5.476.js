// @ts-nocheck
export default {version:'5.476', date:'2026-09-21', changes:[
  'Data Manager: new "Incidents" tab surfaces the data-completeness ledger (#265, ' +
  'data_completeness_incidents) -- scheduled expected-vs-actual gaps per store/stream, ' +
  'independent of whether the pull that should have written the data ever reported failure. The ' +
  'table has been populated by scripts/check-data-completeness.mjs since #265 shipped but had ' +
  'zero UI or SAGE consumer anywhere in the app (grep-confirmed) -- this is that first consumer.',
  'Shows every OPEN, non-legitimate incident (store, stream, gap date range, cause, ' +
  'classification, days open) sorted oldest-detected first, matching the table\'s own "what\'s ' +
  'open and stale" partial index. The notes column (the table\'s own schema marks it RESTRICTED, ' +
  'per the SAGE knowledge-grounding handling-notice convention) is deliberately excluded from ' +
  'both the new loadDataCompletenessIncidents() query and this display -- surfacing it needs ' +
  'that handling-notice pattern ported to a UI surface first, a separate, not-yet-built piece.',
  '4 new tests against the real exported DataManagerPanel (tab count badge, populated rows ' +
  'including single-day vs date-range gap formatting, notes column never rendered, empty state) ' +
  '-- all 4 confirmed to fail against the pre-fix code (temporarily reverted and re-ran). Fixed a ' +
  'real CI-only bug the same pass surfaced: the incidents effect (like its auto-synced-tile ' +
  'neighbor) gates on `if(!supabase) return`, and the test\'s vi.mock only overrode ' +
  'loadDataCompletenessIncidents, not supabase itself -- so the real, env-dependent supabase ' +
  'binding decided whether the loader ever ran at all. That passed locally (this sandbox has real ' +
  'VITE_SUPABASE_URL/ANON_KEY set) and failed in CI (which doesn\'t), same trap dispatch-208\'s own ' +
  'comment already named. Now the mock overrides supabase too, with a safe fake .from() chain, so ' +
  'the effect is deterministic in every environment. Full suite 538/538 files, 5075/5075 tests. ' +
  'Build clean, eager payload 551.75 KB gzip (budget 850 KB).',
]};
