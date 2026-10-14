// @ts-nocheck
export default {version:'5.553', date:'2026-10-14', changes:[
  'Security panel -- fixed Inventory STILL showing zero findings after v5.552\'s fetchAll ' +
  'skip-and-continue fix (owner-reported live, re-confirmed with v5.552 already deployed). ' +
  'v5.552 was real and correct -- it fixed a genuine truncation bug -- but it fixed the SYMPTOM ' +
  'on the slow path, not the actual root cause: loadSecurityFindings() was calling the ' +
  'SEQUENTIAL fetchAll() -- one page at a time, no concurrency -- instead of _pagedParallel(), ' +
  'the helper almost every other big-table loader in this file already uses. Live-measured ' +
  'directly against the real table, end to end, through the real exported loader (not a ' +
  'reimplementation): a full sequential load of ~20,700 rows across ~21 pages took 39.5s with ' +
  'ZERO page failures that run -- not a truncation bug at all this time, just too slow for a ' +
  'panel a reader is actively watching load. A second run saw 4 of 21 pages fail and still ' +
  'recovered 206 real Inventory groups in ~20-24s, because _pagedParallel() fires its pages ' +
  'concurrently (Promise.allSettled) and -- per its own existing header comment -- never had ' +
  'the single-page-kills-everything-after-it bug fetchAll() needed fixing for in the first ' +
  'place. Switching to it is a strict improvement on both speed and resilience, not a tradeoff.',
  'Also live-verified RLS was NOT the blocker, ruling it out rather than assuming: created a ' +
  'throwaway admin-role auth account (service-role admin API), signed in for a real access ' +
  'token, and queried security_findings_latest/security_rules exactly as the browser does ' +
  '(anon apikey + user Bearer token) -- both returned real rows immediately, then the ' +
  'throwaway account was deleted. The stale-role-string RLS bug found and ruled out earlier ' +
  'this session (security_findings\' RLS policy checking the old \'supervisor\' string instead ' +
  'of \'area_supervisor\') still doesn\'t apply here either way -- the one live admin profile ' +
  'satisfies both the old and corrected wording.',
  '_pagedParallel()\'s extraOrder option extended to accept {column, ascending} alongside a ' +
  'plain column name (previously every caller only ever needed a single ascending direction) -- ' +
  'loadSecurityFindings\' own covering-index order needs loc/subject_key/rule_id ASCENDING but ' +
  'window_end/computed_at DESCENDING, which no prior caller required.',
  'New dispatch-security-findings-parallel-2026-10-14.test.js (6 tests) driven through the real ' +
  'exported loadSecurityFindings(), per this repo\'s "drive a fix through a real exported ' +
  'loader" convention -- confirmed 2 of them fail against the pre-fix code (an upfront {head:true} ' +
  'count query now fires, the one signal unique to _pagedParallel; a ruleIds filter now reaches ' +
  'the page query via inCol/inVals, which the old chained-.order()-then-.in() shape could not). ' +
  'Full suite green (600/600 files, 5610/5610 tests + 1 skipped), npm run build clean, within ' +
  'the entry-chunk budget.',
]};
