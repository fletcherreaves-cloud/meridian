// @ts-nocheck
export default {version:'5.441', date:'2026-09-14', changes:[
  'Smart Targets -- click any column header to sort by it (Store, Official, ' +
  'Smart, each FOB component, Current, vs Official, Best fit, Conf, Anomalies, ' +
  'Adj). Click again to flip asc/desc; an arrow marks the active column. Missing ' +
  'values always sort last in BOTH directions -- a real bug caught by this ' +
  'dispatch\'s own tests before shipping (naively reversing an ascending, nulls-' +
  'last array puts the nulls FIRST on desc; fixed by keeping null-handling ' +
  'unconditional and only flipping the real-value comparison). Switching metric ' +
  'resets to the default (direction-aware) order, since a FOB component sort key ' +
  'is meaningless on Sales. New smartTargetsSortValue()/sortSmartRows() (pure, ' +
  'exported) carry the logic.',
  'Smart Targets -- added Base Food Cost %, Paper Cost %, and Disc/Coup % as ' +
  'selectable metrics. None of the three feed FOB %\'s 6-component sum (owner ' +
  'explicit: "None of which affect the FOB Calculation") -- verified by a test ' +
  'confirming fobMonthly()\'s own output is unaffected by the same row carrying ' +
  'all three fields. All three read the same qsr_fob table and monthly-collapse ' +
  'FOB % already used, with field names (totalBaseFood, the 6 P&L paper-cost ' +
  'legs, discountCouponsAmt) confirmed directly against at-a-glance.js\'s own ' +
  'fobAgg/fobAuto formula -- the same one the At-A-Glance FOB tile ships -- ' +
  'rather than assumed. Official targets read tFOBBase/tPaperCost/tDiscCoupPct ' +
  '(monthly_targets columns base_food_pct/paper_cost_pct/disc_coup_pct, already ' +
  'wired both directions by saveMonthlyTargets/loadMonthlyTargets).',
  '20 new/extended tests confirmed to fail against pre-fix code, including real ' +
  'SmartTargetsPanel renders selecting each metric via its actual <select> and ' +
  'clicking real column headers.',
  'Full suite 512/512 files, 4893/4893 tests. Build clean, 543.97 KB / 850 KB ' +
  'eager-payload budget.',
]};
