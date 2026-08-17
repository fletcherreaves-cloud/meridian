// @ts-nocheck
export default {version:'4.260', date:'2026-07-02', changes:[
  'Supabase persistence: user target overrides (mf_targets) now sync across devices via org_config key "app_user_targets" — load on login, push on save. EOM Supervisor manual overrides now sync per-month via org_config key "eom_manual_{y}_{m}" — fetched on month change, pushed on every field edit.',
  'AtAGlance scope fixes: weekly trend sparkline, Sales channel totals, Labor district averages, Service times, Controls percentages, and FOB averages all now correctly aggregate only the stores in the active scope (All / OK / FL) instead of the full unfiltered row set.',
  'Data Manager: SMG VOICE Comments now shows report date range instead of just a count.',
  'Performance Reviews: removed dead ORG_FULL/getOrgFull functions with hardcoded operator names — org name set via Customize → Organization.',
]};
