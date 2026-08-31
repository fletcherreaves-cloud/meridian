// @ts-nocheck
export default {version:'5.282', date:'2026-08-31', changes:[
  'EOM count variance -- a session\'s count $ impact is now NETTED across every same-day/same-window ' +
  'entry, not just the raw final one. QSRSoft counts an item BY AREA (fries live in 2-3 places), so ' +
  'one honest count is several submissions -- each carries the $ IMPACT of that ONE area, not the ' +
  'session\'s real ending variance. A -$1,941 area entry then a +$1,988 area entry nets to ~+$47 (a ' +
  'normal two-area build-up), but three engines were reading the raw FINAL entry alone as if it were ' +
  'the whole story: eom-variance-raw.js\'s latestVarianceByWrin() (feeds the Change Monitor\'s locked-' +
  'baseline snapshots), eom-ledger-baseline.js\'s itemCloseWindowRecount() (feeds Change Monitor\'s ' +
  '"Baseline" tab, the Recount Impact report, the At-A-Glance "Items Recounted" tile, AND SAGE\'s ' +
  'query_eom_recount_impact tool), and eom-recount-detect.js\'s itemRecounts() (feeds the ' +
  'recount-swing diagnosis finding\'s baseline). Real example that surfaced this: McNuggets #32525, ' +
  '2026-08-29, 08:39/09:01 -- read as a -$1,988 loss, was actually a +$47 net move. ' +
  'eom-count-sessions.js\'s Progression view already netted correctly (the reference model this ' +
  'copies) -- this brings the other three engines in line with it. On-hand/manager/timestamp still ' +
  'come from each group\'s LAST entry (on-hand is a running, replace-semantics total); only the $ and ' +
  'unit variance combine. New regression tests use the real McNuggets numbers in all three engines. ' +
  '⚠️ sage-chat needs a redeploy to pick this up (it imports eom-ledger-baseline.js directly).'
]};
