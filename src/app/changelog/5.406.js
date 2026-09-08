// @ts-nocheck
export default {version:'5.406', date:'2026-09-08', changes:[
  'Simplified the Items Recounted tile fix from earlier today (v5.405), per owner follow-up: ' +
  '"the different count data should be easy to get from the raw item detail... thought we ' +
  'already were." Right call -- qsr_raw_item_detail.history is a genuine per-transaction event ' +
  'log (never overwritten, unlike qsr_onhand\'s rolling-latest snapshot), and the tile\'s ' +
  'recount-window math already read it for the actual $ diffing. The only thing qsr_onhand/ ' +
  'inv_count_sessions were supplying was the window BOUNDS -- and those are derivable straight ' +
  'from an item\'s own count-day history.',
  'itemCloseWindowRecount (eom-ledger-baseline.js) gained autoWindowDays: when no explicit ' +
  'window is supplied it derives one intrinsically per item -- a tight cluster of close-' +
  'together counts is one cycle, a gap wider than autoWindowDays (ordinary weekly cadence) is ' +
  'not, so routine week-over-week counting is never misread as a recount. Same protection the ' +
  'original design carried, now computed with zero external inputs beyond the item\'s own ' +
  'history.',
  'ItemsRecountedTile now calls ledgerScopeDiff with autoWindowDays:3 directly off ' +
  'qsr_raw_item_detail + qsr_variance_stat -- dropped loadQsrOnHand, loadInvCountSessions, and ' +
  'weeklyRecountWindows/weeklyRecountWindowsFromLog from this tile entirely. Every store with ' +
  'raw item-detail rows now participates (no upfront per-store gate); a store/item that ' +
  'doesn\'t cluster simply contributes zero recount activity.',
  'count-cycle.js\'s inv_count_sessions wiring from v5.405 (sessionsFromLog/ ' +
  'cycleComplianceFromLog/weeklyRecountWindowsFromLog) is NOT reverted -- it answers a genuinely ' +
  'different question (whole-class coverage completeness) qsr_raw_item_detail structurally ' +
  'cannot, and stays available for the Count Cycle compliance panel.',
  '6 new/changed regression tests using the real captured Madill numbers, including a genuine ' +
  '3-count cluster and the explicit-window-still-wins case. Full suite 4643/4643, build clean, ' +
  '538.03 KB / 850 KB budget. Updated writeup: ' +
  'memory/finding-recount-window-onhand-overwrite-2026-09-08.md.',
]};
