// @ts-nocheck
export default {version:'5.465', date:'2026-09-18', changes:[
  'SAGE: system prompt now reports business-day-aware "Today," not calendar-day. ' +
  'buildSystemPrompt() built its "Today:" line from new Date().toISOString() -- so between ' +
  'midnight and 4am, SAGE would tell the owner "today" was a business day that, by CLAUDE.md\'s ' +
  'own "business day runs 4am -> 4am" standing rule, had not started yet, and would then pass ' +
  'that wrong date as the actual argument to its own query_* tools whenever asked about ' +
  '"today." Fixed to businessDate() (utils/date.js), the same shared ABC-cutover helper every ' +
  'other "today" in the app already uses -- not re-derived inline.',
  'Added an explicit BUSINESS DAY line to the prompt explaining the 4:00am -> 4:00am boundary, ' +
  'so SAGE reasons correctly about early-morning-hour questions instead of assuming a midnight ' +
  'cutover. Server-side (sage-chat/index.ts) tool-date defaults still use calendar-day UTC -- ' +
  'left untouched this pass since a correct fix there also needs a real America/Chicago ' +
  'timezone conversion (the edge function runs in UTC, not the store\'s local time), a separate ' +
  'and riskier change; SAGE now explicitly passes the correct business-day date whenever a ' +
  'question names "today," which covers the common case.',
  '3 new tests (fake-timer 2am/5am boundary cases + a prose check for the BUSINESS DAY ' +
  'explanation) against the real exported buildSystemPrompt() -- would fail on a revert to the ' +
  'old calendar-day code. Full suite 528/528 files, 5036/5036 tests. Build clean, eager payload ' +
  '551.27 KB gzip (budget 850 KB).',
]};
