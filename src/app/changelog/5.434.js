// @ts-nocheck
export default {version:'5.434', date:'2026-09-13', changes:[
  'Signals/Trend Explorer/Scanner -- condiment %, employee meal %, and unexplained-difference % ' +
  'now auto-first through metric-source.js the same way compWaste/rawWaste/statVar already do, ' +
  'instead of reading only the manual FOB Excel upload. Closes 3 of the 7 keys dispatch #229\'s ' +
  'own AUTO_FIRST_KEY_MAP comment named as having "no matching METRIC_SOURCES chain today" -- ' +
  'their qsr_fob $ legs (condimentsAmt/empMgrMealsAmt/unexplainedAmt) were already live since ' +
  'dispatch #64 as inputs to the overall FOB % sum, just never wired to a standalone derived ' +
  'percentage of their own. Manual upload still wins when present; the auto/emailed stream now ' +
  'fills the gap once that upload lapses, matching the same auto-first pattern already shipped ' +
  'for their 3 siblings. The other 4 named keys (baseFoodPct/discCoupon/pLFoodPct/pLPaperPct) ' +
  'have no $ leg loaded anywhere yet -- left as a separate follow-on, not silently expanded into. ' +
  'Full writeup: memory/dispatch-229-fob-subitem-auto-first-2026-09-13.md.',
  '4 new/modified tests confirmed to fail against pre-fix code, including rollupCapableMetricKeys ' +
  '\' exact-list ratchet extended (16 -> 19) and 3 new RATIO_METRIC_ROWS entries.',
  'Full suite 506/506 files, 4820/4820 tests. Build clean, 541.91 KB / 850 KB eager-payload ' +
  'budget (541.86 -> 541.91 KB, +0.05 KB gzipped).',
]};
