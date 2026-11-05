// @ts-nocheck
export default {version:'5.638', date:'2026-11-05', changes:[
  '**Fix: "🎯 Actuals vs Target" pace widget could silently drift to a different month than the ' +
  'page\'s own month dropdown (owner-caught live).** `CurrentMonthPaceSection` (Monthly ' +
  'Projections) renders its own independent `‹ monthLbl ›` stepper, a separate control from the ' +
  'page-level month `<select>` above it — a prior click on this widget\'s own stepper left its ' +
  '`offset` state non-zero, and that offset then kept compounding ADDITIVELY with the page\'s ' +
  'period (period = base + offset) on every later dropdown change instead of resetting, instead ' +
  'of snapping back to exactly the page\'s selected month. Owner saw the page dropdown read "Oct ' +
  '2026" while this widget read "November 2026" simultaneously. Fixed: the stepper\'s offset now ' +
  'resets to 0 the instant the page-level period prop actually changes, so the dropdown is always ' +
  'the ground truth this widget resyncs to — "changing the dropdown resolves it" (the owner\'s own ' +
  'observation) is now guaranteed behavior, not a coincidence of the exact click sequence. New ' +
  'regression test reproduces the exact drift (click next-month stepper, then change the page ' +
  'period to a different month, assert the widget shows exactly that month, not stepper-offset-' +
  'plus-that-month). 734/734 test files, 6673/6673 tests; build clean.',
]};
