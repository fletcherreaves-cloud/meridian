// @ts-nocheck
export default {version:'5.825', date:'2026-11-18', changes:[
  '**LifeLenz DAR\'s net_sales wired in as a real fallback for Sales — real measurement, not a ' +
  'guess.** Owner pushback caught a reasoning error: the prior "don\'t wire this in" call ' +
  'compared LifeLenz\'s `net_sales` against this app\'s `sales` metric using a DIFFERENT, ' +
  'pre-existing finding (QSRSoft\'s own product_sales-vs-net_sales gap, which is real and ' +
  'permanent) — the actual pair never got measured. It now has: 28 stores, one full business ' +
  'day, LifeLenz `net_sales` vs. QSRSoft `product_sales` reconciles to -0.04% aggregate ' +
  '(-0.00% to +0.14% on 27/28 stores); vs. QSRSoft\'s OWN `net_sales` it\'s off by -0.92% ' +
  '(every store, same direction) — i.e. LifeLenz\'s "net sales" field IS this app\'s ' +
  'product_sales-based `sales` metric, just named differently across vendors. New ' +
  '`src/engine/lifelenz-dar-daily.js` (`aggregateLifelenzDarDaily()`, pure, sums hourly rows to ' +
  'one per (loc,dt)) feeds `ds.lifelenzDarDailyRows`, added to `metric-source.js`\'s `sales` ' +
  'chain after `qsrActSummaryRows`, before manual `laborRows`. Transactions do NOT reconcile as ' +
  'cleanly (+1.86% aggregate, consistently the other direction) and stay unwired, same as OEPE\'s ' +
  'parked-time exclusion. Full measurement: memory/finding-lifelenz-dar-schema-2026-11-17.md.',
]};
