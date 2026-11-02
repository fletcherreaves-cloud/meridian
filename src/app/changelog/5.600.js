// @ts-nocheck
export default {version:'5.600', date:'2026-11-02', changes:[
  '**New: "🔄 Refresh EOM Data" button (EOM Dashboard + Supervisor Rollup).** Owner report: a ' +
  'late Business Day Close left Product Net Sales/Cash +/- stale for several stores until a ' +
  'manual GitHub Actions dispatch caught them up. This button does the same re-pull (FOB + ' +
  'Operations Report, together) from inside the app -- same `trigger-dar-sync` Edge Function ' +
  'the Data Manager panel\'s own "↻ Sync" buttons already use, just fired as one combined ' +
  'action since EOM numbers depend on both streams. **Requires an owner-run Edge Function ' +
  'redeploy** (`supabase functions deploy trigger-dar-sync`) to pick up the new `ops` workflow ' +
  'key before this button works end to end.',
]};
