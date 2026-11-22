// @ts-nocheck
export default {version:'5.855', date:'2026-11-22', changes:[
  '**Egress Wave 2 pilot #1: `qsrActSummaryRows` now watermark-syncs too — the single heaviest ' +
  'T1 load in the app.** Task #190. Wave 1 (the 9 Phase-1.5-cached LifeLenz/HME/Squadle streams) ' +
  'closed in v5.853; this starts Wave 2 on the broader table set, picking up the highest-value ' +
  'stream that already had Phase 1 cache-first-render (v5.840) but never got the actual ' +
  'delta-sync treatment. `qsr_daily_activity_rollup`\'s `refreshed_at` is set unconditionally on ' +
  'every upsert by `scripts/qsrsoft-dar-pull.mjs`\'s `refreshRollup()` — confirmed upsert-only, ' +
  'same write-path discipline every prior pilot verified. `loadQsrActSummary` gained a `since` ' +
  'option (`.gt(\'refreshed_at\', since)` on its fast rollup-table path only — the rare hourly ' +
  'fallback path still does a full refetch, which a merge-by-key handles correctly even if hit). ' +
  '`mergeQsrActSummaryDelta` keys on `loc + date` (both real fields, `date` a Date object); the ' +
  'watermark itself is computed inline in `_stQsrsoftActSummary` since `refreshedAt` is a Date ' +
  'object (used that way by the At-A-Glance Movers strip), not the plain ISO string ' +
  '`maxUpdatedAt` expects. 6 new tests ' +
  '(`dispatch-egress-wave2-pilot1-qsractsummary-watermark-2026-11-22.test.js`). See ' +
  '`memory/plan-egress-reduction-2026-11-20.md` Section 25. Full suite + build both clean.',
]};
