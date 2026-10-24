// @ts-nocheck
export default {version:'5.585', date:'2026-10-24', changes:[
  '**Fixed a real production outage: QSRSoft On-Hand Pull (EOM count-progress) had been failing ' +
  'every run since 2026-10-24 (issue #1539), silently dropping the count-progress signal the last ' +
  '3 days of every month depend on.** Root cause, confirmed from the live job log, not assumed: ' +
  '`scripts/qsrsoft-onhand-pull.mjs` carried its own copy of the eBOS auth ladder with the static ' +
  '`QSRSOFT_EBOS_TOKEN` secret checked FIRST -- and since that secret is always present in CI (a ' +
  'persistent GitHub Secret), the fresh/working SSO-exchange path never ran at all, every single ' +
  'run, the moment the stored secret aged past its few-minutes eBOS-token lifetime.',
  'Fixed by migrating the script onto the shared `scripts/lib/ebos-auth.mjs` ladder (fresh Cognito ' +
  'token -> SSO exchange -> static-token fallback only if SSO fails -> Playwright last resort) -- ' +
  'the exact same ladder already proven working for `qsrsoft-inventory-history-pull.mjs`, and the ' +
  'migration that lib\'s own header comment flagged as "a reasonable follow-up" back when it was ' +
  'extracted (PR #273, 2026-08-14) from three near-identical copies. Removed ~100 lines of ' +
  'duplicated SSO/Playwright auth code from onhand-pull.mjs; it now imports `EBOS_BASE`/' +
  '`resolveEbosToken` instead.',
  '3 new tests (`src/__tests__/ebos-auth-resolve-order.test.js`) exercise the shared ladder itself ' +
  '-- the first test coverage `ebos-auth.mjs` has ever had -- proving the SSO exchange wins even ' +
  'when a stale static token is also set, the static token is used only once SSO genuinely fails, ' +
  'and Playwright is the true last resort. This guards the priority order directly, so a future ' +
  'regression that re-introduces the "check the env token first" bug (in this script or anywhere ' +
  'else importing the shared ladder) fails the suite instead of silently breaking a scheduled pull ' +
  'again.',
  'Full suite 661/661 files, 6146/6146 tests green. Build clean, within budget (unchanged -- a ' +
  'scripts/ change, no src/ bundle impact).',
]};
