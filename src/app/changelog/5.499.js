// @ts-nocheck
export default {version:'5.499', date:'2026-10-06', changes:[
  'QSRSoft Security Events Pull: fixed a real latent bug found while chasing the still-open ' +
  'AUTH_FAILED:403 root cause. Owner confirmed the Security Events ("Suspicious Activity") ' +
  'report loads fine interactively, which both ruled the permission theory out further and ' +
  'surfaced that the pull script\'s Referer header has pointed at Register Audit\'s report URL ' +
  '(v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit) instead of Security Events\' own ' +
  '(v3.myqsrsoft.com/security/suspicious-activity, confirmed from the owner\'s live screenshot) ' +
  'since the #83 rebuild -- almost certainly copied from the sibling register-audit script and ' +
  'never corrected. Fixed. NOT yet live-verified (no QSRSoft credentials in this or any recent ' +
  'session) -- the one historically-successful curl (2026-08-23) used this same wrong-report ' +
  'Referer and still got a real 200 once, so this closes a genuine bug without being proven as ' +
  'THE gate. Needs the owner to trigger workflow_dispatch (or wait for the next 11:00 UTC daily ' +
  'run) and confirm a real 200 + row count before treating this stream as fixed.',
  'Updated memory/finding-failed-pull-email-audit-2026-10-06.md with the new lead and the ' +
  'caveat. Full suite: 5268/5268 passing (unaffected -- Referer header value only).',
]};
