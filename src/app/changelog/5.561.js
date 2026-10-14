// @ts-nocheck
export default {version:'5.561', date:'2026-10-14', changes:[
  'Pricing Engine -- fixed "DATA INCOMPLETE ... qsr_menu_item_activity" failures (owner report: ' +
  '"Need to get pricing data in the app. not loading"; confirmed it eventually did finish loading, ' +
  'just very slowly). Live-measured root cause: qsr_menu_item_activity has grown to 627,939 rows ' +
  'total / 398,273 rows in the default 30-day window -- the original comment calling it "a couple ' +
  'of days deep" was true when dispatch #220 shipped it, not anymore. The panel pulled every raw ' +
  'row for the window via fetchAll(), which pages STRICTLY SEQUENTIALLY (one 1000-row page ' +
  'awaited, then the next) -- ~400 serial round-trips for the default view, well past the point ' +
  'some page times out and fetchAll gives up, surfacing the app-wide "N page(s) failed... ' +
  'UNDERSTATED" banner.',
  'But the client never needed the raw rows: engine/pricing-engine.js\'s enrichItemMargins() ' +
  'immediately collapses every row into a SUM per (loc, item_number) across the window and ' +
  'discards the rest -- a few hundred output rows computed from hundreds of thousands of input ' +
  'rows that never needed to leave Postgres. New ' +
  'schema-qsr-menu-item-activity-summary-rpc.sql adds qsr_menu_item_activity_summary(p_start, ' +
  'p_end), a SQL function that does the SUM/GROUP BY server-side (same RLS tenant-scoping a plain ' +
  'select already had, not security definer). lib/supabase.js\'s new ' +
  'loadQsrMenuItemActivitySummary() calls it and synthesizes one already-summed row per ' +
  '(loc, item_number) in the exact shape enrichItemMargins() already parses -- enrichItemMargins() ' +
  'itself is UNCHANGED, since summing a single pre-summed row is a no-op. Falls back to the old ' +
  'full-row loader if the RPC isn\'t installed yet (PGRST202), so shipping this code can\'t break ' +
  'the panel ahead of the SQL migration being run.',
  '⚠️ Needs a one-time manual step: run schema-qsr-menu-item-activity-summary-rpc.sql in the ' +
  'Supabase SQL editor to install the function. Until then the panel keeps working on the old ' +
  '(slow) path.',
  'Separate finding, NOT fixed here (owner action needed, not a code bug): the audit_rows source ' +
  'named in the same banner is the Register Audit pull (.github/workflows/' +
  'qsrsoft-register-audit-pull.yml) -- it has failed on every single scheduled run since at least ' +
  '2026-10-07 (likely since the data\'s own last real date, 2026-09-19), 25+ days stale. Root ' +
  'cause from the live run logs: the direct-token path 401s as expected/designed (QSRSoft tokens ' +
  'always expire within the hour, see CLAUDE.md), but the Playwright browser-context FALLBACK now ' +
  'also fails with a 403 "User is not authorized to access this resource with an explicit deny in ' +
  'an identity-based policy" -- not a token-expiry symptom, an explicit deny on the registerAudit ' +
  'endpoint for the QSRSOFT_USERNAME/QSRSOFT_PASSWORD credential. This needs the owner to check ' +
  'that account\'s permissions/role on the QSRSoft side for Register Audit reports specifically; ' +
  'no code change here can fix an access-policy decision made in QSRSoft itself.',
  '5 new tests (dispatch-pricing-activity-summary-rpc-2026-10-14.test.js): RPC called with ISO ' +
  'day-string args (not a raw Date or a full-table pull), "All Time" passes null/null in one ' +
  'request, row-shape mapping, a direct equivalence check (many raw rows summed client-side vs. ' +
  'one pre-summed RPC row both feeding the SAME unmodified enrichItemMargins() produce identical ' +
  'output), and the PGRST202 fallback path.',
  'Full suite green (603/603 files, 5640/5640 tests), npm run build clean, within the ' +
  'entry-chunk budget.',
]};
