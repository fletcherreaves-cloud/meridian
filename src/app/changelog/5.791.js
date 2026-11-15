// @ts-nocheck
export default {version:'5.791', date:'2026-11-15', changes:[
  '**QSRSoft Security Events now has a real per-stream freshness entry.** Closed the gap ' +
  'memory/finding-security-events-reQuery-deny-2026-11-14.md flagged and left open: `qsr_' +
  'security_events` had no entry at all in stream-freshness.js\'s STREAMS array, so it was ' +
  'invisible to At-A-Glance\'s "Loaded Data" checklist and the home-screen staleness banner — ' +
  'the only signal that the pull was healthy was the sync-failure-watch workflow issue (GH ' +
  '#1532, now auto-closed after the re-query fix shipped yesterday). Same lightweight single-' +
  '{date}-row probe pattern already proven for On-Hand/Variance (task #137): new ' +
  '`loadQsrSecurityEventsFreshness()` (src/lib/supabase.js, reads `event_dt` — the real business ' +
  'date, not `updated_at`) + App.js\'s `_stSecurityEventsFreshness` background stage + a real ' +
  'STREAMS entry (`securityEvents`, cadenceDays:1, grouped under Controls). Also added the ' +
  'matching `scheduled-pull-registry.mjs` entry so `scheduled-pull-watchdog.mjs` can retrigger ' +
  'this cron the same way it already can for every other watched stream — a standing invariant ' +
  'test (`scheduled-pull-registry.test.js`) requires the two files\' key sets to match, and it ' +
  'correctly failed until this was added. The pull\'s 1-day-behind-by-design "today" lag (never ' +
  'requests today, per that finding doc) sits comfortably inside the standard cadenceDays:1 ' +
  'grace window, so no threshold change was needed. 7 new tests.',
]};
