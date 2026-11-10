// @ts-nocheck
export default {version:'5.727', date:'2026-11-10', changes:[
  '**📅 New panel: YoY Trends (task #90).** A real year-over-year TREND — this year\'s monthly '+
  'trajectory overlaid against 2-4 prior years, calendar-month matched (September vs. last '+
  'September, never a 364-day/weekday-shifted comparison) — for any `PERFORMER_METRICS` key '+
  'across any All/State/Patch/Store scope. Confirmed a genuine gap first: audited Performance '+
  'Trends (sequential period-over-period), Trend Explorer (single-store exploratory) and '+
  'vs-ly.js (one aggregate number) — none of them plot a multi-period year-over-year line. '+
  'New engine `src/engine/yoy-trend.js` (calendar-accurate monthly buckets, Σnum/Σden rollup for '+
  'ratio metrics read straight off metric-source.js so it can\'t disagree with it, and a '+
  'young-store honeymoon-ramp exclusion generalized from vs-ly.js\'s own lyQuality). Chart.js '+
  'line overlay + month-by-month actual/LY/Δ% table, exportable via the house ExportDropdown. '+
  'Cross-linked info icons on all three trend panels (Performance Trends gets its first-ever '+
  'InfoIcon in this same pass) so a user lands on the right one regardless of which they open '+
  'first. `kind:\'test-kitchen\'`, real `section:\'analytics\'` from day one, `route:true`.',
  '**Caught and fixed before shipping:** fetching exactly the display window\'s depth of history '+
  'made every store look like it opened on day one of that window, flooding the honeymoon-ramp '+
  'guard with false positives — `yoyFetchDaysBack()` fetches enough buffer ahead of the oldest '+
  'displayed year to tell a genuinely young store (verified against the real, documented '+
  'Tishomingo case) from a long-established one (verified against a real store with 6+ years of '+
  'history). Both the calendar-month math and this fix were verified against live production '+
  'data (service-role, qsr_daily_activity_rollup) before shipping, not reasoned about.',
  '**3 open questions, defaulted per the design doc\'s own lean (owner traveling, easily '+
  'reconfigured):** metric registry = `PERFORMER_METRICS`; default trailing window = 3 years '+
  '(current + 2 prior); default metric = Sales.',
]};
