// @ts-nocheck
export default {version:'5.254', date:'2026-08-29', changes:[
  'Dispatch #213 -- EOM count-completion notification polish, three owner-requested items on the ' +
  'shipped email (#209/#211), all in one PR:' +
  '\n\n' +
  '(1) Item name + WRIN together. scripts/lib/resend-notify.mjs\'s buildEmailContent() uncounted-' +
  'items list used to show it.descr OR it.wrin -- now shows both together whenever descr exists ' +
  '("Frozen Patties (A1)"), falling back to the WRIN alone only when descr is missing.' +
  '\n\n' +
  '(2) Real KB links, two of them now dynamic per store. scripts/qsrsoft-onhand-pull.mjs\'s ' +
  'kbLinksForClasses(classes) gained two params: kbLinksForClasses(classes, nsn, dateStr). Best ' +
  'Counting Practices now points at the owner\'s own corrected search-results URL (verbatim, incl. ' +
  'the utf8=✓ param). Physical Inventory and On-Hand Inventory are no longer static KB articles -- ' +
  'both are live per-store links straight into QSRSoft\'s own counting/reporting tool ' +
  '(v3.myqsrsoft.com/cimt/inventory/...), the second amended mid-build after the owner sent a ' +
  'follow-up with the direct On-Hand link (per-store/date/class -- F/C/P/N, confirmed against ' +
  'normClass()\'s own single-letter mapping in eom-inventory.js, not assumed). A food_condiment ' +
  'trigger now carries BOTH an F and a C On-Hand link, not one. Five more tool links the owner also ' +
  'sent (Variance Stat/Yields, Transfers, Waste, Purchases, Raw Items, Inventory Analysis) are ' +
  'explicitly deferred to a future dispatch #214 -- they need their own class-mapping design, not ' +
  'bolted on here.' +
  '\n\n' +
  '(3) FOB + components section, freshness-gated. When a fired notification\'s trigger touches ' +
  'Food and/or Condiment (FOB_CLASSES), the email now carries a FOB section -- headline fobPct/fob ' +
  '$ plus all six components (Variance Stat/Completed Waste/Raw Waste/Condiments/Emp-Mgr Meals/' +
  'Unexplained), formatted with fob-report.js\'s own money()/pp() conventions mirrored verbatim (not ' +
  'exported there, so not re-invented here either) -- but ONLY when the store\'s latest qsr_fob ' +
  'row\'s updated_at is at or after the count-completion time of its own Food+Condiment on-hand ' +
  'items this run (the owner\'s literal ask: "ensure the data pull is as recent or newer than the ' +
  'in-hand"). Stale or missing FOB renders no section at all -- no caveat, no placeholder. New pure ' +
  'foodCondimentCountCompletedAt()/isFobFresh() in qsrsoft-onhand-pull.mjs reuse eom-inventory.js\'s ' +
  'own countedDate()/normClass() (countedDate exported for this, not re-derived) and ' +
  'fobSnapshotByStore()\'s existing latest-snapshot-per-store aggregation (never summed -- the FOB ' +
  '30x guard) rather than a second hand-rolled FOB reduction. triggerFobPullIfPossible() now also ' +
  'fires on a food/condiment-only trigger (previously only the overall ~90% believes-done flag), so ' +
  'a fresh FOB pull is actually in flight the moment Food+Condiment finishes -- it is expected and ' +
  'correct for the freshness check to still fail on the very run the count just finished.' +
  '\n\n' +
  'New supabase/schema-eom-fob-snapshot.sql (fob_snapshot jsonb on eom_count_notifications, ' +
  'idempotent add-column) -- ⚠️ needs the owner to run it manually before FOB data ships for real, ' +
  'same handoff pattern as every other new-column migration in this repo.' +
  '\n\n' +
  'Real live measurement (SUPABASE_SERVICE_ROLE_KEY, direct REST via @supabase/supabase-js, not ' +
  'reasoned about): store 0043701, period 2026-08 -- 161 real Food+Condiment qsr_onhand rows, max ' +
  'last_counted/last_submitted (countCompletedAt) = 2026-08-28T00:00:00Z; latest qsr_fob row\'s real ' +
  'updated_at = 2026-08-29T15:32:56.443Z. Hand-computed fresh (2026-08-29 >= 2026-08-28); code\'s ' +
  'isFobFresh() independently returned true; fetchFobSnapshotForStore() returned a real, sane ' +
  'snapshot (fobPct 4.50%, fob $8,887.70 on $197,635.55 sales, all six components populated).' +
  '\n\n' +
  '23 new/updated unit tests across resend-notify.test.js (item+WRIN both cases, FOB section ' +
  'present/absent) and eom-count-notifications-pull.test.js (kbLinksForClasses\' new signature -- ' +
  'nsn/dateStr threading verified against two different NSNs so an accidental 3708 hardcode would ' +
  'fail; foodCondimentCountCompletedAt; isFobFresh both directions with realistic timestamp ' +
  'fixtures, including a same-day-earlier-pull stale case; buildNotificationRow\'s fob_snapshot ' +
  'passthrough). Full suite 3261/3261.' +
  '\n\n' +
  'No panel/App.js changes -- eager-payload budget unaffected (523.90 KB gzip, same as v5.253\'s ' +
  'baseline).',
]};
