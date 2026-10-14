// @ts-nocheck
export default {version:'5.554', date:'2026-10-14', changes:[
  'Security panel -- Inventory STILL empty after v5.553 (owner re-reported live, from mobile/' +
  'cellular, now "4 page(s) failed" instead of 1). Found and fixed the actual remaining cause: ' +
  'pageSize 1000 is simply too much work per page for security_findings_latest\'s DISTINCT ON ' +
  'materialization. Live-measured directly against the real table: firing 6 concurrent 1000-row ' +
  'pages at the table\'s worst-observed offset zone timed out 6/6 at a consistent ~8.3-8.4s ' +
  '(Postgres 57014) -- not occasional bad luck, every single one, confirming the project\'s ' +
  'statement timeout sits right around 8s. The identical test at pageSize 500 still failed 3/6; ' +
  'at pageSize 300 it was 0/6 with a ~7x margin (max 1.1s); at 200, 0/6 with a ~30x margin (max ' +
  '0.3s). Dropped to 300 and re-measured end-to-end through the real loadSecurityFindings(), ' +
  'twice in a row: 20,793/20,793 rows, ZERO page failures, 8-17s total -- both faster AND fully ' +
  'reliable than the pageSize-1000 version\'s 20-40s WITH failures, not a tradeoff between speed ' +
  'and correctness. Same lesson this file\'s own loadQsrRawItemDetail already learned (pageSize ' +
  '200, not the 1000 default, for the identical statement-timeout reason, back in 2026-08-07) -- ' +
  'a DISTINCT ON or otherwise-expensive view can fall off a performance cliff well under 1000 ' +
  'rows, so a generic pageSize default is never a safe assumption for every table.',
  'This closes the loop across 3 dispatches today on the same owner-reported symptom: v5.552 ' +
  'fixed a genuine truncation bug in fetchAll() (real, but not the full story), v5.553 switched ' +
  'to the faster/already-resilient _pagedParallel() helper (real progress, still not enough), ' +
  'and this one fixes the actual root cause underneath both -- the per-page query itself was too ' +
  'expensive at the default page size for this specific view. New regression-guard test pins ' +
  'pageSize at exactly 300 via the real .range(from,to) calls the mock Supabase client records, ' +
  'so a future change back toward 1000 fails the suite instead of shipping silently.',
  'Full suite green (600/600 files, 5611/5611 tests + 1 skipped), npm run build clean, within ' +
  'the entry-chunk budget.',
]};
