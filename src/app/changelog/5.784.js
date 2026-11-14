// @ts-nocheck
export default {version:'5.784', date:'2026-11-14', changes:[
  '**QSRSoft Security Events Pull (GH #1532): stop re-querying days already saved.** Root cause ' +
  'measured directly, not guessed: `qsr_security_events` already has a full ~7,000-9,000 rows ' +
  'for every single calendar day from 2026-10-06 through 2026-11-13, zero gaps — the daily ' +
  "pull's \"first time querying this day\" call has been succeeding the whole time. What fails, " +
  "every run, 100% of its units, is `DAYS_RECENT`'s rolling re-check of days already fully " +
  'captured by the PRIOR day\'s own run: a dispatched re-query of the exact 2026-11-12..11-14 ' +
  'window (all three days already in the DB) got `AccessDeniedException` ("explicit deny in an ' +
  'identity-based policy") on all 756/756 units — the same AWS IAM signature GH #1314 hit, but ' +
  'here it gates RE-querying specifically, not the endpoint outright. QSRSoft support won\'t ' +
  'change the IAM mapping (asked, declined). New `datesToRequest()` drops any date already known ' +
  'to have at least one saved row from the request list, except the LAST one (today — always ' +
  'incomplete mid-day, so re-querying it is the live, successful "new data" case, not the doomed ' +
  're-query one). Checked via a cheap per-date existence check (`head:true`, no row fetch), not a ' +
  'bulk pull. Eliminates hundreds of guaranteed-to-fail calls against QSRSoft\'s API every single ' +
  'day — the fix that needed no cooperation from them, since it never makes the call that was ' +
  'always going to be denied. 6 new tests. Full findings: ' +
  'memory/finding-security-events-reQuery-deny-2026-11-14.md.',
]};
