// @ts-nocheck
export default {version:'5.792', date:'2026-11-15', changes:[
  '**New report: Targets vs Actual.** Owner request — "a new report that focuses solely on the ' +
  'monthly targets and daily targets (separate tabs) that shows clearly what the current target ' +
  'is vs the actual results." Two pill tabs: **Monthly Targets** (the 16 fields the real ' +
  'monthly_targets table/MonthlyTargetManager tracks — Sales $, Crew Labor %, overall Labor %, ' +
  'TPPH, and the 11 FOB-leg % + Op Supply $ metrics — target reads the real monthly override for ' +
  'the selected range\'s month where one has been saved, DEFAULT_TARGETS otherwise) and **Daily ' +
  'Targets** (OEPE, KVS Time, Parked %, Average Check, T-Red A/B %, POS Over %, Cash O/S %, ' +
  'Drawer Opens, Promo % — DEFAULT_TARGETS as-is, no monthly override exists for these). Date ' +
  'picker seeded with **7D/14D/21D/28D + MTD** (new MTD preset, `src/components/PanelControls.js`, ' +
  'additive — every existing report\'s own date-range list is unaffected). Laid out per store — a ' +
  'McDonald\'s-red accent card per location (echoing the owner\'s own printed monthly projections ' +
  'workbook) with a Metric/Target/Actual/Variance/Status table underneath, built on ReportShell ' +
  'like every other report in this redesign so it gets Print/CSV/Excel/PDF for free. Every actual-' +
  'value resolution reuses an already-proven resolver — fob-reference.js\'s own FOB-leg delta ' +
  'math (new `resolveMetricForRange()` export, an arbitrary-range sibling to that file\'s existing ' +
  'MTD/L3M/L6W/LM windows) and metric-source.js\'s metricAvg/metricSumRatio — never re-derives ' +
  'either. 17 new tests, live-verified in the running app (date-picker options, both tabs, real ' +
  'target numbers rendering).',
]};
