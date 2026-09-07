// @ts-nocheck
export default {version:'5.387', date:'2026-09-06', changes:[
  'Dev infra: added the app\'s first E2E test suite (Playwright, e2e/smoke.spec.js) -- 2 smoke ' +
  'tests: the app shell boots without a fatal error/console error, and the real nav renders ' +
  '(a handful of always-present nav labels, the location-selector pills, the build\'s own ' +
  'version string), not a stub.',
  'Possible because AuthGate.js already bypasses Supabase auth entirely on localhost -- the dev ' +
  'server renders straight into the full app shell with no login step, so no test credentials or ' +
  'magic-link/OTP automation were needed.',
  'Deliberately scoped as a shell smoke test, not per-panel or authenticated-flow coverage -- ' +
  'see e2e/README.md for exactly what is and isn\'t covered, and why (a genuine follow-on, not ' +
  'attempted here: no session/RBAC path is exercised at all, since the bypass skips it). Not ' +
  'wired into CI -- a deliberate scope boundary, not an oversight (adding it means a real ' +
  'playwright-install-in-CI step and per-PR runtime cost, worth its own decision).',
  '`npm run test:e2e` to run locally. No changes to the app itself -- vite.config.ts\'s vitest ' +
  '`exclude` list gets one addition (**/e2e/**) so vitest doesn\'t try to run the Playwright spec ' +
  'file as one of its own unit tests.',
]};
