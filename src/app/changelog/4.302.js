// @ts-nocheck
export default {version:'4.302', date:'2026-07-04', changes:[
  'Monthly Projections patch reports: previous month actuals now populate from the auto-synced LifeLenz schedule data (ds.schedRows) when manual labor uploads are absent — computeMonthActuals supplements laborRows with schedRows for any loc+date not already covered, preventing double-counting.',
  'Supabase persistence for fobRows, opsRows, ctrlRows, darRows: save on upload, load on startup — cloud-first cross-device sync (v4.301 code, version number correction).',
]};
