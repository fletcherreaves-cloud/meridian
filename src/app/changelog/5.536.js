// @ts-nocheck
export default {version:'5.536', date:'2026-10-12', changes:[
  'Fixed Record Hour\'s quarter-hour pull (scripts/qsrsoft-sales-quarter-hour-pull.mjs, v5.534): ' +
  'its first-ever manually-triggered run failed every single date with a real QSRSoft HTTP 400 -- ' +
  '"segmentBy" must be one of [summary, daypart, peaks, timeSlice, qtr, hour]. The script shipped ' +
  'with segmentBy/timeInterval=\'quarterHour\', a reasoned-but-wrong guess (no QSRSoft credentials ' +
  'were available to test against when it was written). The API\'s own error names the real enum ' +
  'value, \'qtr\' -- corrected both parameters to match, mirroring qsrsoft-dar-pull.mjs\'s own ' +
  'proven segmentBy===timeInterval===\'hour\' pairing exactly rather than guessing a second time.',
  'Not yet re-verified that \'qtr\' itself returns true 15-minute granularity (>24 distinct slots/ ' +
  'store/day) -- the pull script\'s own first-day diagnostic still checks this on every fresh run, ' +
  'so a second wrong value cannot ship silently either. Check the next run\'s log before trusting ' +
  'any Record Hour number.',
]};
