// @ts-nocheck
export default {version:'5.548', date:'2026-10-13', changes:[
  'Date-Range Comprehensive Report -- fixed "Days" reading 2 for a single picked date (owner-' +
  'reported live, with a screenshot: same START and END date showed Days:2 for every store). ' +
  'The report built its range boundaries as `new Date(startDate+\'T00:00:00\')` / `new ' +
  'Date(endDate+\'T23:59:59\')`, parsed in the browser\'s LOCAL time -- but metric-source.js\'s ' +
  'day-bucketing re-derives each boundary\'s date KEY via `.toISOString()`, which is always UTC. ' +
  'In any negative-UTC-offset zone (every US timezone, i.e. every Meridian user), local ' +
  '23:59:59 on the picked day is UTC early-morning the NEXT day, so the end boundary\'s date-key ' +
  'came out one day later than intended -- silently widening a single-day pick into a 2-day ' +
  'window and pulling the following day\'s numbers into the report alongside it. Fixed by ' +
  'passing the plain date-only strings straight through with no Date-object construction at ' +
  'all, the same {s,e}-as-strings convention every other date-range control in this app already ' +
  'uses (components/PanelControls.js\'s DateRangeControl).',
]};
