// @ts-nocheck
export default {version:'5.299', date:'2026-09-01', changes:[
  'Second piece of today\'s weekly-count automation (owner req, verbatim): "we have the days of ' +
  'week that each store counts. Let\'s pull data for those days between 8am and 5pm, hourly to ' +
  'start." scripts/qsrsoft-onhand-pull.mjs gains a new runMode() branch, \'weekly-count-day\': ' +
  'outside the existing EOM last-3-days window, on any ordinary day between 8am-5pm CT, it pulls ' +
  'ONLY the handful of stores whose detectWeeklyCountDay()-derived count day is today -- not all ' +
  '27 every hour. No cron/schedule change needed -- the workflow already fires every 30 minutes ' +
  'year-round; the script\'s own gate has always been the sole authority on whether a landed run ' +
  'does real work, and this just adds one more thing that gate checks for.',
  'Deliberately does NOT fall back to pulling all 27 stores when detection has nothing to go on ' +
  '(a data gap, or no store matches today) -- the ask was explicitly a narrow, "to start" pull, ' +
  'and widening to everyone on a gap would be the opposite of that; the existing count-window and ' +
  'daily-progress-snapshot modes already cover every store on their own schedules regardless.',
  'Added centralWeekday() to scripts/lib/count-window.mjs (0=Sun..6=Sat for the Central TIME ZONE ' +
  'calendar date, DST-safe -- computes the CT date first, then asks its weekday, so a late-night ' +
  'UTC instant that has already rolled to the next UTC day still reads as the correct PRIOR ' +
  'Central calendar day). Full test coverage: the new runMode() branch and its priority against ' +
  'the existing EOM window, recentPeriodKeys() (the trailing-period list ' +
  'detectWeeklyCountDay() needs), and centralWeekday() itself including the midnight-rollover case.',
]};
