// @ts-nocheck
export default {version:'5.556', date:'2026-10-14', changes:[
  'Security panel -- found the REAL root cause (v5.555\'s RLS InitPlan-wrapping SQL migration ' +
  'made ZERO measurable difference, re-verified directly: identical 6/6 failures, identical ' +
  '~8.1-8.4s, before and after the owner ran it). Every measurement in this dispatch through ' +
  'v5.552/553/554 used the Supabase SERVICE ROLE key, which bypasses RLS entirely -- so none of ' +
  'them could ever have revealed an RLS-specific problem, and v5.555\'s hypothesis (a bare ' +
  'function call in the RLS policy forcing per-row re-evaluation) was a well-evidenced guess that ' +
  'turned out to be wrong.',
  'Re-measured for real this time: a throwaway admin-role auth session (created and deleted via ' +
  'the service-role Admin API, no owner credentials touched) making REAL RLS-filtered requests, ' +
  'exactly like the browser does. Isolated one variable at a time against the live table: a ' +
  'single query against security_findings_latest, ANY page size from 50 to 1000 rows, run ALONE ' +
  '-- costs a near-constant ~5.1-6.2s every time, regardless of size (the identical query against ' +
  'the base security_findings table, no DISTINCT ON, cost 176-929ms -- 5-30x cheaper). Page size ' +
  'was never the driver -- it is the view\'s DISTINCT ON materialization being recomputed under ' +
  'RLS on every call. 2 concurrent pages: borderline (7.3s, too close to the 8s timeout to trust ' +
  'live). 3+ concurrent: FAILS 100% of the time at ~8.1-8.4s, at every page size tried -- this is ' +
  'exactly what the owner\'s escalating "4 page(s) failed" then "11 page(s) failed" was: ' +
  '_pagedParallel\'s shared 6-way concurrency cap firing 6 already-marginal (~5-6s) queries at ' +
  'once, each one\'s cost compounding the others past the statement timeout.',
  'Walked the FULL live table sequentially to prove the fix: 21 pages of 1000 rows each, one at a ' +
  'time, real RLS session -- 21/21 succeeded, max single page 6201ms (~1.8s comfortable margin ' +
  'under the 8s timeout), 20,793/20,793 rows recovered, zero failures.',
  'Fix: pageSize back up to 1000 (never the cost driver, and fewer total round trips) + a new ' +
  'PER-CALL maxInflight option on _pagedParallel (src/lib/supabase.js), set to 1 (fully ' +
  'sequential) just for loadSecurityFindings. Deliberately NOT a change to the shared ' +
  '_MAX_INFLIGHT=6 pool every other _pagedParallel caller (qsr_fob, labor_rows, ops_rows, ' +
  'daily_glimpse_daily, etc.) draws from -- none of those tables share this one\'s RLS-view cost ' +
  'problem, and lowering the shared pool would have slowed all nine of them for no reason. ' +
  'maxInflight builds a small local semaphore scoped to just the one call that asks for it.',
  'Trade-off, stated plainly: this makes the Security panel\'s initial load slow (~2 minutes for ' +
  'the full table) instead of broken. That is a real cost, not a free fix -- the actual root fix ' +
  'is a DB-side one (materializing this view instead of recomputing its DISTINCT ON live under ' +
  'RLS on every call, which would likely bring every page back to base-table speed, under 1s) and ' +
  'is follow-up work, not shipped here. This dispatch is the fourth attempt at this bug across one ' +
  'day; unlike the second, third, and especially the fourth (v5.555\'s SQL migration), this one ' +
  'needed no SQL migration from the owner and was verified end-to-end against the real table under ' +
  'real RLS, not against the service-role key.',
  'New regression-guard test (dispatch-security-findings-parallel-2026-10-14.test.js) proves ' +
  'maxInflight:1 is actually enforced -- not just declared -- by tracking real overlap in a mock ' +
  'Supabase client with an artificial per-call delay; confirmed via git stash that the assertion ' +
  'fails without the fix wired through. Full suite green (600/600 files, 5613/5613 tests), ' +
  'npm run build clean, within the entry-chunk budget.',
]};
