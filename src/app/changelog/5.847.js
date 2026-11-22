// @ts-nocheck
export default {version:'5.847', date:'2026-11-22', changes:[
  '**Egress Wave 1 delta-sync pilot #1: `lifelenz_dar` now watermark-syncs instead of ' +
  're-fetching its full window on every login.** Task #190/#194, following the Wave 1 readiness ' +
  'audit\'s own recommended order (`memory/plan-egress-reduction-2026-11-20.md` Section 17). ' +
  '`loadLifeLenzDar({ since })` gained an additive `since` param (`.gt(\'updated_at\', since)`); ' +
  '`_stLifelenzDar` now reads a `localStorage` watermark, asks Supabase for only the rows that ' +
  'changed since the last sync, and merges the delta into the cached array by `(loc, start_time)` ' +
  '— `lifelenz_dar`\'s real primary key — instead of replacing the whole array, the same shape ' +
  'the `lifelenz_schedule` pilot (#1) already proved out. The per-`(loc,dt)` daily rollup ' +
  '(`lifelenzDarDailyRows`) is recomputed from the MERGED rows, not just the delta, so a sync that ' +
  'finds nothing new never drops an unchanged hour from the daily total. Confirmed upsert-only ' +
  '(no `.delete(` against `lifelenz_dar` anywhere in `src/` or `scripts/`) before building on it. ' +
  '6 new tests ' +
  '(`dispatch-egress-wave1-pilot1-lifelenz-dar-watermark-2026-11-22.test.js`). Also corrects a ' +
  'readiness-audit error caught while picking this pilot: `lifelenz_job_hours` was wrongly listed ' +
  'as already delta-sync-ready — its loader doesn\'t actually expose `updatedAt` at all, despite ' +
  'the DB column being set correctly on every upsert; flagged in the memory file for whoever ' +
  'builds that pilot next, not fixed in this pass. See ' +
  '`memory/plan-egress-reduction-2026-11-20.md` Section 18. Full suite + build both clean.',
]};
