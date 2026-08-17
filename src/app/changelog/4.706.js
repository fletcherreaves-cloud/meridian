// @ts-nocheck
export default {version:'4.706', date:'2026-07-31', changes:[
  'Integrity loop closed: the recount forensic scan now writes implausible padding batches to a new eom_integrity_flags table, and the Needs-Attention panel reads them — so #6838-style "8 corrections in 3 minutes" lands automatically in the one-glance triage feed, no digging. Fail-soft (panel + scan both no-op if the table isn\'t created yet). NOTE: run the eom_integrity_flags block in supabase/schema.sql to activate persistence.',
]};
