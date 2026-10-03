// @ts-nocheck
export default {version:'5.492', date:'2026-10-03', changes:[
  'Patch Sheet: fixed most Actual columns showing "—" for real periods with real data on file ' +
  '(owner-reported, Florida/September 2026 screenshot) -- only Sales Projection, Crew Labor %, ' +
  'TPPH Target, and Total Food Cost % ever showed real actuals; Base Food %, Disc Coup %, Comp ' +
  'Waste %, Raw Waste %, Condiment %, Emp Food %, Stat Loss %, Unex Diff %, Food Over Base ' +
  'Target, P&L Paper Cost %, and Op Supply Target were always blank. Root cause: computeMonthActuals ' +
  'and buildGroupSheetHTML\'s ACTUAL_KEY map only ever computed/read 4-5 of the ~14 real fields -- ' +
  'the rest were never sourced at all (a gap, not the null-vs-0 rollup bug fixed 2026-10-02). ' +
  'fobSnapshotByStore (eom-inventory.js) now exposes the full FOB percentage breakdown from the ' +
  'same qsr_fob rows it already loads -- baseFoodPct (from the totalBaseFood column, a genuinely ' +
  'separate figure from the 6-component FOB-target sum), discCoupPct, compWastePct, rawWastePct, ' +
  'condimentPct, empFoodPct, statLossPct, unexDiffPct, and a new pLPaperCostFromRow (same Begin+' +
  'Purchases+Adjustments+Transfers-Promotions-End build-up as the existing pLFoodCostFromRow). ' +
  'computeMonthActuals wires all of it through, manual-upload-wins-outright preserved per field, ' +
  'plus Op Supply $ actual from a genuinely separate source (Σ eBOS op-supplies purchases for the ' +
  'month -- the same auto source review-engine.js\'s own Performance Review "Op Supplies vs ' +
  'Budget" KPI already uses). Bonus Crew Labor % correctly stays "—" -- a business-policy figure ' +
  'with no measured actual anywhere in the app, same conclusion the Jan-Mar 2026 reconstruction\'s ' +
  'own template-derived tier reached.',
  '14 new tests (dispatch-patch-sheet-missing-actuals-2026-10-03.test.js). Full suite: ' +
  '5253/5253 passing. Build clean, eager payload 555.57 KB gzip (budget 850 KB).',
]};
