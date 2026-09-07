// @ts-nocheck
export default {version:'5.394', date:'2026-09-07', changes:[
  'Manual report uploads now actually use the "reports" Storage bucket instead of ' +
  'base64-encoding the whole file into a pending_reports column. uploadReportFile() ' +
  '(src/lib/supabase.js) always claimed to upload to Storage in its own comment -- the bucket ' +
  'and its RLS policies already existed for exactly this, unused. A 12.37 MB base64 blob (a ' +
  'Labor report) was observed exceeding the read-side statement timeout on EVERY device fetch. ' +
  'The cross-device sync read path (App.js) now downloads from Storage first, falling back to ' +
  'the legacy file_data column only for rows uploaded before this fix.',
  '⚠️ Found a second, more serious bug while tracing this one, measured live against the real ' +
  'database: pending_reports has NO insert policy for any client role, so a genuinely new ' +
  'manual upload\'s metadata row has been silently failing to insert (42501 RLS violation) -- ' +
  'the file uploads, but no other device ever learns it exists. New ' +
  'supabase/schema-pending-reports-insert-policy.sql adds the missing policy. Owner needs to ' +
  'run it in the Supabase SQL editor for cross-device sync to work on brand-new uploads.',
  '3 new tests (upload-report-file-storage.test.js) against a mock Supabase client. Full suite ' +
  '484 files/4617 tests, build clean, eager budget 537.95 KB / 850 KB (unchanged).',
]};
