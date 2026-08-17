// @ts-nocheck
export default {version:'4.199', date:'2026-06-18', changes:[
  'GM Coaching Letters — evolved from single-store on-demand to district-wide batch engine',
  'Batch mode: "Generate All 27" — one supervisor can maintain a coaching cadence with every GM',
  'Data source upgraded — now pulls buildStore\'s findings/opsScore/ctrlScore/trend instead of raw rows',
  '6wk→4wk→2wk trend direction precomputed and stated explicitly (was previously absent entirely)',
  'Critical findings now force the letter\'s FOCUS section to address them directly, not generically',
  'Every letter is an editable draft with a Reviewed checkbox — human review before copy/print',
]};
