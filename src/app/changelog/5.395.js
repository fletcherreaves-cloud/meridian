// @ts-nocheck
export default {version:'5.395', date:'2026-09-07', changes:[
  'Correction to v5.394: retracted the "pending_reports has no INSERT policy" claim -- it was a ' +
  'diagnostic error, not a real bug. The claim was measured with a bare anon-key probe (no ' +
  'login), which is a different, weaker test than the app\'s real authenticated upload path. ' +
  'This table already had a tenant_insert policy from the multi-tenant rollout ' +
  '(tenant_id = current_tenant_id()) plus a tenant_id column defaulting to the single-tenant ' +
  'UUID -- a real, logged-in user\'s upload likely already passed RLS through that policy all ' +
  'along. supabase/schema-pending-reports-insert-policy.sql is now a retraction record with a ' +
  '"drop policy" statement for the overly-open policy v5.394 added.',
  'The other half of v5.394 stands unchanged: uploadReportFile() still uploads to the ' +
  '"reports" Storage bucket instead of base64-encoding into pending_reports.file_data -- that ' +
  'fix (and the 12.37 MB timeout it addresses) was independent of the RLS question.',
  'No app code changed in this correction -- docs + a retracted SQL file only.',
]};
