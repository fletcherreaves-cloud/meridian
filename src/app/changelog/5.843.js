// @ts-nocheck
export default {version:'5.843', date:'2026-11-21', changes:[
  '**Egress Phase 2 pilot #1: watermark delta-sync for LifeLenz schedule rows, plus a small ' +
  'owner-approved DDL closing the last two real gaps the Phase 2 audit found.** ' +
  '`updated_at timestamptz` added to `custom_signals`/`staff_assignments` — the only two of the ' +
  '~30 eager-loaded tables with a genuine `.update()` write path and no column that moves when a ' +
  'row changes (every other table already had one, under names a plain schema probe initially ' +
  'missed — `computed_at`/`committed_at`/`detected_at` — see ' +
  'memory/plan-egress-reduction-2026-11-20.md Section 13/14). Both existing-row backfills ran ' +
  '(`updated_at = created_at`), and `updateCustomSignal`/`appendCustomSignalHistory`/ ' +
  '`setPrimaryStaffAssignment` now set it explicitly on every write — this schema has zero ' +
  'DB-level triggers anywhere, so a column only stays a real watermark if the application code ' +
  'sets it, same convention every other verified-safe column in this repo already follows. ' +
  '`supabase/schema-egress-phase2-watermarks.sql` is the durable record. ' +
  '**The real build:** `_stLifelenz` (the login-time startup stage, NOT the Data Manager "↻ Sync" ' +
  'button\'s `STREAM_RELOADERS.lifelenz`, which stays a full fetch on purpose) now asks Supabase ' +
  'for only `lifelenz_schedule` rows whose `updated_at` moved since the last login ' +
  '(`loadLifeLenzSchedule`\'s new `since` param) and MERGES the result into the cached array by ' +
  '(loc,date) instead of replacing the whole ~5,300-row window every time. Verified safe by ' +
  'reading the real pull script (`scripts/lifelenz-pull.mjs` explicitly sets `updated_at` on ' +
  'every row), and verified there\'s no hard-delete path to miss (upsert-only, grepped every ' +
  'write site). Honest limit, not hidden: the pull script\'s own refresh window (30 days back + ' +
  '14 forward, daily) is narrower than the client\'s 180/30 read window, so the ~44 most-recent/ ' +
  'near-future days still get re-fetched every login regardless of real content change — the ' +
  'other ~79% of the window (anything the pull\'s own refresh has already moved past) is the ' +
  'real win, correctly stopping re-fetch once its `updated_at` stabilizes. A first-ever sync on ' +
  'any device (no stored watermark yet) behaves exactly like today — one more full fetch, then ' +
  'every subsequent login is a delta. `mergeLifelenzScheduleDelta`/`maxUpdatedAt` (`App.js`, ' +
  'exported for direct testing) handle the merge-by-key and the server-timestamp-only watermark ' +
  'advance (never the client clock, so clock skew can\'t silently drop a row). ' +
  '**Where the watermark lives, and why that changed mid-build:** first attempt threaded it ' +
  'through the OPFS blob/`ds` state the way Phase 1\'s pilots did, assuming `_stLifelenz` ran ' +
  'nested inside the same restore function that reads the cache — it doesn\'t; they\'re two ' +
  'separate top-level `useEffect`s with no guaranteed ordering between their async completions. ' +
  '`src-no-undef.test.js` caught the resulting bad reference immediately (a real ESLint ' +
  'no-undef failure, not a flake). Fixed by storing it in `localStorage` ' +
  '(`mf_sched_watermark`) instead — synchronous, no cross-effect race, same mechanism this file ' +
  'already uses for other small per-device bits (`mf_beta_mode`, `mf_email_report_ids`). No OPFS ' +
  'schema change needed after all. ' +
  '10 new tests (`dispatch-egress-phase2-pilot1-watermark-sync-2026-11-21.test.js`), covering the ' +
  'two pure merge/watermark functions, including a confirmed-catches-a-regression check on the ' +
  'merge key (collapsed two different stores\' same-date rows into one when broken, caught ' +
  'immediately, restored). Full suite + build both clean.',
]};
