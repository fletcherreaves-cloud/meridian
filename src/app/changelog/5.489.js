// @ts-nocheck
export default {version:'5.489', date:'2026-10-02', changes:[
  'Monthly Targets upload: fixed the real cause of an owner-reported October upload that ' +
  '"acknowledged success" but never showed up. Diagnosed by downloading the owner\'s actual ' +
  'uploaded file from Supabase storage and replaying it through the real save path directly: ' +
  'saveMonthlyTargets() was rejected outright by Postgres (PGRST204, "Could not find the ' +
  '\'fob_bonus_base_pct\' column") because dispatch #164\'s labor_pct/fob_bonus_base_pct ' +
  'migration (supabase/schema-monthly-targets-labor-fobbonus.sql) was written in code but ' +
  'never actually run against production -- every monthly-targets save has been failing this ' +
  'way since, not just October\'s. That part of the fix is DB-side (the owner needs to run the ' +
  'two-line ALTER TABLE once; no exec_sql RPC or DATABASE_URL is available to run DDL from a ' +
  'session). Two real bugs found and fixed in code along the way: (1) the owner\'s actual file ' +
  'is a multi-operator "Multi Layout" workbook whose Restaurant column also carries OTHER ' +
  'operators\' store numbers -- parseMonthlyTargets() had no org-scoping, so 7 foreign/junk ' +
  'rows were landing in monthly_targets alongside the real 27 stores; mergeDS now filters to ' +
  'DEFAULT_TARGETS\' own stores first, the same precedent applyProjectionsToTargets already ' +
  'sets. (2) Year/month detection for a monthly-targets save depended entirely on the ' +
  'uploaded filename, with a silent console.warn as its only failure signal -- not what broke ' +
  'this specific upload (the filename detected fine), but a real gap found along the way: ' +
  'mergeDS now also tries the sheet\'s own title rows as a fallback, accepts "." as a numeric ' +
  'date separator, and a genuine miss now surfaces as a visible warning on the Upload Summary ' +
  'modal instead of a silent one. 30 tests ' +
  '(dispatch-monthly-targets-period-detection-2026-10-02.test.js). Full writeup: ' +
  'memory/finding-monthly-targets-save-silently-broken-2026-10-02.md.',
  'Full suite: 5223/5223 tests passing. Build clean, eager payload 555.33 KB gzip (budget 850 ' +
  'KB) -- unchanged from baseline, no new static imports.',
]};
