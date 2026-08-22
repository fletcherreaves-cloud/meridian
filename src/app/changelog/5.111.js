// @ts-nocheck
export default {version:'5.111', date:'2026-08-22', changes:[
  'Dispatch #72 -- no-undef triage, all 25 (+3) sites fixed. #563 added a no-undef guard over '
  + 'scripts/ after rawWaste sat undefined for two days; running the same check over src/ found '
  + '25 more sites across 9 files. Sequenced exactly as prescribed -- Class A (unconditional '
  + 'throw) first, then B (short-circuit-guarded), then C (needs a caller read), only THEN '
  + 'widen the guard -- each fix carrying its own revert-sensitive test (stash the fix, confirm '
  + 'the ORIGINAL error reproduces, restore). Worst of the four Class A sites: OrgView '
  + '(store-dash.js, the Patch/Org nav view) read a sibling function\'s local unconditionally -- '
  + 'a ReferenceError on every render, both nav views, every tab. App.js\'s "Escape always '
  + 'closes every modal" hatch threw on its SECOND statement (setShowDev, which never existed), '
  + 'silently aborting ~70 of its own setters on every single press -- Escape was effectively '
  + 'broken for nearly everything, not just those two. An async lookupMissEvent free variable '
  + "turned into a silently-rejected promise a fire-and-forget onClick never observed, so the "
  + '"AI Lookup" button quietly did nothing.\n\n'
  + 'Widening the src/** no-undef guard (now permanent CI, mirroring the scripts/ one) surfaced '
  + '3 more sites the original 25-site sweep missed: a "Pack" button calling an unexported '
  + 'function, a stale model-assignment cache never invalidated on "clear override," and '
  + "StoreDash's auto-calibration silently never persisting an improved MAPE -- App.js's real "
  + 'saveSettings existed but never crossed the component\'s prop boundary (same engine-vs-wiring '
  + 'shape as dispatch16\'s #366: caught only by a full render test with calibrateStore mocked, '
  + 'since a static check can\'t tell "threaded end-to-end" from "the call site forgot to pass '
  + 'it"). Full writeup, all 28 fixes individually documented, in memory/dispatch-72-triage.md.\n\n'
  + "Dispatch #73 -- Visit Patterns' overdue amber fired on 87% of normal visits. The flat "
  + 'daysSinceLast > 60 was never measured: on 190 real CFV inter-visit intervals (all 27 '
  + 'stores, 2023-01..2026-08) it fired on 166/190 (87.4%) -- a store perfectly on cadence sat '
  + 'amber permanently, and pooling CFV/EcoSure/RGR (very different program cadences) under one '
  + 'number via the panel\'s default "all types" filter made it worse. Fixed with a '
  + 'per-instrument threshold (EXPECTED_CADENCE_DAYS x 1.5: CFV=182d, EcoSure=273d, RGR=548d -- '
  + 'from the owner\'s stated 3/2/1 visits-per-store-per-year, NOT the measured 138d median, '
  + "which would have re-encoded today's lateness as the new normal) resolved from each store's "
  + "own last-visit type, so the mixed-'all' default view is correct per row with no separate "
  + 'suppress-when-mixed branch needed. The "don\'t flag new stores" requirement needed no '
  + "separate code path either -- Ponce de Leon's and Tishomingo's real open dates (found in "
  + 'existing code, not invented) confirmed the recalibrated threshold alone stops the false '
  + 'flag the owner almost escalated. Labeled what amber means in the panel. Revert-sensitive '
  + 'render test with real store fixtures straddling the new threshold -- reverting the panel\'s '
  + 'condition alone reproduces the exact false positive measured. Full writeup in '
  + 'memory/dispatch-73.md.\n\n'
  + '9 new test files, 17 new tests total across both dispatches. 188/188 test files, '
  + '2064/2064 tests, build clean, entry-eager payload 516.95 KB gzipped (budget 850 KB, '
  + '333 KB headroom, no meaningful change from this PR).',
]};
