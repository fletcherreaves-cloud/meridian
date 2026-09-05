// @ts-nocheck
export default {version:'5.358', date:'2026-09-05', changes:[
  'QSRSoft field dictionary (backlog item, memory/project-backlog.md): src/constants.js gains ' +
  'QSR_DAR_FIELDS/QSR_FOB_FIELDS/QSR_EBOS_FIELDS -- DB column -> {label, desc, unit} for the ' +
  'qsr_daily_activity, qsr_fob, and qsr_ebos_daily tables, sourced from QSRSoft\'s own scraped ' +
  'field definitions (screenshots/field-definitions-parsed.json, 418 real entries captured via ' +
  'the ℹ-icon scraper) and the pull scripts\' documented real columns.',
  'Fixed a real bug found along the way: the PRE-EXISTING QSR_DAR_FIELDS was stale -- it named ' +
  'columns (trans_cnt, healthy_cnt, avg_check, dt_pullforward, dt_greet, dt_menu, dt_payment, ' +
  'dt_cashier, dt_avgspeed, ly_avg_check, ly_healthy_cnt) that do not exist on qsr_daily_activity ' +
  'at all, and was dead code -- exported from constants.js but never imported anywhere. Rewritten ' +
  'from scratch against the real columns scripts/qsrsoft-dar-pull.mjs\'s mapRow() actually emits.',
  'Wired into SAGE\'s field-definitions context (sage.js\'s buildFieldDefsSection): the live, ' +
  'owner-scraped qsr_field_definitions Supabase table is not guaranteed populated in every ' +
  'environment, and that function used to return nothing at all when it wasn\'t loaded. The new ' +
  'static dictionaries now merge in as a fallback (live definitions still win on overlapping ' +
  'labels), so SAGE always has real QSRSoft field definitions to answer "what is X" with. Also ' +
  'added an eBOS Purchases page to the section, which had no coverage before.',
  'Corrected memory/project-backlog.md\'s companion "Info icon scraper" line, which had gone ' +
  'stale showing unstarted: the scraper script, parser script, qsr_field_definitions table, ' +
  'loader, and two live UI consumers (FOBAnalysisPanel tooltips, SAGE context) all already exist ' +
  'and were re-verified directly. Open follow-on: qsr_field_definitions.db_col (schema column ' +
  'exists) is never populated by anything -- not blocking either live consumer today, since both ' +
  'key off page+label, not db_col.',
  'Guarded by a new test (src/__tests__/dispatch-qsr-field-dict.test.js) that re-derives each ' +
  'table\'s real column list straight from the pull script / schema.sql source of truth rather ' +
  'than a hand-typed expectation, so a future column rename fails this test instead of silently ' +
  'drifting the same way the old dict did. Plus 3 tests locking in the SAGE merge-fallback ' +
  'behavior (dispatch-sage-field-defs-fallback.test.js).',
]};
