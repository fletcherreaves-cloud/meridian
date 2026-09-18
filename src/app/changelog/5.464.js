// @ts-nocheck
export default {version:'5.464', date:'2026-09-18', changes:[
  'Pipeline contract (R8): qsrsoft-ebos-pull.mjs now imports scripts/_pipeline-contract.mjs, ' +
  'same as qsrsoft-dar-pull.mjs and lifelenz-pull.mjs before it. Added checkFreshness() in ' +
  'main() (30h warn / 54h error, matching dar-pull\'s own thresholds) and unconditional ' +
  'per-store logPartitionCoverage() on BOTH the token-fetch path (direct token / SSO-exchange) ' +
  'and the Playwright-fallback path -- a store that returned 200 with zero purchase-record line ' +
  'items in the window previously had no visibility at all (makeOutcomeTracker only logs ' +
  'stores that threw, not ones that silently came back empty).',
  'Opportunistic conversion per R8\'s own "convert one at a time, never as a sweep" scope note -- ' +
  '17 named pull/write scripts remain unconverted (ratchet-pipeline-contract-coverage.test.js\'s ' +
  'CEILING lowered 18 -> 17).',
  'Full suite 527/527 files, 5033/5033 tests. Build clean, eager payload 551.26 KB gzip (budget ' +
  '850 KB).',
]};
