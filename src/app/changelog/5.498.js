// @ts-nocheck
export default {version:'5.498', date:'2026-10-06', changes:[
  'QSRSoft Security Events Pull: dropped its cron from every 2 hours (12 failure emails/day) to ' +
  'once daily, at the owner\'s request, while the real root cause of its 100% AUTH_FAILED:403 ' +
  'stays open (unresolved since dispatches #81/83/91/95). An account-permission theory built ' +
  'from a stale memory/qsrsoft-report-catalog.md capture was raised, then REFUTED the same day -- ' +
  'the owner checked QSRSoft\'s own Users admin screen live and the account has Director of ' +
  'Operations + System Administrators roles with Security Access explicitly toggled on. Corrected ' +
  'both memory files (qsrsoft-report-catalog.md, finding-failed-pull-email-audit-2026-10-06.md) ' +
  'rather than leave the wrong claim on record for a future session to repeat. Next useful ' +
  'experiment needs the owner\'s own live browser: do the Security Events / Register Audit report ' +
  'pages load interactively for this confirmed-correct account? Do not restore the 2-hour cadence ' +
  'on a guess once this reopens -- re-verify via workflow_dispatch.',
  'No src/ changes -- workflow YAML + memory only. Full suite: 5268/5268 passing (unaffected, ' +
  'confirmed by running it).',
]};
