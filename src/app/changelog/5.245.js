// @ts-nocheck
export default {version:'5.245', date:'2026-08-28', changes:[
  'Dispatch #204 -- Store Cockpit: two new content-only tabs in Store Analytics\' District View ' +
  '(src/views/store-cockpit.js, wired into store-analytics.js\'s existing tab strip exactly like ' +
  'dispatch #200\'s embedded LocationIntelligence tab -- no own ModalShell/backdrop). Owner-approved ' +
  'concept ("I am a fan of the store cockpit"), design reference memory/design-refs/' +
  'store-cockpit-mockup.html matched for visual language (dark-first, McDonald\'s-gold accent, hero ' +
  'verdict band + driver bars + a flagship visual per tab), every number wired to the real engines ' +
  'the dispatch names -- none reinvented.' +
  '\n\n' +
  'Food Cost tab: hero FOB% verdict (buildStoreFobReport, fob-report.js) sourced from ' +
  'fobSnapshotByStore\'s MTD-cumulative-snapshot-safe read (eom-inventory.js -- latest-per-period, ' +
  'never summed) of ds.qsrFobRows, falling back to loadQsrFob() only when the app-wide copy isn\'t ' +
  'loaded yet, same perf pattern eom-dashboard.js\'s own FOB Report already uses. Ranked component ' +
  'driver bars off the same report. Day-by-day variance trace (fobDailyTrace/biggestJumpDay, ' +
  'variance-trace.js) -- the flagship visual, zero new data, differences real consecutive MTD ' +
  'snapshots. Masking check (gross loss vs gross gain) fed by item-level variance self-loaded via ' +
  'the scoped loadQsrVarianceHistory({loc,periods}) reader (never the district-wide ' +
  'loadQsrVarianceStat). Data-discipline waste-logging-cadence indicator (waste-discipline.js) via ' +
  'the same ensureLazyFill(\'wasteRows\')/load-on-open pattern analytics.js\'s FOBAnalysisPanel ' +
  'already establishes. Correlation strip via scanAllPairs (signal-registry.js) scoped to this one ' +
  'store, monthly (food_cost metrics are monthly-only), filtered to Food Cost pairs -- same Pearson/ ' +
  'Spearman/FDR-guarded stats Scanner already uses, nothing hand-rolled.' +
  '\n\n' +
  'Labor & Scheduling tab: hero Crew Labor% (resolveLaborTarget, labor-basis.js, tCrewLabor basis) ' +
  'vs actual via metricRate (metric-source.js -- sum/sum over the pay week, never mean-of-daily, so ' +
  'an in-progress day can\'t skew it). Verdict framing is the Planning-vs-Execution split ' +
  '(computeLaborGapSplit/latestCompleteWeekByStore, labor-gap-split.js, Wed-Tue PAY week -- a third, ' +
  'distinct boundary from the 4am business day and from DAR\'s own compType:\'trading\' alignment, ' +
  'never mixed), with whichever gap (Needed->Scheduled planning, or Scheduled->Actual execution) is ' +
  'bigger driving the coaching-target line (the scheduler vs. the shift manager). Rate/hours/sales ' +
  'decomposition (avgRate/actHrs/sales, metric-source.js) week-over-week -- a deliberate simplification ' +
  'from the mockup\'s "vs LY-pace" framing to "vs prior pay week" (both weeks are directly ' +
  'computable from the same shared helpers; LY-pace would need vs-ly.js\'s matched-day machinery, ' +
  'deferred, noted below). Intraday deployment heat map -- the flagship visual, hour x day-of-week, ' +
  'needed-vs-actual gap, diverging color via color-mix(). Sourced from a NEW scoped loader, ' +
  'loadDailyActivityRangeForStore(loc,startDate,endDate) (src/lib/supabase.js), added this dispatch ' +
  'so the heat map doesn\'t pull all 27 stores\' hourly qsr_daily_activity rows to render one ' +
  'store\'s grid (loadDailyActivityRange has no loc filter). 24-distinct-hour_slot completeness ' +
  'guard, identical to labor-standard.js\'s own -- this reads the RAW qsr_daily_activity table (not ' +
  'qsr_daily_activity_rollup, the one CLAUDE.md warns zero-fills an in-progress "today"), so a ' +
  'genuinely incomplete pull here has fewer than 24 rows and the guard is the correct trap for this ' +
  'source. Overnight excess flag via overnightOpenness/overnightExcessByStore (labor-standard.js). ' +
  'Correlation strip via scanAllPairs scoped to this store, daily, filtered to Labor pairs.' +
  '\n\n' +
  'Deferred (named per the dispatch\'s own explicit fallback clause -- a real, correctly-wired ' +
  'slice over a half-wired full mockup): annotateTouchpoints/lastCountAnchor real-count bracketing ' +
  'for the variance-trace jump callout (needs analyzeCountCadence session data from ' +
  'weekly-cadence.js, a separate load neither tab otherwise needs -- biggestJumpDay still works ' +
  'standalone, falling back to period-start as the window bracket, so the callout is real, just ' +
  'less precise than the district FOB Report\'s count-anchored version). Rate/hours/sales sales leg ' +
  'compares vs the PRIOR PAY WEEK rather than vs LY-pace (see above). Both are one-line-callable ' +
  'follow-ups, not structural gaps.' +
  '\n\n' +
  'Live verification (SUPABASE_SERVICE_ROLE_KEY, service-role Bearer, this session\'s environment, ' +
  '2026-08-28): confirmed real reads against qsr_fob, qsr_variance_stat, qsr_daily_activity, ' +
  'qsr_daily_activity_rollup, and store_labor_config (a deliberately wrong column on the last one ' +
  'returned 42703, not a denial -- the standard three-way calibration). Ran the REAL ' +
  'computeLaborGapSplit/latestCompleteWeekByStore against a real live-pulled complete pay week for ' +
  'store 3708 (Wed 2026-08-19 - Tue 2026-08-25): needHrs 1257.5, schedHrs 1362.5, actHrs 1401.03 -> ' +
  'planningGapHrs +105.0, executionGapHrs +38.53 -- planning leads, so the verdict correctly reads ' +
  '"the schedule, not the shift," written over the guide. Ran the REAL fobSnapshotByStore + ' +
  'buildStoreFobReport against real live-pulled qsr_fob rows for the same store: August MTD FOB% ' +
  '4.674% vs 3.85% target -> +0.82pp gap, $2,174.90/mo opportunity, Variance Stat the top driver ' +
  '(+0.54pp over its own target), matching a hand trace to the cent. Ran fobDailyTrace against a ' +
  'real (non-frozen) July window for the same store and confirmed a genuine day-over-day delta ' +
  '(+$476.73 on 2026-07-02) decomposes correctly per component, summing back to the total.' +
  '\n\n' +
  'Full suite: 300 files / 3112 tests passing. npm run build clean, entry chunk 545.99 KB / 850 KB ' +
  'gzip budget (304.01 KB headroom) -- both new tabs render lazily inside store-analytics.js\'s ' +
  'existing lazy chunk, no new static import added to App.js.' +
  '\n\n' +
  'PM-verification addition (2026-08-28): the live-Supabase engine verification above proves the ' +
  'ENGINES compute correctly against real data -- it does not prove the REACT COMPONENTS actually ' +
  'render that data, per this repo\'s standing "would this verification still pass if reverted?" ' +
  'rule. Added dispatch-204-store-cockpit.test.js, mounting the real FoodCostCockpitTab/ ' +
  'LaborCockpitTab (not mocks): loading-state renders for both without a data source, plus a real ' +
  'hero FOB%/driver-bar render computed end-to-end through the actual buildStoreFobReport engine ' +
  'from fixture qsr_fob rows (2.20% vs a 2.80% target -> -0.60pp, Variance Stat ranked #1 driver -- ' +
  'matches a hand trace). Deliberately does not test the ds.qsrFobRows:[] fallback-fetch branch: ' +
  'this session\'s own sandbox carries real VITE_SUPABASE_URL/ANON_KEY, so that branch would call ' +
  'the live loadQsrFob() and its timing would depend on network round-trip rather than the test -- ' +
  'exactly the kind of environment-dependent behavior CLAUDE.md\'s "measure it" rule warns about ' +
  '(it would behave differently in CI, where those vars are typically unset).',
]}
