// @ts-nocheck
export default {version:'5.109', date:'2026-08-22', changes:[
  'Dispatch #71 -- the Form Completions pull was silently no-opping. Owner report: "Form '
  + 'Completions not populating." Took 8 live workflow_dispatch runs across two genuinely '
  + 'distinct defects, plus one incomplete fix, to fully resolve -- honest accounting in '
  + 'memory/dispatch-71.md.\n\n'
  + 'The brief\'s own structural finding was real: the direct fetch path could only escalate '
  + "to its Playwright fallback on a thrown 401/403, never on a silent-empty 200 -- fixed "
  + '(pullWithEscalation()) and verified live, but did not fix the outage. Playwright\'s own '
  + 'login was ALSO broken (a networkidle-race completion signal, and header-sniffing instead '
  + 'of reading the Cognito ID token from localStorage) -- found by diffing against the '
  + 'already-working sibling qsrsoft-forms-pull.mjs, fixed and verified (a real token was '
  + 'captured) -- still did not fix it. With that confirmed-valid token, rows were STILL zero, '
  + 'refuting the auth-denial hypothesis this dispatch started from.\n\n'
  + 'The actual root cause, found by logging the raw response body per the brief\'s own '
  + 'fallback instruction: completionDetail wraps its rows under "results" (plural), but the '
  + 'parser read "result" (singular) -- every response, on every auth path, silently parsed to '
  + 'an empty array. Fixing that surfaced a second, real, independent bug: Postgres rejected '
  + 'the upsert batch ("ON CONFLICT DO UPDATE command cannot affect row a second time") '
  + 'because ad-hoc (scheduledAt-null) rows plus Travel Path\'s 27-45x/store/day scheduling '
  + 'put two distinct API rows on the same (loc, formId, occurrenceKey) within one pull '
  + 'window. A first dedup pass (plain string equality) was itself incomplete -- '
  + 'timestamp-precision and UUID-case variants slipped through -- fixed by canonicalizing '
  + 'both before computing the dedup key.\n\n'
  + 'Verified live, not a green unit test: the final run upserted 2,993 rows across 27/27 '
  + 'stores for 2026-08-19..2026-08-22. 2040/2040 tests (10 new), build clean, no entry-chunk '
  + 'change (this is a pull script, not client code). Full writeup in memory/dispatch-71.md.',
]};
