// @ts-nocheck
export default {version:'5.710', date:'2026-11-09', changes:[
  '**🔎 Spot-Check Ruler\'s Top Variance Movers now rolls up WRIN transitions to the master item '+
  '(owner request 2026-11-09), fixing a double-counting artifact on Ice Cream Mix:** when a WRIN '+
  'transitions mid-period (e.g. Oklahoma\'s 06294-045 → 06294-072 Ice Cream Mix), the old and new '+
  'codes showed as two separate variance movers instead of one item\'s net swing — overstating the '+
  'apparent variance (Ardmore-Broadway read as an 89% overstatement). `topVarianceMovers()` now '+
  'groups by master WRIN (first 5 digits before the dash, the same convention '+
  '`inventory-transfers.js`\'s `rollupByWRIN()` already uses) before ranking by |$ diff|, and the UI '+
  'notes "net of N WRINs" when a rollup happened. Florida\'s 06294-054 is a separate, stable '+
  'regional code (different DC) and never rolls up with the OK transition pair — confirmed it never '+
  'co-occurs with -045/-072 at any Florida store. 7 new tests.',
]};
