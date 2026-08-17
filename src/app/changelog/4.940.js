// @ts-nocheck
export default {version:'4.940', date:'2026-08-10', changes:[
  'FIXED — Needs Attention could never catch a pure sales decline, no matter how severe. It only checked cash/controls/labor/speed signals, so a store on a real, sustained sales slide (found: Atoka, down 15.4% vs last year over the trailing 4 weeks, worsening every week) never showed up there even though other panels track sales separately. Added a dedicated sales-decline check using the same trailing-month comparison the rest of the app already uses, tuned against the real district numbers so it flags a genuine outlier without flooding the list on an ordinary soft week.',
]};
