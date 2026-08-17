// @ts-nocheck
export default {version:'4.274', date:'2026-07-03', changes:[
  'Monthly Targets: startup now loads ALL available periods from Supabase (not just the most recent month) into ds.allMonthlyTargets — persisted in OPFS so available immediately on reload. EOM Supervisor reads the correct period\'s targets directly from this index on every month change.',
  'EOM Supervisor: removed per-period Supabase round-trip on month change; period lookup is instant from allMonthlyTargets.',
]};
