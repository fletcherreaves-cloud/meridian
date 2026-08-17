// @ts-nocheck
export default {version:'4.530', date:'2026-07-25', changes:[
  'Fix: the forecast table (District View + Store Analytics) left the current week\'s completed-day Actual and GC columns blank. The forecast engine read actuals from manual Operations Report uploads only, so recent days that had only auto-synced (DAR) data showed nothing. Actuals + guest counts now fall back to the auto DAR when a manual upload isn\'t present — so completed days of the current week fill in (Actual, GC, and the AI-vs-Actual variance) as the daily sync lands. (OEPE / TPPH / Labor% for past days still come from the Ops/Controls uploads.)',
]};
