// @ts-nocheck
export default {version:'5.544', date:'2026-10-13', changes:[
  'Weekly Count Status -- "whatever date is selected, it resolves to the data for that ' +
  'calendar week" (owner-requested, mass-review notes 70). Picking a single date used to feed ' +
  'the overdue math directly, so two people clicking different days of the SAME week could see ' +
  'different results for a report whose whole point is "did this week\'s count happen." The ' +
  'date picker now resolves whatever is clicked to that date\'s containing calendar week (via ' +
  'the one shared weekStartOf() helper, honoring settings.weekStartDay -- never hand-rolled day ' +
  'arithmetic), anchored to the week\'s last day so any day within it agrees, clamped to today ' +
  'for the current, still-in-progress week so it never reads as "overdue" for days that ' +
  'haven\'t happened yet. The header now shows "Week of ..." so the resolved scope is explicit.',
  'Weekly Count Status -- added drill-down for New/Stale item findings. The item list used to ' +
  'be reachable only via a browser-native hover tooltip -- invisible on print, a screenshot, or ' +
  'touch. The New/Stale badges are now buttons that toggle a real inline detail row listing the ' +
  'full item list.',
]};
