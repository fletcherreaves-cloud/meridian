// @ts-nocheck
export default {version:'5.768', date:'2026-11-13', changes:[
  '**Fix: Signals → Live Ops "DT Speed" was never OEPE** (owner-reported, screenshot). The column ' +
  'summed `dt_untilserve/dt_trans_cnt/1000` with no subtraction at all — that raw formula is a ' +
  'real QSRSoft metric ("Avg DT TTL"), just not OEPE W/O Parked, which also subtracts ' +
  '`dt_untilstore` and `dt_heldtime`. Now uses the shared, already-reconciled `oepeSeconds()` ' +
  '(r=0.9958 vs a real QSRSoft report, the same function dt-speedofservice.js/graded-visits.js ' +
  'already use) in both the per-store aggregate and the hourly detail, summing raw components ' +
  'first and dividing once. Live-verified against a real store/day: old formula read 201.8s, real ' +
  'OEPE reads 164.9s for the same hours — a ~37s gap, not a rounding difference.',
  '**Fix/rename: "Accuracy" was never order accuracy.** `healthy_count/(healthy+unhealthy)*100` is ' +
  'QSRSoft\'s own 2nd Side (KVS) Healthy Usage formula — the math was right, the label was wrong. ' +
  'Renamed to "2nd Side Healthy Usage %" everywhere (column header, summary strip, hourly detail, ' +
  'legend, export/print), explicitly marked "NOT order accuracy" in the UI.',
  '**Live Ops table expanded with 5 new real columns** (owner request): R2P (Front Counter ' +
  'Receipt-to-Present), KVS Time Per GC, DT Parked % (DT Pull Forward %), Labor % (cost-based ' +
  'Punch Labor %, kept separate from the existing staffing-level "Labor vs Need"), and TPPH. All ' +
  'sum-raw-then-divide-once from the same qsr_daily_activity rows, both in the per-store summary ' +
  'and the hourly detail. "Sales" in the hourly detail renamed to "Product Sales".',
  'Alert-threshold basis for the new columns is never invented: R2P/KVS reuse ' +
  'dt-speedofservice.js\'s own per-store-target-plus-40s convention verbatim; DT Parked %/Labor %/ ' +
  'TPPH reuse analytics.js\'s own actual-vs-target `deltaColor` convention verbatim. A store with ' +
  'no DEFAULT_TARGETS entry for a given field renders that metric uncolored rather than against a ' +
  'guessed band.',
  'StoreRow\'s old fixed 6-column grid (4 metrics) couldn\'t hold 9 readably — replaced with a ' +
  'labeled metric-chip strip that scrolls horizontally on narrow screens while the store name/' +
  'alert badge stay pinned (panel-contract mobile convention); the hourly table gained the same ' +
  'horizontal-scroll treatment now that it\'s 13 columns.',
  '`loadDailyActivity` select expanded 16→28 columns for the new raw fields (confirmed the sole ' +
  'caller via grep, so additive/safe). Two pre-existing, unrelated latent bugs found while tracing ' +
  'field names (daily-review.js\'s R2P field typo + nonexistent KVS field names) are flagged for ' +
  'task #152, not fixed here — see memory/finding-signals-liveops-mislabels-2026-11-13.md.',
  '25 new/updated tests, full suite (8029 tests) and build pass clean (702.71 KB eager, budget 850 KB).',
]};
