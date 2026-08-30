// @ts-nocheck
export default {version:'5.263', date:'2026-08-30', changes:[
  'Dispatch #222 -- Fixes GitHub issue #299: FOB Analysis Root-Cause Priority Matrix claims to ' +
  'exclude Base Food, doesn\'t. The panel\'s own subtitle promises "Excludes Base Food (largely ' +
  'outside store control). Fix these first to close FOB fastest" -- but a live example in the ' +
  'issue showed Base Food ranked #1, #3, and #5 in the top-8 coaching list, exactly the item the ' +
  'panel claims to filter out.' +
  '\n\n' +
  'Root cause, verified fresh against current code before fixing: src/views/analytics.js\'s ' +
  'FOB_COMP array (the shared metric registry the Root-Cause Priority Matrix, its status badges, ' +
  'and the Contributors table all read from) has an `actionable` property that two places check ' +
  '-- rootCauseItems\' ranking filter (`c.lower&&c.actionable!==false&&...`) and statusInfo\'s ' +
  '"— Reference" badge branch (`c.actionable===false`) -- but no FOB_COMP entry ever SET ' +
  '`actionable`, so both checks were permanent no-ops: `undefined!==false` is always true, and ' +
  '`undefined===false` is always false. Base Food ranked and badged exactly like every genuinely ' +
  'actionable component.' +
  '\n\n' +
  'Fix: one line. Added `actionable:false` to the baseFoodPct entry in FOB_COMP. That single flag ' +
  'activates both existing (previously dead) checks at once -- no other code changed.' +
  '\n\n' +
  'Checked the issue\'s own aside before trusting it: does discCoupon (lower:false) need the same ' +
  'treatment? No -- rootCauseItems\' guard is `c.lower&&...`, so a falsy `lower` already drops ' +
  'discCoupon from the ranking before `actionable` is ever consulted. Confirmed directly against ' +
  'the live FOB_COMP entry in the new guard tests below, not just asserted.' +
  '\n\n' +
  'New file src/__tests__/dispatch-222-fob-basefood-exclusion.test.js (6 tests): FOB_COMP.baseFoodPct ' +
  '.actionable===false; discCoupon\'s lower:false independently excludes it (and it did NOT pick ' +
  'up actionable:false); no other FOB_COMP entry was touched; and two tests that render the REAL ' +
  'FOBAnalysisPanel component with a fixture where Base Food\'s dollar impact (~$32,000) would ' +
  'otherwise dwarf and outrank a second, genuinely-actionable Completed Waste breach (~$1,600) -- ' +
  'confirming the actual rootCauseItems filter now excludes Base Food from the rendered matrix ' +
  'while Completed Waste still surfaces, and the actual statusInfo/statusBadge functions render ' +
  '"— Reference" for the Base Food row (not Over/Watch/OK) while Completed Waste keeps its normal ' +
  'badge. Exercises the real consumer functions through the rendered component, not a ' +
  'reimplementation of the filter/badge branching. FOB_COMP is now also exported from analytics.js ' +
  '(was module-private) so the guard tests can assert the property directly.' +
  '\n\n' +
  'Confirmed src/__tests__/dispatch-129-fob-print.test.js (the one existing test touching this ' +
  'badge logic) still passes and does not encode the old buggy behavior: its fixture\'s ' +
  'baseFoodPct (0.04) never actually breached any of its 5 stores\' own tFOBBase targets by more ' +
  'than the 0.005 threshold (diffs of 0, -0.001, 0.002, 0, 0), so Base Food was never appearing ' +
  'in that fixture\'s ranked matrix regardless of this fix -- verified by running the full suite ' +
  'both before and after the fix (with the fix reverted, all 5 fix-dependent new tests correctly ' +
  'go red; dispatch-129\'s existing 6 tests are unaffected either way).' +
  '\n\n' +
  'Full test suite: 3398/3398 passing across 328 files. Build clean; eager payload 526.87 KB ' +
  'gzipped (budget 850 KB, 323.13 KB headroom) -- unchanged in shape (one FOB_COMP export + one ' +
  'data-flag addition, no new dependency, no new eager import).'
]};
