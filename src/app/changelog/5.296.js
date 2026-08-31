// @ts-nocheck
export default {version:'5.296', date:'2026-08-31', changes:[
  'EOM Store Message — added a "🧹 Housekeeping" view alongside the existing Recap/Full report ' +
  'toggle. Owner feedback: the Full report is legitimately dense, and while a technical reader ' +
  'wants every section, a less-technical store manager can find it overwhelming -- but the fix ' +
  'isn\'t trimming what\'s actually food-cost-actionable (the fountain rollup, decision guide, ' +
  'earlier-count context, systemic patterns, and portioning/yield watch all stay in Full report -- ' +
  'every one of them ties back to this or next cycle\'s FOB number, even portioning coaching that ' +
  'can\'t recover THIS count\'s dollars but is the direct root-cause lever for ongoing food cost). ' +
  'The one section that never changes this month\'s FOB number even in principle is the Obsolete / ' +
  'Discontinued / Inactive verify-and-clear list -- zeroing a deactivated item\'s residual doesn\'t ' +
  'touch food cost, it just keeps the number clean for next month\'s opening. That section moved ' +
  'out of Full report into its own Housekeeping view (one click away, not gone -- Full report now ' +
  'carries a one-line pointer to it). Named "Housekeeping" rather than "Follow-Up" to avoid ' +
  'colliding with the existing "📣 EOM Follow-up" bulk store-messaging modal in the same panel.',
]};
