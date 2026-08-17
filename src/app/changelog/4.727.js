// @ts-nocheck
export default {version:'4.727', date:'2026-08-01', changes:[
  'EOM Supervisor OT: now sourced AUTO-FIRST from the Operations Report labor-summary stream (ds.opsLaborRows → overTimeTotalHours/$), device-independent, no manual upload needed; manual daily-labor upload is the fallback and manual entry still overrides. (The auto stream is currently empty because the Operations Report pull is returning 0 rows on a stale QSRSOFT_TOKEN — refresh the token and OT auto-populates with no further app change.)',
  'FOB Leadership Summary: renamed "laggards/achievers" → "Focus Stores / Top Performers" and softened the language ("ran $X over" not "burned") for an above-store-leader doc.',
]};
