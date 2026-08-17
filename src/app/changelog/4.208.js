// @ts-nocheck
export default {version:'4.208', date:'2026-06-19', changes:[
  'Performance: found a second hot-path issue — getModelAssignment() re-parsed the full localStorage assignment blob on every single call, with no caching',
  'Called directly from forecastDay() — the single most-invoked function in the app. A Why Engine district scan alone makes 1,500+ forecastDay calls, each independently re-parsing the same JSON',
  'Also called once per store inside District Priority Brief\'s tiered computation — 27 full re-parses on every filter-pill click',
  'Added a module-level cache, invalidated explicitly on all 3 write paths (saveModelOverride, clearOvr, the backtest engine) — parse once, never silently stale',
  'Confirmed via real data: the LY fix (v4.205) is working correctly — District Priority Brief now shows properly differentiated 4W vs LY per store (e.g. Elgin +12.3%, Chickasha -6.9%) instead of uniform ~-93%',
]};
