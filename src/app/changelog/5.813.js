// @ts-nocheck
export default {version:'5.813', date:'2026-11-17', changes:[
  '**Targets vs Actual Daily tab: ratio-capable metrics also now use the Σ/Σ rollup.** ' +
  'Follow-up to v5.812\'s Monthly/Yearly fix, owner-requested same day. That version flagged ' +
  'the Daily tab\'s own header comment defending `metricAvg` ("mean of each day\'s own value, ' +
  'never a mean-of-averages") as answering a different question than the completeness-artifact ' +
  'one the Monthly/Yearly fix addressed, without touching it (reversing a documented decision ' +
  'wasn\'t the sweep\'s call to make unattended). Traced it through: the Daily tab\'s 5 built-in ' +
  'presets (7/14/21/28D, MTD) are genuinely safe — PanelControls.js\'s resolveDatePreset anchors ' +
  'them to lastClosedBusinessDay(), never literal "today" — but ReportShell\'s date picker also ' +
  'offers a "Custom…" option with a real date input, and nothing stops a user picking today as ' +
  'the end date. A custom range ending today hits the exact in-progress-day bug for every ' +
  'metric with a real numerator/denominator: OEPE, KVS Time, Average Check, T-Red A/B %, POS ' +
  'Over %, Cash O/S %. Fixed, future-proofed rather than hand-listing the 7 keys: ' +
  '`_ratioCapable` is computed once from `rollupCapableMetricKeys()`, so a metric that later ' +
  'gains a declared ratio chain is covered automatically. Parked %, Drawer Opens, and Promo % ' +
  'stay on `metricAvg` (no declared ratio legs). 3 new tests exercise the real consumer with a ' +
  'custom range ending on the in-progress day, same pattern as v5.812\'s own tests.',
]};
