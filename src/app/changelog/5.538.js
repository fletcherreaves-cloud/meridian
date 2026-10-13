// @ts-nocheck
export default {version:'5.538', date:'2026-10-13', changes:[
  'Added Record Hour\'s quarter-hour sales stream to scheduled-pull-watchdog.mjs\'s coverage ' +
  'after a real, measured incident: this workflow\'s very first scheduled cron opportunity ' +
  '(10:00 UTC today) silently never fired -- confirmed live via the GitHub Actions API (zero ' +
  '`event:"schedule"` runs in its entire history, while several off-the-hour workflows fired ' +
  'fine the same morning; its sibling qsrsoft-dar-pull.yml, sharing the identical 0 10 * * * ' +
  'cron, missed its own 08:00 and 10:00 UTC slots too). This is exactly the "should have run ' +
  'by now, silently didn\'t" failure mode scheduled-pull-watchdog.mjs exists to catch, but it ' +
  'had no retrigger safety net for this stream since checkStream() requires a STREAMS entry ' +
  'to find a stream\'s label/cadence at all.',
  'Added `{ key:\'qsrSalesQtrHour\', ... }` to stream-freshness.js\'s STREAMS and a matching ' +
  'scheduled-pull-registry.mjs entry. Also corrected that file\'s own prior comment (and ' +
  'metric-source.js\'s, and memory/finding-record-hour-quarter-hour-pull.md\'s) which had ' +
  'argued against this: traced streamFreshness()\'s guard directly and confirmed ds[src] is ' +
  'never initialized to [] -- it stays undefined until the lazy-fill loader resolves -- so the ' +
  'guard already treats "not yet loaded this session" as "no verdict," never "stale." The ' +
  'original claim that adding this stream would misread every user who hasn\'t opened Record ' +
  'Hour as a broken stream was an unverified extrapolation from a sibling stream\'s precedent, ' +
  'not a measurement -- never actually true of the real guard.',
]};
