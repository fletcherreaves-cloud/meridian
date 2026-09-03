// @ts-nocheck
export default {version:'5.332', date:'2026-09-03', changes:[
  'Test coverage: changelog-version.test.js now guards version-number ORDERING, not just ' +
  'collisions. gen-changelog-latest.mjs picks MERIDIAN_VERSION purely by version number -- if a ' +
  'new src/app/changelog/<version>.js file is ever typed with a lower number than what already ' +
  'shipped (e.g. a slipped digit), it would previously ship green and silently never become the ' +
  'displayed version. New test asserts the newest-dated file(s) hold the global-max version, ' +
  'verified to actually fail on a deliberately reintroduced regression before landing.',
  'Full suite (3719 tests) and build both clean (533.09 KB / 850 KB eager budget). Test-only ' +
  'change, no UI surface -- no browser smoke test needed.',
]};
