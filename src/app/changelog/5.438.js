// @ts-nocheck
export default {version:'5.438', date:'2026-09-13', changes:[
  'Needs Attention -- CSAT/guest-comment opportunities now surface alongside FOB/sales/speed ' +
  'issues (GH #317). rankCommentOpportunities() (csat-opportunities.js) was fully built, ' +
  'tested, and already fed the SMG VOICE panel\'s own Opportunities tab -- real detractor-count ' +
  'ranking, theme clustering, and honesty guardrails (Wilson-lower-bound confidence-adjusted ' +
  'rate, thin-sample flagging) all already existed -- but nothing fed its output into the ' +
  'cross-domain Needs Attention feed. New csatOpportunityAlerts() detector (attention-feed.js) ' +
  'takes that already-computed result (matching the file\'s own "detectors take already-' +
  'computed inputs" design) and surfaces a store once it has a real detractor volume (>=3, a ' +
  'stated judgment call, not a measured cut), crit only for a non-thin sample at a genuinely ' +
  'high confidence-adjusted negative rate. Full writeup: ' +
  'memory/dispatch-317-csat-needs-attention-2026-09-13.md.',
  '9 new/extended tests confirmed to fail against pre-fix code, including a real render of the ' +
  'useAttentionFeed hook (not just the engine function) since the wiring lives there.',
  'Full suite 508/508 files, 4844/4844 tests. Build clean, 542.18 KB / 850 KB eager-payload ' +
  'budget.',
]};
