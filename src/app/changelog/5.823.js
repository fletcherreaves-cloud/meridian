// @ts-nocheck
export default {version:'5.823', date:'2026-11-17', changes:[
  '**LifeLenz DAR: resolved the timezone blocker, wired into freshness + App.js.** Owner ' +
  'confirmed every Meridian store, OK and FL alike, runs on Central time — the FL panhandle ' +
  'stores sit west of the Apalachicola River, so there was never a cross-timezone bucketing ' +
  'question. `lifelenz_dar` now carries a derived `dt` business date (4am Central cutover, ' +
  '`businessDateChicago()` in `scripts/lifelenz-dar-pull.mjs`, DST-aware), wired into ' +
  '`stream-freshness.js`/`scheduled-pull-registry.mjs` as `lifelenzDar` and loaded into the app ' +
  'as `ds.lifelenzDarRows`. Deliberately NOT yet wired into `metric-source.js`\'s displayed ' +
  'auto-first chains (sales/OEPE/etc.) — real field-equivalence gaps (net_sales vs this app\'s ' +
  'product_sales-based sales; avg_dt_service_time vs OEPE\'s parked-time exclusion) need their ' +
  'own real-vs-real validation first. See memory/finding-lifelenz-dar-schema-2026-11-17.md for ' +
  'the full writeup, including 3 open hiccups for the owner (the schema SQL needs to be run — ' +
  'the table does not exist live yet; the pull workflow has never fired; QSRSoft\'s own DAR is ' +
  'currently NOT stale, so there\'s no urgent gap today).',
]};
