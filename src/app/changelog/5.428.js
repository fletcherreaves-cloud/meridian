// @ts-nocheck
export default {version:'5.428', date:'2026-09-11', changes:[
  'MBI vs LifeLenz Accuracy (Accuracy tab): per-date winner badge -- owner request, ' +
  '"let\'s maybe award a winner to each date with a badge or something." Whichever side ' +
  '(LifeLenz or Meridian/MBI) has the smaller |variance| against the same actual for a ' +
  'given date now gets a 🏆 next to its Var% cell -- same badge convention already ' +
  'used elsewhere in the app (labor-tools.js\'s "Peak GC" marker). Awarded only when both ' +
  'sides have a real, plausible number for that date (a dispatch #117 implausible-actual ' +
  'day never wins or loses, same as its existing "-" treatment); exactly one side badged ' +
  'per date, never both, never on a tie.',
  '2 new tests rendering the real LifeLenzBridgePanel Accuracy table (not the win/lose ' +
  'logic in isolation): confirms the trophy lands on the correct side for two dates with ' +
  'opposite winners, and confirms no trophy renders when one side has no data at all.',
  'Full suite 4747/4747, build clean, 541.48 KB / 850 KB eager-payload budget.',
]};
