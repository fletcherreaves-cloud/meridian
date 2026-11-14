// @ts-nocheck
export default {version:'5.785', date:'2026-11-14', changes:[
  '**QSRSoft Security Events Pull (GH #1532) — correction to v5.784\'s fix: "today" gets no ' +
  'exemption either.** v5.784 shipped `datesToRequest()` dropping any already-covered date ' +
  'except the last one in the list (today), on the theory today is always incomplete mid-day. ' +
  'A second live dispatch (self-hosted runner, same day) disproved that: requesting ONLY ' +
  '2026-11-14 — which already had 127 rows from that morning\'s normal 11:00 UTC cron — got ' +
  '`AccessDeniedException` on all 252/252 units, the identical signature. The real gate is ' +
  'per-DATE, not "past day vs today": once any query for a given date has succeeded once, ' +
  're-querying that SAME date again is denied, today included, no matter how many hours ' +
  'separate the two attempts. `datesToRequest()` now drops every already-covered date, no ' +
  'exceptions. Practical ceiling this reveals: this account gets exactly one successful read ' +
  'per date, ever — a second intra-day check-in to catch later-arriving events isn\'t possible ' +
  'under this entitlement, and isn\'t something a client-side change can fix. Confirmed the ' +
  'outcome tracker treats an all-already-covered (empty request list) run as a clean exit 0, ' +
  'not a zero-rows failure. 7 unit tests. Full findings: ' +
  'memory/finding-security-events-reQuery-deny-2026-11-14.md.',
]};
