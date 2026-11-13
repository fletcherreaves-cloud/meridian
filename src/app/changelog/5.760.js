// @ts-nocheck
export default {version:'5.760', date:'2026-11-13', changes:[
  '**Fix: stores duplicating again — HME Cloud/Squadle loaders missed the zero-padding strip ' +
  '(recurrence of the 2026-11-02 store-duplication bug).** Owner reported At A Glance\'s Action ' +
  'Checklist showing "54 stores missing this week\'s projection commit" for a 27-store district, ' +
  'each store listed twice (once as a raw loc, once by name) — the exact signature of the ' +
  '2026-11-02 incident. Root cause confirmed live: `loadHmeDtRows`/`loadSquadleChecklistRecords` ' +
  '(shipped earlier this session) returned `loc` raw instead of stripping the zero-padding ' +
  '`hme_dt_daily`/`squadle_checklist_records` store it with (both confirmed live via direct ' +
  'Supabase query) — the same bug class as 6 LifeLenz loaders fixed in November, now hitting a ' +
  'non-LifeLenz source since `dsAutoStoreIds()` unions every `STREAMS` entry, not just those ' +
  'three. Fixed both loaders with the established `String(parseInt(r.loc, 10))` strip, and added ' +
  'a real regression test this time (the original fix shipped without one). Full suite (7967 ' +
  'tests) and build pass clean (698.90 KB eager, budget 850 KB).',
]};
