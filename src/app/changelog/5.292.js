// @ts-nocheck
export default {version:'5.292', date:'2026-08-31', changes:[
  'EOM Missing Items report / Store Message -- fixed a real overclaim in v5.291\'s own deactivation ' +
  'messaging, caught live the same session: "Deactivated in QSRSoft but still carrying $X on hand" ' +
  'was asserted for Ada-Country Club\'s Fried Apple Pie, but QSRSoft\'s OWN active flag says that item ' +
  'is still TRUE (genuinely on sale) -- only the weaker droppedFromCurrentPull() heuristic (this ' +
  'row alone stopped refreshing while the rest of the store kept updating) had fired, and that ' +
  'signal is admitted in its own code comment to be only ~85% accurate. diagnoseIncompleteCount() ' +
  'now splits the signal into `confirmedDeactivated` (QSRSoft\'s own active flag or its own ' +
  '"(Deactivated)"/"(Obsolete)" description text -- a fact) vs the weaker drop-from-pull-only case ' +
  '(an inference). Only a confirmed signal gets the confident "Deactivated in QSRSoft" wording; the ' +
  'weak-signal case now reads "Hasn\'t refreshed from QSRSoft in over a week... may already be ' +
  'deactivated with a stale balance, or may still be active and just need a fresh count. Verify in ' +
  'QSRSoft" and stays in the actionable item counts, since we\'re not confident enough to call it done.',
  'Investigated the owner\'s live report that our Missing Items data for a deactivated item ' +
  '(Wht Pasteurized Process Cheese, Ada-Country Club) doesn\'t reflect a real count QSRSoft\'s own ' +
  'event log shows happened Aug 6 (zeroed to $0). Confirmed via qsrsoft_kb (QSRSoft\'s own "On Hand ' +
  'Inventory" support article): zero-then-deactivate is documented best practice, not an enforced ' +
  'rule -- live data shows deactivated items CAN carry real, persisting nonzero balances for weeks. ' +
  'Root cause (our bulk on-hand pull stops refreshing a WRIN\'s row once something happens to it, so ' +
  'we never learn its true post-deactivation state) is diagnosed but not yet fixed -- needs a ' +
  'targeted per-WRIN re-pull this session has no QSRSoft credentials to build/verify. Full writeup: ' +
  'memory/finding-deactivated-items-onhand-staleness-2026-08-31.md.',
]};
