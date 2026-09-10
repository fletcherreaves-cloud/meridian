// @ts-nocheck
export default {version:'5.423', date:'2026-09-10', changes:[
  'Backlog correction (no code change): "DM/shift-role review wiring -- link a review to geid, ' +
  'decide which manager-attributed metrics score it" was flagged open. Re-measured against ' +
  'current code -- it is already fully built. engine/review-engine.js\'s autoPopulateKPIs links ' +
  'review.geid to a manager, SHIFT_ATTRIBUTABLE_ROLES (AM/DM/SM; GM/AS/OM always store-total) ' +
  'gates which roles can attribute, and the manager\'s own OEPE/R2P/KVS/Labor% (the rate/time ' +
  'metrics that compare fairly to a store target) override the store total once it fills -- ' +
  'sales/digital/delivery deliberately stay store-total. The "decide which metrics" half this ' +
  'backlog line called open is exactly that decision, already made and shipped.',
  'The real gap was verification, not code: nothing exercised this end-to-end (the existing ' +
  'geid tests only cover blankReview\'s default-null state). 7 new tests ' +
  '(dispatch-shift-attribution-review-scoring.test.js) covering every SHIFT_ATTRIBUTABLE_ROLES ' +
  'entry, the GM/no-geid/wrong-geid non-attribution cases, the sales-stays-store-total split, ' +
  'and the padding-agnostic loc match. Confirmed these actually catch a regression: temporarily ' +
  'forced canAttribute=false in review-engine.js, 4/7 failed as expected, reverted.',
  'Full suite 4728/4728, build clean, 539.38 KB / 850 KB eager-payload budget (unchanged -- no ' +
  'production code touched).',
]};
