// @ts-nocheck
export default {version:'5.637', date:'2026-11-05', changes:[
  '**Fix: At-A-Glance showed a stray "0" above the Action Checklist (owner-caught live).** ' +
  'The "Today\'s Movers" strip gated itself on `(moversStrip.up.length||moversStrip.down.' +
  'length||moversStrip.slowDT.length)&&div(...)` — the classic React falsy-render bug: when ' +
  'all three arrays are empty, `0||0||0` evaluates to the number `0`, not `false`, so the ' +
  'whole expression\'s VALUE is `0` and React renders that literal digit as text instead of ' +
  'skipping the strip. Two nested occurrences inside the same strip (`Sales vs LY`/`Slowest ' +
  'DT` labels) had the identical bug. Fixed all three to explicit `.length>0` comparisons, ' +
  'matching the `>0` convention already used correctly elsewhere on this same page (`Action ' +
  'Checklist`\'s own `allActiveItems.length>0&&...`). Swept the rest of `src/views`/`src/' +
  'features` for the same bare `.length&&<element>(` pattern — the 5 other hits found are all ' +
  'negated (`!x.length&&...`), which is always a real boolean and not affected. 733/733 test ' +
  'files, 6672/6672 tests; build clean. Live-verified in the browser.',
]};
