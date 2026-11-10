// @ts-nocheck
export default {version:'5.723', date:'2026-11-10', changes:[
  '**🐛 Fix: Security panel showing "DATA INCOMPLETE — 10 page(s) failed to load" / no findings '+
  'at all.** Root-caused live (owner-reported from phone): `security_findings` has grown from '+
  '20,793 rows (the table size the panel\'s existing load fix was tuned against, 2026-10-14) to '+
  '**242,074 rows today** — ~9,000 rows/day from the daily rules batch, with no ceiling as long '+
  'as that batch keeps running. Measured directly against the live table: the `security_findings_'+
  'latest` view\'s deepest page now costs 7.78s (right at the edge of the ~8s statement timeout), '+
  'and a simple filtered base-table query timed out outright at 8.27s — both new failure points '+
  'since the table\'s 11.6x growth. What the panel showed as "no findings match" was a casualty '+
  'of failed page loads, not a real empty result.\n\n'+
  '`security_findings_latest` is now a real **materialized view**, refreshed once per daily '+
  'batch run instead of being recomputed live (under RLS) on every single page request — read '+
  'cost now scales with the ~23,000-row *output*, not the ever-growing base table. Since '+
  'materialized views can\'t carry RLS policies directly, a thin wrapper view (same name, zero '+
  'app-code change) re-applies the exact same gated-read predicate `security_findings` itself '+
  'enforces.\n\n'+
  '⚠️ **NOT YET LIVE** — this needs the migration (`supabase/schema-security-findings-latest-'+
  'materialized-2026-11-10.sql`) applied by hand in the Supabase SQL editor; this environment has '+
  'no DDL-execution path. Until then the panel keeps behaving exactly as it does today (same '+
  'plain view, same intermittent failures on deep pages) — this ships nothing broken either way.',
]};
