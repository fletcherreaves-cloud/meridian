// @ts-nocheck
export default {version:'5.619', date:'2026-11-04', changes:[
  '**Smart Targets: expanded lookback period options (owner-requested, "give more pre-defined ' +
  'options as well as a custom option").** The "current" reading every Trend Target is built ' +
  'from used to be a fixed 6W-then-12W/26W/52W cascade with no way to pick a window. New ' +
  'Lookback row in the Smart Target Engine: 2W/4W/6W/13W (Qtr)/26W (6mo)/52W (1yr)/104W (2yr) ' +
  'presets plus a Custom option (1-260 weeks) -- selecting one recomputes every metric\'s current ' +
  'reading, proposed monthly step, and proposed yearly target from that exact window, falling ' +
  'back to the original cascade only if the chosen window itself has no data for a store. ' +
  '"6W (default)" reproduces the original behavior exactly -- nothing changes for anyone who ' +
  'doesn\'t touch the control. The detail panel shows the selected window\'s own average as a ' +
  'stat tile alongside the existing 6W/12W reference averages. Also fixed, found while touching ' +
  'these exact lines: the detail panel\'s stat-tile labels were rendering the literal text "lbl" ' +
  'instead of each tile\'s real label ("6W Avg", "12W Avg", etc.) -- a one-character bug, now ' +
  'showing the real labels. 5 new tests ' +
  '(src/__tests__/dispatch-smart-targets-lookback-2026-11-04.test.js) cover the regression-safe ' +
  'default, a custom window actually overriding the cascade, the fixed 104-week row-inclusion ' +
  'ceiling widening to cover a longer custom window, and the cascade fallback when a chosen ' +
  'window has no data of its own. 716/716 test files, 6586/6586 tests; build clean.',
]};
