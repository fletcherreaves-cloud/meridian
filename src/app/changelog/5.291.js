// @ts-nocheck
export default {version:'5.291', date:'2026-08-31', changes:[
  'EOM Missing Items report / Store Message -- confirmed-QSRSoft-deactivated items no longer get ' +
  'the generic "Verify and deactivate in QSRSoft if no longer sold, or count if still active" line ' +
  'when we already know the answer (owner req, verbatim: "we need to solve for items that are ' +
  'already deactivated in the system to reflect such so as not to have managers waste their time ' +
  'chasing something already done"). diagnoseIncompleteCount() already carried three signals for ' +
  'this (QSRSoft\'s own active flag, "(Deactivated)"/"(Obsolete)" description text, and a dropped-' +
  'from-the-store\'s-own-pull heuristic) -- the gap was that a confirmed-deactivated item still fell ' +
  'into the same generic message as a merely-stale, still-ambiguous one.',
  'A confirmed-deactivated item now reads one of two ways, per the owner\'s own correction mid-' +
  'conversation ("we need to verify the on-hand is zero... yet we were showing an on-hand amount"): ' +
  '$0/0-units on hand -> "Already deactivated in QSRSoft, $0 on hand -- no action needed" (and drops ' +
  'out of the actionable item counts/badges those reports total up, though it stays visible in the ' +
  'list itself -- nothing silently disappears); a real residual still on hand -> "Deactivated in ' +
  'QSRSoft but still carrying $X on hand -- zero it out (waste/write-off) before close," since that ' +
  'item is NOT actually done yet, matching the owner\'s own live Ada-Country Club example.',
]};
