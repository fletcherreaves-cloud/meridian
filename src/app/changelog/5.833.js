// @ts-nocheck
export default {version:'5.833', date:'2026-11-20', changes:[
  '**LifeLenz pulls: added the SignIn fallback to the 5 scripts that were missing it.** ' +
  '`lifelenz-schedule-variance-pull.mjs`/`lifelenz-attendance-pull.mjs`/' +
  '`lifelenz-compliance-audit-pull.mjs`/`lifelenz-payroll-readiness-pull.mjs`/' +
  '`lifelenz-employee-performance-pull.mjs` previously hard-required `LIFELENZ_TOKEN` with no ' +
  'fallback at all, so they went dark for days every time the token expired (confirmed live: ' +
  'all 5 failing since 2026-11-16 ~20:00 UTC, "Session expired" on every report) while ' +
  '`lifelenz-pull.mjs`/`lifelenz-dar-pull.mjs` kept running because they already fall back to ' +
  'a direct GraphQL SignIn mutation — no Playwright needed, LifeLenz\'s own SPA authenticates ' +
  'this way. That fallback is now extracted to `scripts/lib/lifelenz-auth.mjs` ' +
  '(`resolveLifelenzToken()`) and wired into all 5, with `LIFELENZ_USERNAME`/`LIFELENZ_PASSWORD` ' +
  'added to each workflow\'s env block (secrets already existed, just weren\'t passed through). ' +
  '6 new tests (`src/__tests__/lifelenz-auth.test.js`) pin the validate → fall back → throw ' +
  'sequence against a mocked fetch.',
]};
