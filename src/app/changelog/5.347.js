// @ts-nocheck
export default {version:'5.347', date:'2026-09-04', changes:[
  'Fixed a live crash: the Signals → Store Controls tab hit React error #310 (hook-count ' +
  'mismatch) and fell into its error boundary instead of rendering, reported by the owner from a ' +
  'phone screenshot.',
  'Root cause: StoreControlsTab called a useMemo (district-mode "modes") AFTER three early ' +
  'return statements. The component always renders once in the "raw === null" loading state ' +
  'first (hitting the early return before that hook), then again once data loads (sailing past ' +
  'the early returns and calling it) -- a different hook count between renders, which React ' +
  'refuses to reconcile. Pre-existing since the tab shipped (v5.328/v5.330), not introduced by ' +
  'anything landed today.',
  'Fix: hoisted the modes hook above the early returns, matching the pattern every other ' +
  'early-return component in signals.js already follows correctly.',
  'New render-based regression test (dispatch-store-controls-tab-hook-order.test.js) mounts the ' +
  'real component (react-dom/client) and actually crosses the loading->loaded transition -- a ' +
  'static-markup test of either state in isolation could not have caught this, since each render ' +
  'is valid JSX on its own. Verified the test fails on the pre-fix code and passes on the fix.',
  '4348 tests pass (451 files, +1 new), build clean, eager-payload budget unaffected.',
]};
