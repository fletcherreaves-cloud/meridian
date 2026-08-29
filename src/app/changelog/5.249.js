// @ts-nocheck
export default {version:'5.249', date:'2026-08-29', changes:[
  'Dispatch #208 -- District View Overview\'s new "Tab Digest" row: six new summary tiles in ' +
  'StoreDash\'s Overview tab (src/views/store-analytics.js), one per District View tab NOT already ' +
  'represented there. Owner, live: "let\'s add new data to overview tab to represent the new tabs ' +
  'and be all inclusive!" Same "headline number, one-line why, click through to the real thing" ' +
  'idiom at-a-glance.js\'s ToleranceRollupTile/OpportunityTile establish at the district level, one ' +
  'level down here -- and the same icon+label+big-mono-value+colored-dot+one-line-detail visual ' +
  'shape Overview\'s own "Metric Vitals" tiles already use, cloned exactly (digestTile helper).' +
  '\n\n' +
  'Scorecards (opsScore/ctrlScore), Intelligence Brief (store.findings top severity) and Forecast ' +
  'Table (rangeTotal vs rangeLY) are DELIBERATELY SKIPPED -- already shown, via the same underlying ' +
  'data, in Overview\'s existing KPI row / Priority Findings section / Period Sales card. 3 Peaks ' +
  '(its daypart-OEPE headline already partially echoed in Shift Analysis\'s "3 Peaks x Labor Gap" ' +
  'widget) and AI Insights (narrative-only, no single headline number) are DELIBERATELY EXCLUDED.' +
  '\n\n' +
  'Food Cost tile: FOB% vs target, gap pp, top driver -- buildStoreFobReport (fob-report.js) fed by ' +
  'fobSnapshotByStore (eom-inventory.js). The period-resolution/report-assembly logic that used to ' +
  'live INLINE only inside FoodCostCockpitTab (nowPeriod/lastPeriods/monthlyByLoc/curSnap selection, ' +
  'the compActual/compTarget build) is now an exported computeFoodCostHeadline(loc, fobRows, t, opts) ' +
  'in store-cockpit.js -- FoodCostCockpitTab and the new Overview tile both call it, no second copy. ' +
  'The "read the ds copy, fetch only if genuinely missing" fallback effect is likewise a shared ' +
  'exported hook, useFobRowsWithFallback(ds) -- Overview triggers the SAME loadQsrFob() fallback the ' +
  'cockpit tab uses (not a lighter "tap to load" state): ds.qsrFobRows is already eagerly loaded at ' +
  'startup (App.js), so in real usage the fallback almost never fires -- consistent behavior beat a ' +
  'second, differently-behaved loading affordance for one tile.' +
  '\n\n' +
  'Labor & Scheduling tile: Crew Labor% vs target + gap (resolveLaborTarget + metricRate, sum/sum ' +
  'over the current complete pay week, never mean-of-daily), plus a SHORT one-clause ' +
  'planning-vs-execution read (computeLaborGapSplit, labor-gap-split.js) -- not LaborCockpitTab\'s ' +
  'full paragraph. ds.qsrActSummaryRows is already eager -- no new fetch.' +
  '\n\n' +
  'Location Intelligence tile: Total Opp/Year, the roadmap\'s summed dollarOpp. liComputeAll/' +
  'liBuildRoadmap were module-private in location-intel.js (only LocationIntelligence itself was ' +
  'exported) -- added to that file\'s export list, pure addition, no logic change (verified: a ' +
  'render test confirms LocationIntelligence\'s own embedded/backdrop behavior is byte-identical to ' +
  'before). Synchronous over already-loaded ds -- no new fetch.' +
  '\n\n' +
  'Records tile: Best Day Sales, computeRecords/scopeRecordData (record-day.js, already imported ' +
  'into store-analytics.js for StoreRecordsTab) -- no new import, no new fetch.' +
  '\n\n' +
  'Action Plan tile: top action, generatePlan(store,settings).actions[0] (store-dash.js, already ' +
  'exported, added to this file\'s import list) -- plain function, no new fetch.' +
  '\n\n' +
  'Register Audit tile -- the one real tradeoff. ds.auditRows is a LAZY_FILL source ' +
  '(metric-source.js), today only pulled on demand by RegisterAuditTab. Triggering it ' +
  'unconditionally on every Overview mount would fire a district-wide, 400-day audit_rows pull ' +
  '(loadAuditRows()\'s own comment: ~150k of ~250k rows per login before dispatch #191 made it ' +
  'lazy, 23 sequential pages, 10-18s late in a load) on every single store-dash open, not just when ' +
  'Register Audit is actually visited. MEASURED this session (synthetic data at the documented ' +
  '~150k-row scale -- this sandbox has no live Supabase credentials to time the network leg itself): ' +
  'the CPU-side cost once rows exist is cheap -- ~12ms to filter+aggregate one store\'s ~5.5k rows ' +
  'via analyzeRegisterAudit, ~309ms for the full district-wide aggregation over all 150k, ~241ms to ' +
  'map 150k raw rows into loadAuditRows()\'s own shape. So the FETCH, not the aggregation, is what\'s ' +
  'worth deferring -- gated behind an IntersectionObserver: the fetch only fires once the tile ' +
  'actually scrolls into view, preserving #191\'s "load on demand" intent while still painting real ' +
  'data quickly on a normal single-screen viewport where the digest row is already visible on mount.' +
  '\n\n' +
  'Inserted between the existing Priority Findings section and the collapsed Charts block, ABOVE ' +
  'the allStores.length>1 district-wide Enterprise Overview block -- renders regardless of ' +
  'allStores.length (verified with a genuine single-store fixture, not just multi-store district ' +
  'view). No change to StoreDash\'s own chrome -- it is a top-level view, not a modal, and stays one.' +
  '\n\n' +
  'Per this repo\'s "would this verification still pass if reverted" standing rule, ' +
  'dispatch-208-tab-digest.test.js mounts the REAL StoreDash consumer (not the underlying engines ' +
  'in isolation, not TabDigestRow standalone) with hand-computed fixture numbers matching the real ' +
  'formulas: all 6 tiles render real values for one store, each tile\'s click-through switches the ' +
  'real tab and the target tab shows the SAME number the tile did (Food Cost/Labor & Scheduling/ ' +
  'Records/Location Intelligence/Action Plan/Register Audit), a second store shows independently ' +
  'hand-verified DIFFERENT Food Cost + Labor numbers (proving genuine per-store computation, not a ' +
  'fixed value), a genuine single-store allStores fixture confirms the row renders while the ' +
  'Enterprise Overview block stays absent, and the Register Audit IntersectionObserver gate is ' +
  'tested both ways -- happy-dom\'s real IntersectionObserver (confirmed this session to never ' +
  'auto-fire without a real layout pass) proves the tile stays gated and never reads auditRows ' +
  'data, and a stubbed always-visible observer proves the loaded state renders correctly. ' +
  'forecastRangeAsync mocked to settle synchronously (dispatch #168\'s own precedent); the four ' +
  'store-cockpit.js Supabase loaders (loadQsrFob/loadQsrVarianceHistory/' +
  'loadDailyActivityRangeForStore/loadStoreLaborConfig) stubbed so clicking into the full Food Cost/ ' +
  'Labor & Scheduling tabs can\'t fire real network calls against production Supabase -- this ' +
  'sandbox carries live VITE_SUPABASE_URL/ANON_KEY (same reasoning dispatch #204\'s own test used).' +
  '\n\n' +
  'Full suite: 303 files / 3137 tests passing (7 new). Build clean; eager payload 522.25 KB gzip ' +
  '(budget 850 KB, headroom 327.75 KB) -- unchanged from #207\'s baseline, since store-analytics.js/ ' +
  'store-cockpit.js/location-intel.js are all lazy-loaded panel chunks, not part of the eager entry.',
]};
