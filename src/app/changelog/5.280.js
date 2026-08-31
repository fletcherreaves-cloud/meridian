// @ts-nocheck
export default {version:'5.280', date:'2026-08-31', changes:[
  'Dispatch #228 -- on-demand "regenerate with fresh data and resend" for the per-store EOM ' +
  'count-completion notification (email/SMS/push), owner-requested with a screenshot of a real ' +
  'Ardmore count-complete email. Distinct from the EOM Digest, which already had its own ' +
  'on-demand resend -- this is the OTHER email, the fire-once per-store alert ' +
  '(scripts/qsrsoft-onhand-pull.mjs\'s notifyRow()/buildNotificationRow() path), which had no ' +
  'on-demand trigger at all.' +
  '\n\n' +
  'New script `scripts/eom-notification-resend.mjs`: loads a store\'s CURRENT qsr_onhand rows ' +
  '(same table/mapping as eom-digest-send.mjs\'s own loadOnHandByLoc(), scoped to one loc), re-runs ' +
  'the real computeCountProgress()/detectCountNotifications()/diagnoseIncompleteCount() pipeline, ' +
  'and calls the real notifyRow() -- every piece reused verbatim from qsrsoft-onhand-pull.mjs, ' +
  'nothing reimplemented. Design choice (spelled out in the dispatch, decided here): a manual ' +
  'resend widens trigger_kind to a new \'manual_resend\' kind and widens triggerClasses to ALL ' +
  'four classes (not just whichever one most recently completed), so uncounted_items/kb_links/ ' +
  'fob_tool_links show a full current-state snapshot -- "regenerate" means the whole current ' +
  'picture, not a replay of the original narrow trigger. Logs to the same eom_count_notifications ' +
  'history table (trigger_kind distinguishes a manual resend from an automatic fire).' +
  '\n\n' +
  'triggerLabel() (scripts/lib/resend-notify.mjs) gets a small special case for \'manual_resend\' ' +
  '-> "Current Status" -- the generic split-on-underscore rendering would otherwise show the raw ' +
  'words "manual + resend" in the live subject/body/push-title templates.' +
  '\n\n' +
  'New GitHub Actions workflow `eom-notification-resend.yml` (workflow_dispatch only, modeled on ' +
  'eom-digest-send.yml\'s own dispatch block) + a matching `resend_notify` entry in ' +
  '`trigger-dar-sync`\'s WORKFLOWS allowlist, following the existing `digest` entry\'s pattern. Not ' +
  'added to sync-failure-watch.yml -- it has no scheduled trigger (fires only from a live, ' +
  'logged-in click whose result the human is already watching in the modal), so it is out of ' +
  'scope for that watcher\'s cron-triggered-workflow contract (verified: ' +
  'src/__tests__/sync-failure-watch.test.js only requires cron-triggered workflows to be watched).' +
  '\n\n' +
  'New "🔄 Resend" button in the EOM Dashboard\'s per-store "✉️ Draft" / Store message modal ' +
  '(src/views/eom-dashboard.js), wired to triggerSync(\'resend_notify\', { loc, period }) -- the ' +
  'same call shape as the existing "📧 Generate Report" -> Send button\'s ' +
  'triggerSync(\'digest\', { level }).' +
  '\n\n' +
  'Tests: buildResendRow() exercised against synthetic on-hand fixtures (correct class_statuses/ ' +
  'uncounted_items/trigger_kind/fob_snapshot for known inputs, including the "nothing currently ' +
  'complete -> null" case); notifyRow() called with a buildResendRow()-produced row through the ' +
  'real send functions (network boundary mocked, matching this repo\'s existing dispatch #211 ' +
  'test pattern); a render test mounts the real EOMDashboardPanel, clicks the real "✉️ Draft" -> ' +
  '"🔄 Resend" chain, and asserts the real triggerSync() call args, busy state, and success/error ' +
  'message rendering. A live send cannot be verified in this sandbox (no RESEND_API_KEY) -- same ' +
  'documented limitation as scripts/test-eom-notification-send.mjs\'s own header.' +
  '\n\n' +
  'Gzip eager payload: 527.63 KB (baseline v5.279: 527.31 KB, budget 850 KB) -- the new button ' +
  'lives in the already-lazy EOM Dashboard chunk, the new script is server-side only.'
]};
