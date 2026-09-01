// @ts-nocheck
export default {version:'5.311', date:'2026-09-01', changes:[
  'Speed of Service -- DT History correction to dispatch #88\'s own fix (PR #633, merged ' +
  '2026-08-24), which shipped without a reachable live Supabase session and could not verify ' +
  'wall-clock. This session had SUPABASE_SERVICE_ROLE_KEY (per CLAUDE.md\'s own "re-measure ' +
  'per-session" rule) and re-measured against production qsr_daily_activity directly.',
  'Finding: _pagedParallel\'s own count:\'exact\' head-count query -- the piece PR #633\'s parallel ' +
  'fan-out depends on to know how many pages to fire -- can itself hit a Postgres 57014 ' +
  'statement timeout on this table. Measured live: repeated queries ran 600ms-3.8s once the ' +
  'relevant pages were cache-warm, but the FIRST cold-cache request in this session timed out ' +
  'at ~8.1s server-side (x-envoy-upstream-service-time header). Because a failed count already ' +
  'falls back to the strictly-sequential fetchAll (#343, deliberate), one cold-cache timeout ' +
  'costs the wasted ~8s PLUS a full sequential re-fetch -- measured live at 9.6s for this same ' +
  'query -- roughly 17.5s total, reproducing the original "15+ second" complaint PR #633 shipped ' +
  'to fix, just less often instead of never.',
  'Fix (src/lib/supabase.js, _pagedParallel -- the shared helper behind all 11 of its callers, ' +
  'not a loadDtHistory-only patch): head-count query switched from count:\'exact\' to ' +
  'count:\'estimated\', which answers from Postgres planner statistics instead of scanning the ' +
  'table and is immune to the same timeout by construction. Measured live: a consistent ' +
  '330-520ms on the identical query. Trade-off: \'estimated\' can UNDERCOUNT (measured live: ' +
  '42,105 estimated vs 45,136 true rows on the same 90-day window, ~7% low, stale ANALYZE ' +
  'stats) -- silently trusting it would truncate the NEWEST rows on loadDtHistory\'s ' +
  'ascending:true read, violating #343\'s own "a fast, silently-truncated read is worse than a ' +
  'slow complete one" rule. Added a safety-extension loop: after the initial estimate-sized ' +
  'batch, keep fetching one more page past the estimate whenever the last page fetched comes ' +
  'back completely full, until a short/empty page proves the true end -- live-measured end to ' +
  'end: 3 extension rounds closed the 42,105-vs-45,136 gap and returned all 45,136 rows.',
  'Live wall-clock, same 90-day/dt_trans_cnt>0 query, three strategies measured end to end ' +
  '(2026-09-01, cache-warm): OLD strictly-sequential fetchAll 9,575ms (46 rounds) -- PR #633\'s ' +
  'shipped count:\'exact\' parallel fan-out 2,177ms (46 pages / 6 inflight) -- this fix\'s ' +
  'count:\'estimated\' + safety-extension 2,666ms (46 pages + 3 extension rounds). The ~500ms ' +
  'added over the exact-count happy path buys immunity from the observed cold-cache timeout ' +
  'tail risk, not a regression of the common case.',
  'src/__tests__/dt-history-pagination.test.js extended: confirms the head query now requests ' +
  'count:\'estimated\'; an undercounting estimate still returns every row via the exact expected ' +
  'page sequence (no gaps, no re-fetched offsets); an accurate estimate fires zero extension ' +
  'rounds; an estimate landing exactly on a page boundary costs one harmless empty probe, not a ' +
  'truncation or a duplicate; and a page failure DURING extension still surfaces the DATA ' +
  'INCOMPLETE banner. Full suite 3636/3636, build clean, 530.85 KB gzip eager payload ' +
  '(850 KB budget, unaffected shape).',
]};
