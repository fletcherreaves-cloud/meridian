// @ts-nocheck
export default {version:'5.259', date:'2026-08-30', changes:[
  'Dispatch #218 -- fetchAll() retries a transient page failure before surfacing DATA ' +
  'INCOMPLETE. Owner hit a "DATA INCOMPLETE -- qsr_raw_item_detail -- 1 page(s) failed to ' +
  'load" banner (2026-08-29); live triage found the table and pull both healthy (3,107 rows, a ' +
  'fresh page fetch ~1.4s) -- a one-off transient page failure, not a real data problem. Today, ' +
  'fetchAll() (src/lib/supabase.js, the ONE shared pagination helper ~37 loaders call) treated ' +
  'ANY page error as immediately fatal: warn, _recordDataError (the banner), _partial, stop -- ' +
  'the only recovery was a manual page reload.' +
  '\n\n' +
  'Internals-only change, same signature/return shape/_recordDataError-_partial contract in the ' +
  'give-up case (blast radius: ~37 callers). On a page error, fetchAll now classifies it via a ' +
  'new _isRetryablePageError(error) -- reusing this file\'s own existing permanent-error ' +
  'precedent (_isMissingTable: 42P01/PGRST205/"relation ... does not exist", plus the 42703 ' +
  'bad-column check used elsewhere here) as "never retry", and treating 57014 (Postgres ' +
  'statement-timeout SQLSTATE -- the exact class of large-table-read failure CLAUDE.md already ' +
  'names, and the one this table has hit before per loadQsrRawItemDetail\'s own 2026-08-07 ' +
  'comment), a raw network-shaped failure with no .code at all, and any other unrecognized error ' +
  'shape as retryable by default. A retryable page gets re-fetched (same from/to range) up to 2 ' +
  'times with increasing backoff (500ms, 1500ms); a successful retry continues pagination ' +
  'completely normally -- no banner, no _partial, the caller never knows it happened. Retries ' +
  'exhausted, or classified permanent from the start, falls through to exactly today\'s existing ' +
  'warn/_recordDataError/_partial/break behavior, byte-for-byte unchanged.' +
  '\n\n' +
  'Judgment call: the out-of-scope single-row _recordDataError(label, 1, 0, ...) call this ' +
  'dispatch flagged as "a separate code path, mention rather than silently skip" turned out, on ' +
  'inspection, to be fetchAll\'s own give-up call (same line the retry now gates entry to) -- not ' +
  'a second, different path elsewhere in the file. Left completely untouched, as instructed.' +
  '\n\n' +
  '13 new tests (dispatch-218-fetchall-retry.test.js): _isRetryablePageError unit-tested in ' +
  'isolation across all classified shapes (42703/42P01/PGRST205/message-only "relation ... does ' +
  'not exist" -> false; 57014/no-.code/unrecognized-code -> true; null/undefined -> false); ' +
  'fetchAll\'s retry loop exercised through the real loadQsrRawItemDetail loader (the exact ' +
  'table from the incident) against a mocked Supabase client -- retry-then-succeed (no .code, ' +
  'and 57014) records nothing and returns full data; all-retries-exhausted falls through to the ' +
  'unchanged give-up shape; a non-retryable error (42703, 42P01) fails after exactly one attempt ' +
  'with zero timers ever scheduled (fake-timers-not-advanced as the regression guard: a wrongly ' +
  'retried non-retryable error would hang the test, not just look similar at the end); the ' +
  'happy-path first-try-succeeds case is proven untouched (0 timers, <50ms, identical to before). ' +
  'Existing paged-parallel-count-fallback.test.js (a real fetchAll()-backed loader via loadQsrFob' +
  '\'s count-HEAD-failure fallback) and dt-history-pagination.test.js both still pass unchanged. ' +
  'Full suite 3302/3302 passing (6 unrelated pre-existing failures in this sandbox are a missing ' +
  '`web-push` npm package, reproduced identically on origin/main before this change), build clean.',
]};
