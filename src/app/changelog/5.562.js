// @ts-nocheck
export default {version:'5.562', date:'2026-10-14', changes:[
  'Pricing Engine summary RPC (v5.561) -- fixed two real bugs found by verifying it LIVE against ' +
  'the actual table after the owner ran the migration ("sql done"), instead of trusting the mocked ' +
  'test suite alone:',
  '(1) Unpaginated truncation: the real qsr_menu_item_activity_summary() result is ~14,000 rows ' +
  '(27 stores x ~390-520 active items/store), not the few hundred the original comment assumed -- ' +
  'well past PostgREST\'s default 1000-row page cap. The v5.561 loader made one unpaginated call, ' +
  'which would have silently returned only the first 1000 rows with no error -- quietly wrong ' +
  'instead of loudly broken. lib/supabase.js\'s loadQsrMenuItemActivitySummary() now paginates via ' +
  'fetchAll() (same mechanism every other big loader in this file already uses).',
  '(2) POST-style RPC calls silently ignore Range on this project: live-measured three different ' +
  'page offsets against a plain supabase.rpc(name, args) call, and all three returned the IDENTICAL ' +
  'first 1000 rows -- no error, no 400, just silent non-pagination. @supabase/supabase-js\'s ' +
  '{ get: true } option (documented for a read-only/stable function, which this one is) switches ' +
  'the call to GET with the args as a query string, which DOES honor Range correctly -- verified ' +
  'end-to-end. Every call site now passes it; never drop it.',
  '(3) schema-qsr-menu-item-activity-summary-rpc.sql -- added an explicit ORDER BY to the SQL ' +
  'function. A GROUP BY result has NO row-order guarantee across separately executed statements in ' +
  'Postgres, and a Range-paginated caller issues one statement PER PAGE -- without an ORDER BY, an ' +
  'end-to-end live pagination run across the real ~14,000-row result produced 2,343 DUPLICATE ' +
  '(loc,item_number) rows, meaning an equal number of real rows were silently never returned at ' +
  'all. Re-running the (now-fixed) SQL file in the Supabase SQL editor is a quick, idempotent ' +
  '`create or replace function` -- needed once more since the owner already ran the pre-fix version.',
  'New tests cover both: a 2,500-row fixture proves pagination collects every row past the 1000 cap ' +
  'with no duplicates, and every RPC call is asserted to carry { get: true } -- with the mock\'s own ' +
  'POST-shaped path modeled to return page 0 every time (matching the measured failure) so a ' +
  'regression back to a bare .rpc() call fails loud in this suite, not just in production.',
  'Full suite green (603/603 files, 5643/5643 tests), npm run build clean, within the ' +
  'entry-chunk budget.',
]};
