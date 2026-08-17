// @ts-nocheck
export default {version:'4.273', date:'2026-07-03', changes:[
  'EOM Supervisor: fetch period-specific monthly targets from Supabase when EOM month changes — June targets load for June view even when July is the most recently loaded. All projections are strictly month-specific with no DEFAULT_TARGETS fallback.',
  'EOM Supervisor: actSales uses sum of Labor Analysis daily rows (Operations Report) as primary; FOB fallback only. actLaborPct likewise. Crew Labor % is sales-weighted average of daily rows.',
  'Guest Voice: smgVoicePerf data now persisted in OPFS blob — survives reload without waiting for async Supabase load.',
]};
