// @ts-nocheck
export default {version:'4.205', date:'2026-06-19', changes:[
  'Critical fix: buildStore\'s pLY (4-week LY comparison) was missing an upper date bound — summed ~392 days of LY sales against pSales\'s 28 days',
  'Caused a uniform ~92-93% "decline vs LY" on every single store regardless of actual performance — first surfaced via District Priority Brief\'s aggregate, but affected every consumer of store.pSales/store.pLY',
  'Also silently affected GM Coaching Letters\' "Sales (4wk) vs LY" line — every letter generated before this fix would have shown a false catastrophic decline',
  'Fixed at the source in buildStore — cascades correctly to District Priority Brief, GM Coaching Letters, and all other vsLY consumers with no per-feature changes needed',
]};
