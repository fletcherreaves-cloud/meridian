// @ts-nocheck
export default {version:'5.534', date:'2026-10-12', changes:[
  '⚠ SUPERSEDES v5.532/v5.533\'s "Record Hour" clock-hour approximation and its same-day index ' +
  'follow-on (both merged while this branch was in flight, a parallel session) -- v5.532\'s own ' +
  'commit message tracked a real quarter-hour pull "as a separate follow-on," which is exactly ' +
  'this. Replaces it in place (same "🕐 Record Hour" tab, same slot in RecordDayTab\'s TABS): ' +
  'removes computeHourRecords(rows)/RecordHourTab/RecordHourCell/fHourRange/' +
  'loadHourlySalesRecords(), the qsr_hourly_sales_records view, and its companion index + both ' +
  'approximation PRs\' 7 tests, since a real 15-minute rolling window makes the clock-hour ' +
  'approximation it stood in for obsolete -- not kept alongside it as a second tab. Owner call, ' +
  'asked explicitly given it meant removing another session\'s just-shipped, owner-verified-live ' +
  'code. This repo\'s own version counter collided twice in under 15 minutes from two sessions ' +
  'building the same feature in parallel -- renumbered 5.532 -> 5.533 -> 5.534 as each collision ' +
  'surfaced on push, not a sign of anything wrong with either session\'s work.',
  'Record Hour in Sales: the real sliding-window fix. A prior pass found NO 15-minute-' +
  'granularity sales data anywhere in Meridian (confirmed via a whole-repo grep) -- ' +
  'qsr_daily_activity is genuinely hourly despite its endQtrHourTime field name. This closes ' +
  'that gap with a new automated pull (scripts/qsrsoft-sales-quarter-hour-pull.mjs) that ' +
  'requests the SAME endpoint qsrsoft-dar-pull.mjs already drives, with segmentBy/timeInterval ' +
  '=quarterHour instead of hour, into a new qsr_sales_quarter_hour table (tenant_id + RLS, ' +
  'pattern matches schema-product-mix.sql). Deliberately NOT sourced from Product Mix\'s item-' +
  'level quarter-hour segmentation -- memory/qsrsoft-report-catalog.md flags that as enormous ' +
  'volume; this pulls the already-aggregated sales total per bucket instead (projected ~2,592 ' +
  'rows/day across 27 stores, not yet live-measured -- no QSRSoft credentials in this sandbox).',
  'src/engine/record-hour.js computes a genuine sliding-window maximum over 4 consecutive ' +
  'quarter-hour buckets (any 15-minute-aligned start counts, e.g. 7:15am-8:15am == 7:00am-' +
  '8:00am -- the owner\'s own framing), requiring true 15-minute contiguity so a gap in the data ' +
  'can never be bridged into a fake 60-minute window. Reuses labor-standard.js\'s daypartOf() for ' +
  'the breakfast/lunch/afternoon/dinner/late-night cut and the same same-day PROVISIONAL-vs-' +
  'confirmed completeness gate record-day.js\'s computeRecords already established (dispatch ' +
  '#103) -- today\'s still-accumulating business day can beat the all-time record on paper but ' +
  'never silently become it.',
  'New "🕐 Record Hour" tab inside the existing Record Days/Leaderboards hub (store-dash.js\'s ' +
  'LeaderboardPanel -> record-day.js\'s RecordDayTab), sharing its LocationSelector scope and ' +
  'Recent Breaks window control rather than a new standalone panel. ds.qsrSalesQtrHourRows is a ' +
  'metric-source.js LAZY_FILL_SOURCES entry (same consumer-triggered shape as pmixRows/' +
  'auditRows, with its own "since 2022" wide-fill tier) so it costs nothing for users who never ' +
  'open the tab. CSV/JSON export and the full district print report both cover it.',
  '13 engine unit tests (src/__tests__/record-hour.test.js) plus a render-level test through the ' +
  'real RecordDayTab (record-hour-tab-render.test.js, per this repo\'s "would this verification ' +
  'still pass if reverted?" rule). Watched in sync-failure-watch.yml; deliberately NOT added to ' +
  'stream-freshness.js\'s STREAMS array, matching the existing precedent that none of pmixRows/' +
  'auditRows/wasteRows are there either -- an unopened tab reading ds[field] as empty is not a ' +
  'stale-stream signal.',
  'UNVERIFIED AGAINST LIVE QSRSOFT: segmentBy/timeInterval=quarterHour is a reasoned ' +
  'extrapolation from the API\'s proven "hour" behavior and the endpoint\'s own endQtrHourTime ' +
  'field name, written without QSRSoft credentials available to test against. The pull script ' +
  'logs a loud diagnostic (distinct qtr_slot count) on its first live day specifically so that ' +
  'run is the real measurement -- check the Action log after this first deploys before trusting ' +
  'Record Hour\'s numbers. See memory/finding-record-hour-quarter-hour-pull.md.',
]};
