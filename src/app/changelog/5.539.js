// @ts-nocheck
export default {version:'5.539', date:'2026-10-13', changes:[
  'Mass-review notes 70 -- found and fixed the real cause of "Park %"/"KVS Healthy %" reading ' +
  'blank or always-0 across the Scoreboard, Shift Analysis, Leaderboards, and Store One Pager. ' +
  'Live-measured via Supabase: daily_glimpse_daily\'s parked_pct and kvs_healthy columns are 0 ' +
  'for literally every row ever ingested (783/783 in a 30-day sample, all-time max also 0), ' +
  'while sibling oepe/cashOSPct on the same rows carry real nonzero spreads. Root cause: ' +
  'parseDailyGlimpse (src/parsers/index.js) called parsePct(undefined)/parseNum(undefined) ' +
  'unconditionally, which both silently default to 0 when a header never matches any fc() ' +
  'candidate on the real report -- the same failure class dispatch #172 already fixed for ' +
  'cashOS. Because metric-source.js\'s park/kvsHealthy chains are mode:\'any\' (which accepts a ' +
  'literal 0 as a real answer, unlike mode:\'pos\'), that false 0 from glimpseRows permanently ' +
  'masked opsServiceRows\' real, auto-pulled, nonzero qsr_service_stats data (also live-' +
  'confirmed: dt_cars_held/healthy_cnt/unhealthy_cnt are real and nonzero in the same window) ' +
  'for every store, every day. Fixed parseDailyGlimpse to emit null (not 0) for parkedPct/kvst/ ' +
  'kvsItems/kvsHealthy when the column itself is absent, while a genuinely blank cell on a ' +
  'present column still parses as a real 0.',
  'Three more bypasses of metric-source.js\'s auto-first resolver, found during the same ' +
  'investigation: forecast.js\'s compute6wk() read kvsu straight off raw ds.opsRows instead of ' +
  'routing through the existing kvsHealthy chain (now uses metricAvg directly, preserving the ' +
  'null-vs-zero distinction computeOpsScore\'s presence check needs); analytics.js\'s Store One ' +
  'Pager read FOB % off ds.ctrlRows with a stale "no auto chain yet" comment (dispatch #104 ' +
  'added one months ago) instead of the real fobPct chain; store-analytics.js\'s Shift Analysis ' +
  'DOW table read oepe/kvst/park/r2p/kvsu off raw ds.opsRows, a straggler the 2026-09-07 auto-' +
  'first sweep converted every other field in this same table but missed. All four now go ' +
  'through metricSeries/metricAvg like their sibling fields.',
  'Also wired Store One Pager\'s Avg Check row to its real DEFAULT_TARGETS.tAvgCheck target ' +
  '(was hardcoded null despite the target existing for every store). Daily Sales and Guest ' +
  'Count targets have no equivalent field in DEFAULT_TARGETS at all yet -- flagged for the ' +
  'owner rather than invented.',
  'Food Cost\'s Day-by-Day Variance chart (store-cockpit.js): gated the "Biggest jump" callout ' +
  'at >=$25, matching the threshold eom-dashboard.js\'s own VarianceTraceChart callout already ' +
  'uses, so a trivial swing in a quiet period no longer gets flagged with the same critical-red ' +
  'styling as a real jump.',
  'Lowered two ratchet-test ceilings (raw ds.opsRows/ctrlRows/laborRows reads: 143->141; raw ' +
  '.getDay() calls: 56->55) to match the real reduction from these fixes.',
]};
