// @ts-nocheck
export default {version:'5.755', date:'2026-11-13', changes:[
  '**HME Cloud DT timer — task #105 Phase 2.** The first client-side ds loader for HME Cloud ' +
  'now exists (`loadHmeDtRows`, src/lib/supabase.js), wired into App.js\'s background load ' +
  'stages and surfaced in Speed of Service as its own small "today" strip — deliberately NOT ' +
  'folded into the DT/FC/Kitchen/Beverage stations, since HME\'s own REST API only ever returns ' +
  'the current business day\'s accumulating rollup (no real history, no hour-level data — ' +
  'confirmed live). Each store\'s freshest row (cars, avg seconds, HME\'s own goal%, rank), ' +
  'scoped to the active location filter. `squadleChecklistRecords` also got a loader ' +
  '(`loadSquadleChecklistRecords`) purely so its freshness is tracked — its own consuming ' +
  'engine/panel is still a separate follow-on, since its record is a deliberately raw JSONB ' +
  'blob (see schema-squadle-checklist-records.sql). Both streams\' stream-freshness.js entries ' +
  'are live now (no longer commented-out placeholders), and scheduled-pull-registry.mjs/SAGE\'s ' +
  'query_data_health both got matching entries so the reliability watchdog and SAGE\'s own data- ' +
  'health answer cover them too. 7 new tests, full suite (7960 tests) and build pass clean ' +
  '(700.63 KB eager, budget 850 KB).',
]};
