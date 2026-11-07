// @ts-nocheck
export default {version:'5.671', date:'2026-11-07', changes:[
  '**New Store Launch Planner: real quarter-hour (15-min) breakdown.** The prior hourly-breakdown ' +
  'build (v5.669) concluded 15-minute sales data didn\'t exist anywhere in Meridian — true of the ' +
  'DAR table it checked, but a separate table (`qsr_sales_quarter_hour`, built for the unrelated ' +
  '"Record Hour" feature) already holds real 15-minute sales, backfilled to 2024-01-01. Each ' +
  'plan-date row now has a second, independent "15-min" toggle alongside "Hourly", expanding a ' +
  'real 96-bucket breakdown built from the same comparable-store blending and Suggested-Hours ' +
  'formula, with the same overnight-comparability caveat for 24-hour stores.',
]};
