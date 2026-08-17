// @ts-nocheck
export default {version:'4.266', date:'2026-07-02', changes:[
  'Labor Analytics: fix Days column showing +1 extra day (Math.round → Math.floor on range end-time fraction).',
  'Monthly Targets: Sales column now shows full dollar amount ($xxx,xxx.xx) instead of abbreviated $xxxK.',
  'Monthly Targets: switching to a period with no Supabase data now correctly shows empty table instead of falling back to the currently-loaded month.',
  'EOM Supervisor: mtOK check now uses row-level _year/_month stamps (set by Supabase load) in addition to monthlyTargetsMeta, so projections populate even when the in-memory data came from Supabase rather than a fresh file upload.',
  'EOM Supervisor: OT Hours target in Projections row now shows "0" (target is always 0).',
  'DI Calibration: error log now shows the first stack frame alongside the error message for easier diagnosis.',
]};
