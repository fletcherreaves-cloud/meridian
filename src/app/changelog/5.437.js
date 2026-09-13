// @ts-nocheck
export default {version:'5.437', date:'2026-09-13', changes:[
  'Metric Registry -- closes the last 3 keys dispatch #229 named as having no auto chain: ' +
  'manualRefAmt, discCnt, promoCnt. manualRefAmt already had a real chain (ctrlRows->auditRows), ' +
  'just never wired into signal-registry.js\'s AUTO_FIRST_KEY_MAP. discCnt/promoCnt needed a new ' +
  'chain -- discount_qty/promo_qty were already sitting in the auto-pulled opsCashRows data ' +
  '(qsr_cash_sheet), same JSONB blob discAmt/promoAmt already read, just never given a camelCase ' +
  'alias. Also corrects a wrong in-code comment: metric-source.js used to claim "promoCnt ' +
  'deliberately NOT added: no auto/emailed stream emits it" -- that was simply false, not ' +
  'stale-but-once-true; promo_qty was there the whole time. Full writeup: ' +
  'memory/dispatch-229-final-keys-2026-09-13.md.',
  '5 new/extended tests confirmed to fail against pre-fix code, exercising the real ' +
  'extractMetricValues Trend Explorer/Scanner integration point for each key.',
  'Full suite 507/507 files, 4835/4835 tests. Build clean, 542.17 KB / 850 KB eager-payload ' +
  'budget.',
]};
