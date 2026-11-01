// @ts-nocheck
export default {version:'5.595', date:'2026-11-01', changes:[
  '**"Today\'s Movers" strip (Home panel) now shows the TIME of its most recent data, not just ' +
  'the date.** Owner req, from a screenshot: "can we simply add time of the most recent data for ' +
  'that as well." Measured live against qsr_daily_activity_rollup (the DAR rollup table this ' +
  'strip reads): it carries a real refreshed_at timestamptz, written by the pull script on every ' +
  'run -- a current row read 2026-11-01T19:17:05Z, matching the ~2pm CT intraday DAR slot. The ' +
  'strip now reads "sales & DT speed · as of Nov 1 · updated 2:17 PM" instead of just the date.',
  'The hourly-fallback table (qsr_daily_activity, used only when the rollup table is ' +
  'unreachable) has no such column (confirmed live) -- a row from that path simply carries no ' +
  'time and the strip falls back to date-only, exactly as before this change. Also added to the ' +
  'print/export version of the same tile.',
  '3 new tests (dispatch-movers-strip-refreshed-at-2026-11-01.test.js), rendering the real ' +
  'AtAGlance Movers strip, not just the underlying computation.',
]};
