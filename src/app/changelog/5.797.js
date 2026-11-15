// @ts-nocheck
export default {version:'5.797', date:'2026-11-15', changes:[
  '**Fixed: Signals Live Ops Hourly Detail showed R2P, KVS, DT Parked%, Labor %, and TPPH as "—" ' +
  'for every completed hour, on every store, today.** Owner report on Elgin specifically ("lots of ' +
  'data blank here"), but it affected the whole district. Root cause: App.js\'s shared daily-' +
  'activity fetch (the one actually wired into Signals via darRows/refreshDar) was missing the ' +
  'front-counter/kitchen/DT-parked/labor-cost columns a separate loader (loadDailyActivity) already ' +
  'had -- those 5 columns came back `undefined` for today\'s view even though the underlying ' +
  'qsr_daily_activity rows have always carried real data. A live Supabase check on Elgin confirmed ' +
  'it: real fc_trans_cnt/mfy1_trans_cnt/mfy2_trans_cnt values were there all along.',
  '**Fixed: Hourly Detail rendered rows for hours of today that have not happened yet**, which read ' +
  'as blank data across 6+ columns at once. Those not-yet-elapsed hours are now hidden, with a short ' +
  'note explaining why, matching the same current-hour handling Baseline Anomalies already has.',
  '**Fixed: that Baseline Anomalies current-hour exclusion (shipped 2026-11-15) was itself a silent ' +
  'no-op against real data** -- it parsed `hour_slot` ("16:00"-style strings) with `Number()`, which ' +
  'returns NaN for that format, so the in-progress hour was never actually excluded in production. ' +
  'Switched to `parseInt(hour_slot, 10)`, the pattern already used correctly elsewhere in this file.',
]};
