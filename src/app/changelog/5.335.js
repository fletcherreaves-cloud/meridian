// @ts-nocheck
export default {version:'5.335', date:'2026-09-03', changes:[
  'EOM Dashboard: new "🔗 Manage Share Links" action (Reports group) -- lists every read-only ' +
  'share link created for the current period (store, created date, expiry, view count, last ' +
  'viewed, acknowledged, status) with a Revoke button on active links. createEomShareLink\'s "🔗 ' +
  'Share" per-store button has existed since Phase 1, but there was previously no way to see or ' +
  'revoke a link after creating it -- loadEomShareLinks/revokeEomShareLink existed in supabase.js ' +
  'with zero consumers.',
  '4 new tests (real EOMDashboardPanel render, actual Reports-dropdown click path). Full suite ' +
  '(3725 tests) and build both clean (533.29 KB / 850 KB eager budget). Smoke-tested via dev ' +
  'server + headless Chromium, zero JS errors.',
]};
