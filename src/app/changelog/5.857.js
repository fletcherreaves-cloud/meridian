// @ts-nocheck
export default {version:'5.857', date:'2026-11-23', changes:[
  '**Egress Wave 2 pilot #3: `lifelenzAttendanceRows` now watermark-syncs too — and the ' +
  '"needs a pull-script fix first" blocker from Section 17 turned out to already be fixed.** ' +
  'Task #190. Re-reading `scripts/lifelenz-attendance-pull.mjs` before starting the deferred ' +
  'write-path fix found `pulled_at: new Date().toISOString()` was already added explicitly to ' +
  'the upserted row object on 2026-11-16 — six days before the memory note claiming otherwise ' +
  'was written. No pull-script change was needed; only `loadLifeLenzAttendance` gained a ' +
  '`since` option (`.gt(\'pulled_at\', since)`). Real PK is `(loc, period_end)` — confirmed ' +
  'via the upsert\'s own `onConflict`. New `mergeLifelenzAttendanceDelta` keys on plain ' +
  '`loc+periodEnd` strings (no Date-object wrinkle here, unlike qsrActSummaryRows). 6 new ' +
  'tests (`dispatch-egress-wave2-pilot3-lifelenz-attendance-watermark-2026-11-23.test.js`). ' +
  'See `memory/plan-egress-reduction-2026-11-20.md` Section 27 (and the Section 17 correction). ' +
  'This closes every named, write-path-ready delta-sync candidate in the egress plan — what ' +
  'remains needs either an owner DDL decision or a fresh audit pass. Full suite + build both ' +
  'clean.',
]};
