// @ts-nocheck
export default {version:'4.202', date:'2026-06-18', changes:[
  'LifeLenz Bridge — complementary to LifeLenz scheduling, not competing with it (no API, manual entry only)',
  'LEVEL: forward adjustment % per store/day — direct comparison when LifeLenz\'s own "Projected Sales" exists for that date in the loaded file, historical DOW-bias pattern fallback when it doesn\'t',
  'SHAPE: hourly distribution curves built from real darRows history, flagged for deviation when a tagged Calendar event (school release, local event, weather) suggests the normal hourly shape won\'t hold',
  'Single-store 14-day forward view + district-wide ranked scan, Copy Table for fast manual entry',
  'Every adjustment is labeled Direct or Pattern-based — no false confidence when LifeLenz\'s own forward number isn\'t in the loaded file',
]};
