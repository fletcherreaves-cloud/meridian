// @ts-nocheck
export default {version:'5.552', date:'2026-10-14', changes:[
  'Security panel -- fixed Inventory showing literally zero findings ("No findings match the ' +
  'current filters") alongside a "DATA INCOMPLETE -- 1 page(s) failed to load -- security ' +
  'findings (security_findings_latest)" banner (owner-reported live). Root cause, live-measured ' +
  'against the real table: fetchAll() -- the ONE shared pagination helper ~37 loaders call, ' +
  'including loadSecurityFindings() -- used to treat a SINGLE page that exhausted its retries as ' +
  'fatal to the ENTIRE read: it stopped pagination outright and silently discarded every page ' +
  'after the failed one, however many there were. security_findings_latest genuinely times out ' +
  '(Postgres 57014) on roughly 1 page in 20 under this table\'s own recommended index order ' +
  '(reproduced directly against the live table, matching this exact dispatch\'s own CLAUDE.md ' +
  'guidance to measure rather than assume), and INV-domain rows are the MAJORITY of that table by ' +
  'row count -- so one unlucky mid-pagination timeout could silently drop most or all of the ' +
  'Inventory tab\'s real flagged findings while the banner, hardcoded to `_recordDataError(label, ' +
  '1, 0, ...)` regardless of how much was actually lost, reported a misleadingly tiny "1 page(s) ' +
  'failed" with no sense of the real damage. The data was never missing from the table -- later ' +
  'pages that would have succeeded were simply never attempted.',
  'Fixed by having fetchAll() SKIP a page that still fails after its retries (a bounded, ' +
  'known-size hole of at most one page\'s rows) and keep going, instead of abandoning everything ' +
  'from that point on -- the same "a short dataset still renders, because showing recent days ' +
  'beats showing nothing" philosophy this file\'s own data-error-registry header already states, ' +
  'just applied to a MID-read failure instead of only a first-page one. Bounded by a new ' +
  'MAX_CONSECUTIVE_PAGE_FAILURES=3 cap so a genuinely unreachable table (not just one unlucky ' +
  'page) still gives up instead of hammering a dead connection forever. The DATA INCOMPLETE ' +
  'banner now reports REAL counts (how many pages actually failed, out of how many were actually ' +
  'attempted) instead of the old hardcoded "1 page(s) failed" that read the same whether one page ' +
  'or the whole rest of a table was lost.',
  'High blast radius by design, not scope creep -- fetchAll() is the single shared helper behind ' +
  'nearly every paginated Supabase read in this app (qsr_variance_stat, qsr_daily_activity, ' +
  'labor_rows, org_events, and ~30 more), so this is the same class of silent data loss the ' +
  'Security panel happened to surface first, fixed once at the root rather than patched around in ' +
  'loadSecurityFindings() alone.',
  'Extended dispatch-218-fetchall-retry.test.js and dispatch-fetchall-page-timeout.test.js (both ' +
  'pre-existing coverage for this exact helper) rather than writing parallel new files: updated ' +
  'the two tests whose expectations encoded the OLD stop-dead-on-first-failure behavior (now a ' +
  'deliberate, documented improvement, not a regression), and added 2 new tests -- one proving a ' +
  'failed mid-pagination page is skipped and the pages after it are recovered (the exact shape of ' +
  'the live bug), one proving an isolated failed page surrounded by successes never trips the ' +
  'consecutive-failure cap. Full suite green (599/599 files, 5604/5604 tests + 1 skipped), ' +
  '`npm run build` clean, within the entry-chunk budget.',
]};
