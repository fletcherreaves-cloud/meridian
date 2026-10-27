// @ts-nocheck
export default {version:'5.587', date:'2026-10-27', changes:[
  '**Fixed a real, live eBOS auth bug: a stale `QSRSOFT_EBOS_TOKEN` was accepted ' +
  'unconditionally, silently skipping the Playwright fallback that would have actually ' +
  'worked (issues #1555/#1554).** Confirmed from live job logs: `resolveEbosToken()` ' +
  '(`scripts/lib/ebos-auth.mjs`) treated "the env var is non-empty" as "this token still ' +
  'authenticates" -- since `QSRSOFT_EBOS_TOKEN` is a persistent GitHub Secret always present ' +
  'in CI, the moment SSO exchange started failing (HTTP 403, a separate ongoing issue not ' +
  'fixed here), every run fell straight to that unverified static token, died on the first ' +
  'real API call with AUTH_FAILED, and never reached Playwright at all -- even with ' +
  'QSRSOFT_USERNAME/PASSWORD correctly configured.',
  'Added an optional `verify` callback to `resolveEbosToken(verify)`: the caller\'s own cheap ' +
  'real probe (one lightweight request against the exact endpoint it is about to call 27 ' +
  'times) confirms each rung actually works before it is trusted -- a rung that fails ' +
  'verification is treated the same as one that returned no token, and the ladder continues ' +
  'to the next rung instead of handing back a token nobody checked. Omitting `verify` (every ' +
  'existing caller before this fix) preserves the exact old behavior -- purely additive.',
  'Wired the verify callback into `qsrsoft-onhand-pull.mjs`. Also found `qsrsoft-variance-pull.mjs` ' +
  'was still carrying its OWN duplicated ~115-line copy of this exact ladder with the exact same ' +
  'bug (it was in fact the original copy `ebos-auth.mjs` was extracted FROM, per that file\'s own ' +
  'header) -- migrated it onto the shared lib with the same verify wiring, same treatment ' +
  '`qsrsoft-onhand-pull.mjs` got under issue #1539.',
  '5 new tests cover the verify-retry behavior directly (SSO failing verification falls to the ' +
  'static token; the static token failing verification falls to Playwright; a throwing verify is ' +
  'treated as failed, not an unhandled rejection; back-compat with no verify callback at all). ' +
  'Full suite 663/663 files, 6161/6161 tests green. Build clean, unchanged (scripts/ only).',
]};
