// @ts-nocheck
export default {version:'5.635', date:'2026-11-05', changes:[
  '**Leaderboards: custom date range + a Panel Guide info icon pointing to Performance Trends ' +
  '(owner req).** Rankings and Top/Bottom modes\' preset date/window pills (Today/Yest/LW/L2W/' +
  'MTD/L4W/L6W and LW/L4W/L6W/MTD respectively) each got a **Custom…** option — two date ' +
  'inputs + Apply, reusing `components/PanelControls.js`\'s existing `isValidCustomRange` ' +
  'validator rather than a new one. A Custom range still collapses the whole picked span into ' +
  'one ranked total, same as every preset — Record Days keeps no window control at all (it\'s ' +
  'an all-time scan, never had one). Added a ⓘ info icon next to the Leaderboards subtitle ' +
  '(reusing the existing shared `InfoIcon`/Knowledge Base mechanism, not a new widget) with a ' +
  'new `leaderboards_guide` KB article explaining the three modes and pointing a Custom range ' +
  'spanning more than one natural period at **Performance Trends** (Current MTD / Last ' +
  'complete month / Two months back, period-by-period alongside the rolled-up total) instead of ' +
  'building a redundant period breakdown into Leaderboards itself. Live-verified in the browser ' +
  '(both modes\' Custom range apply correctly and the info popup opens with the right content). ' +
  '732/732 test files, 6668/6668 tests; build clean, 616.72 KB / 850 KB eager payload.',
]};
