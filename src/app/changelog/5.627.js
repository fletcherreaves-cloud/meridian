// @ts-nocheck
export default {version:'5.627', date:'2026-11-04', changes:[
  '**Fix: intermittent CI EnvironmentTeardownError on the verify job, root-caused and fixed (not ' +
  'just re-run).** App.js\'s AtAGlance chunk prefetch (`_ataglance()`, fired unawaited at module-' +
  'eval time, deliberately, for perceived performance) re-fires every time a test file imports ' +
  'App.js. A fast, synchronous test file can finish and tear down its happy-dom environment ' +
  'before that one in-flight import() settles, surfacing as "Cannot load weekly-cadence.js... ' +
  'after the environment was torn down" — hit twice in one day on two unrelated PRs, always the ' +
  'same test file, always cleared by a bare re-run. Guarded with ' +
  '`if (import.meta.env.MODE !== \'test\') _ataglance();` — MODE, not process.env.VITEST, since ' +
  'this is Vite-bundled browser code with no process polyfill in the shipped build. Real builds ' +
  'unaffected (MODE is never \'test\' outside Vitest). Full suite: 727/727 test files, ' +
  '6648/6648 tests; build clean.',
]};
