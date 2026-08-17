// @ts-nocheck
export default {version:'4.907', date:'2026-08-08', changes:[
  'Fixed a date bug that shifted any text-form date back one day (a date string is read as UTC midnight but displayed in local time). It builds the index key for every store-and-day lookup in the app, so a cached row could sit one day off from where everything else looked for it.',
  'New stores are now reported honestly. Ponce de Leon showed a window starting in April 2027, which read like corruption but was arithmetic — it opened in March 2026 and Dialed-In needs a full year of history. It now says so plainly and no longer counts as a failure.',
]};
