// @ts-nocheck
export default {version:'5.318', date:'2026-09-02', changes:[
  'Performance Reviews: investigated "Q3/Q4 not populating" (owner report, 2026-09-02). MEASURED ' +
  'against live Supabase (service-role) + the real autoPopulateKPIs/mergedTargetsForLocMonth, fed ' +
  'real July/August 2026 rows: Q3\'s primary metrics (OEPE/R2P/KVS/Labor%/Sales) DO auto-fill ' +
  'correctly once cloud data has landed -- no bug in the date math or the auto-fill mechanism. Q4 ' +
  'actuals are correctly blank (Oct/Nov/Dec 2026 haven\'t happened -- zero rows in any cloud ' +
  'stream). Q4 targets for every yearly-workbook-backed metric (OEPE/R2P/KVS/TPPH/FOB/OSAT/EAD/' +
  'Digital/Delivery/Headcount/Turnover/Shift-Cert) already correctly fall back to the yearly tier ' +
  'via the existing DEFAULT<yearly<monthly<override cascade -- verified live with real per-store ' +
  'yearly_targets values. Only Sales$ and Labor% targets stay blank for Q4, and that\'s a genuine ' +
  'upstream data gap, not a code bug: yearly_targets.prod_sales/crew_labor_pct are null for all ' +
  '27 live stores -- no pipeline has ever populated a yearly-tier Sales$/Labor% figure (only the ' +
  'monthly workbook ever carries one), so there is no yearly value to fall back to until Q4\'s ' +
  'monthly targets are actually uploaded. Not fabricating one.',
  'Fixed the real bug found along the way: dispatch #159\'s Auto-fill race-condition gate ' +
  '(App.js cloudStreamsReady / KPITab dataReady) only waited for App.js\'s "T1" tier ' +
  '(qsrActSummaryRows/glimpseRows -- the OEPE/R2P/KVS/Labor%/Sales chains), but ' +
  'autoPopulateKPIs also reads several "T2" sources the gate never covered: ds.smgFullscale ' +
  '(OSAT/EAP), ds.rosterStatsRows/rosterRoleCounts/turnoverRows (Headcount/Shift-Cert/Turnover ' +
  '0-90), ds.digitalAppRows/mcdeliveryRows (Digital/Delivery GC/R/D, Delivery Wait), ds.ebosRows ' +
  '(Op Supplies), and ds.qsrFobRows (auto FOB $). A click on "Auto-fill from Uploaded Data" in ' +
  'the window between T1 landing (button enables) and T2 landing could silently leave those ' +
  'fields blank for any month T2 would have covered -- same failure mode #159 already fixed for ' +
  'T1, just not period-specific and not fully closed. cloudStreamsReady now flips true after T2 ' +
  '(not T1), closing the gap for every source the Auto-fill button actually depends on.',
  'Added two regression tests: dispatch-perf-review-t2-autofill-race.test.js (the T2 race, same ' +
  'engine-level pattern as the existing dispatch-159 test) and ' +
  'dispatch-perf-review-q4-target-fallback.test.js (the yearly-target-fallback finding, and that ' +
  'Sales$/Labor% correctly stay unresolved with no data to fall back to).',
]};
