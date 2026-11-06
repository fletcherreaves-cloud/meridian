// @ts-nocheck
export default {version:'5.669', date:'2026-11-06', changes:[
  '**New Store Launch Planner: hourly breakdown.** Expand any day in the plan to see its ' +
  'Effective $ split across the 24 real `hour_slot` buckets (4am business day), derived live ' +
  'from the comparables\' own real intraday shape (no new table, no DDL) — plus a Suggested Hrs ' +
  'per hour using the same corrected ($ ÷ avg check) ÷ TPPH formula as the daily total. When a ' +
  'comparable shows under 1% of its real sales in the deep-overnight hours (05:00, 24:00–28:00), ' +
  'the panel now says so explicitly rather than silently applying a near-closed shape to a store ' +
  'that actually trades overnight. A true quarter-hour view is not available — `qsr_daily_activity` ' +
  'only ever carries hourly `hour_slot` values, confirmed live against real comparable data.',
]};
