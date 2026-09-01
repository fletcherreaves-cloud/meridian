// @ts-nocheck
export default {version:'5.301', date:'2026-09-01', changes:[
  'Fourth and final piece of today\'s weekly-count automation (owner req, verbatim): "I would ' +
  'also like to see the automatic emails work with weekly counts." New ' +
  'scripts/weekly-cycle-digest-send.mjs (+ its own hourly-cron, self-gating GitHub Action, same ' +
  'pattern as EOM Digest Send) emails ONE daily digest listing every store whose detected weekly ' +
  'count day is today, plus each one\'s real Count Cycle compliance status -- critical/overdue ' +
  'stores sorted first, exceptions listed per store.',
  'Runs once daily, self-gated on a configurable UTC hour (org_config key ' +
  '\'weekly_digest_config\', default 23:00 UTC / ~6pm CDT -- right after the new weekly-count-day ' +
  'pull window\'s 5pm CT close, mirroring eom-digest-send.mjs\'s own hourly-cron-plus-hour-gate ' +
  'pattern exactly). Recipient: the SAME "send to the owner for now" address the existing EOM ' +
  'digest already uses (eom-digest-notify.mjs\'s own recipientFor(), a decision made in dispatch ' +
  '#215, not a new one made here) -- real per-role delivery is future work, once Resend\'s domain ' +
  'is verified and this app has a per-user contact registry, neither of which exist yet.',
  'Content reuses formatWeeklyComplianceReport()\'s own status/last-count wording (the same ' +
  'function powering the Count Cycle panel and its new share link, both shipped earlier today) so ' +
  'the digest can never disagree with what the in-app card or a shared link shows for the same ' +
  'store. New workflow added to sync-failure-watch.yml\'s watch list, matching the standing rule ' +
  'for every new scheduled workflow.',
]};
