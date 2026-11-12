// @ts-nocheck
export default {version:'5.741', date:'2026-11-12', changes:[
  '**💵 Store Cockpit: new Cash Controls tab.** Third tab alongside Food Cost and Labor & '+
  'Scheduling (same hero + driver-rows + flagship-chart + correlation-strip pattern). Hero is '+
  'Cash Over/Short % vs target, trailing 6 weeks, colored against the same |cashOSPct| tiers '+
  'the real Controls Health score (pipeline.js) already uses. Controls Drivers card ranks '+
  'T-Red After %, T-Red Before %, Discount %, POS Over %, and Promo % against their own real '+
  'per-store targets, worst→best. Flagship is a daily Cash O/S % trend line with the target as '+
  'a reference line; a Loss Prevention Signals card covers Drawer Opens/Day (vs the real '+
  'settable target) and Cash Refund/Day (vs the existing Controls Scorecard flat 2/day '+
  'standard it already uses). A matching Cash Controls tile joins the Overview Tab Digest row. Closes a real '+
  'metric-source.js gap found along the way: POS Over % had no resolution chain at all '+
  '(posOverAmt/posOverCnt did) — added as a derivation-only ratio (posOverAmt ÷ netSalesAmt), '+
  'same shape as its Discount %/T-Red siblings.',
]};
