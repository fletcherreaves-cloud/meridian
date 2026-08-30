// @ts-nocheck
export default {version:'5.262', date:'2026-08-30', changes:[
  'Dispatch #221 -- KVS Time gets the same Σ/Σ ratio fix OEPE/R2P already got (dispatch #153). ' +
  'top-bottom-performers.js\'s own header comment named kvst as one of three metrics (oepe/kvst/ ' +
  'r2p) still computed upstream with no numerator/denominator exposed as separate metric-source ' +
  'chains -- #153 did the follow-on work for oepe/r2p only, leaving kvst as the exact gap behind ' +
  'with no comment explaining why. metricAvg (mean-of-daily) blends a still-in-progress business ' +
  'day into a period average at full weight, since qsr_daily_activity_rollup always carries the ' +
  'full 24-hour_slot shape (future hours zero-filled, not absent) -- the completeness artifact ' +
  'CLAUDE.md\'s DAR section documents.' +
  '\n\n' +
  'Task 1 -- src/engine/metric-source.js: added kvstMfyTimeUs/kvstTransCnt (raw legs, reading the ' +
  'SAME _mfyTime/_mfyCnt fields supabase.js\'s DAR loader already sums per (loc,dt) for oepe\'s own ' +
  'sibling fields -- no new pull, no new schema) and kvstNumSec (pre-scaled to seconds), then ' +
  'marked the existing kvst entry derive:{kind:\'ratio\'} exactly like oepe/r2p. Scaling decision: ' +
  'the /1000 lives in kvstNumSec itself (one place), NOT deferred to kvst\'s top-level derive.fn. ' +
  'This matters because metricSumRatio sums numKey/denKey RAW and never calls the ratio metric\'s ' +
  'own derive.fn -- deferring the /1000 to kvst\'s fn (as a literal reading of the dispatch doc\'s ' +
  'own Task-1 snippet would do) would make Sum/Sum read 1000x too large. Ground truth reproduced ' +
  'exactly: supabase.js\'s existing `kvst: r._mfyCnt > 0 ? r._mfyTime / r._mfyCnt / 1000 : null`.' +
  '\n\n' +
  'Task 2 -- migrated all 4 confirmed metricAvg(...,\'kvst\') call sites to metricRate: ' +
  'store-dash.js\'s RankingTab localStats, one-pager-data.js\'s buildMetricNow AND ' +
  'buildReviewActuals (both cited by the dispatch, kvst and kvsPerGc respectively), and ' +
  'review-engine.js\'s autoPopulateKPIs (kvsAvg). morning-brief.js\'s kvstNorm fallback leg was ' +
  'deliberately LEFT on metricAvg: its sibling line, oepeNorm, went through dispatch #155\'s ' +
  'oepe/r2p migration untouched and is still on metricAvg today -- migrating only kvst\'s fallback ' +
  'here would make two structurally identical peaks-filtered-fallback lines in the same function ' +
  'inconsistent with each other for no behavioral gain. record-day.js\'s kvsSeries stays on ' +
  'metricSeries (a raw per-day series, no mean-vs-sum question) -- unchanged per the dispatch\'s ' +
  'own scope note.' +
  '\n\n' +
  'Live measurement (service-role key, 2026-08-30, method matching #153\'s): store 3708\'s ' +
  'in-progress "today" (217/872 = 24.9% of plan) read mid-range (51.7s) against its own 8-day ' +
  'window -- no dramatic skew there. Store 6178\'s in-progress "today" (155/847 = 18.3% of plan) ' +
  'DID reproduce the same artifact shape #153 found for R2P: its own-day reading (76.5s) was the ' +
  'fastest of its 4-day window, pulling mean-of-daily down to 98.1s while Σ/Σ correctly stayed ' +
  'higher at 104.1s, inside the 3 complete days\' 100-110s range. Store 5985 showed the mirror-' +
  'image case -- an in-progress day reading SLOWER (51.4s) than its complete-day siblings, with ' +
  'mean-of-daily pulled up to 42.3s vs Σ/Σ\'s 40.2s. Reported as a real but store/day-dependent ' +
  'artifact (not forced into a uniform finding) -- the fix\'s correctness does not depend on any ' +
  'one day happening to skew, since the mode:\'any\' zero-fill mechanism is unconditional.' +
  '\n\n' +
  'Verification: src/__tests__/metric-sum-ratio.test.js gets a new kvst describe block mirroring ' +
  'the oepe/r2p ones (derive.fn pin, live cross-check against store 6178\'s real 2026-08-27 row, ' +
  'complete-days sanity check, the in-progress-day artifact reproduced with real store-6178 ' +
  'numbers, and a missing-leg-excluded-not-guessed case) plus rollupCapableMetricKeys() and its ' +
  'coverage-membership test updated to include kvst. Two new call-site regression files -- ' +
  'dispatch-221-kvst-rate-call-sites.test.js (autoPopulateKPIs / buildMetricNow / ' +
  'buildReviewActuals, real consumers not just the engine) and ' +
  'dispatch-221-store-dash-kvst-rate.test.js (renders the actual RankingTab, same method dispatch ' +
  '#155 used for TPPH: a stale precomputed kvst field vs. disagreeing raw legs on the single-day ' +
  '\'Today\' preset, so a revert to metricAvg would show the stale figure and fail the test) -- ' +
  'per CLAUDE.md\'s "would this verification still pass if the change were reverted" rule.' +
  '\n\n' +
  'Full suite: 327 files / 3392 tests passing. Build clean. Eager-payload budget unchanged at ' +
  '526.85 KB gzip (this change touches no eagerly-imported code paths beyond metric-source.js, ' +
  'already in the entry chunk).'
]};
