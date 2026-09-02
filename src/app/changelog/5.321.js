// @ts-nocheck
export default {version:'5.321', date:'2026-09-02', changes:[
  'Fixed #156: monthly-target startup hydration was device-cache-first, backwards from ' +
  'CLAUDE.md\'s cloud-first architecture rule. App.js\'s _stMonthlyTargets effect built ' +
  'ds.monthlyTargets by spreading the freshly-loaded CLOUD data first, then prev.monthlyTargets ' +
  '(device-local IDB cache, or {} on a fresh device) on top of it -- so a stale device cache ' +
  'silently beat a corrected cloud value for any store present in both. Not deliberate ' +
  '(memory/project-scoring-revisit.md traced the write path: saveMonthlyTargets/' +
  'loadAllMonthlyTargets already round-trip correctly both ways -- this was only ever a ' +
  'precedence bug). Inverted the spread order so cloud wins per store; a store the cloud fetch ' +
  'hasn\'t reached yet still falls back to the device cache instead of disappearing.',
  '5 new regression tests (dispatch-156-monthly-targets-cloud-precedence.test.js) reading ' +
  'App.js\'s actual source text (not a hand-copied re-implementation) so a revert of the real ' +
  'fix fails the test, per this repo\'s "would this verification still pass if reverted" rule -- ' +
  'plus functional coverage of cloud-wins-on-overlap, device-cache-preserved-when-cloud-is-' +
  'missing-that-store, and an empty cloud response never wiping the device cache. Full suite ' +
  '(3709 tests) and build both clean.',
]};
