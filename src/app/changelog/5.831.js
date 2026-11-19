// @ts-nocheck
export default {version:'5.831', date:'2026-11-19', changes:[
  '**Task #152 (metric/formula reconciliation), pass 6: Promo/Discount ROI.** Added a ' +
  '`promoDiscountRoi` entry to Metric Lineage documenting `engine/promo-roi.js`\'s matched-day ' +
  'lift formula — every figure on the Promo/Discount ROI panel (Sales lift/day, Give-away/day, ' +
  'Gross-profit Δ/day, Lift %, Verdict) and SAGE\'s `query_promo_roi` tool, genuinely ' +
  'undocumented before this pass. Covers the exogenous-calendar-tag split (why it replaced two ' +
  'prior intensity-based splits that each measured biased in opposite directions), the real ' +
  'verdict thresholds, and the discount lever\'s honest "no exogenous signal exists" limit. ' +
  '5 new tests (`src/__tests__/metric-provenance.test.js`).',
]};
