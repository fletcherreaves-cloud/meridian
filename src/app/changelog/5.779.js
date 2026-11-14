// @ts-nocheck
export default {version:'5.779', date:'2026-11-14', changes:[
  '**Fix: QSRSoft Register Audit Pull restored after a ~2-month outage (GH issue #1314).** ' +
  'Every scheduled run since 2026-09-21 failed with a `403` explicit IAM deny on the endpoint ' +
  'this script called -- confirmed NOT a token problem (login and token capture both succeeded ' +
  'every time). Root cause: QSRSoft deprecated/denied that endpoint; the real, currently-live ' +
  'one was found by watching v3.myqsrsoft.com\'s own network traffic while it successfully ' +
  'rendered this exact report: `data_layer/v1/cash/register-audit-by-employee`. Every field ' +
  'mapping and formula was re-verified live against real on-screen values rather than guessed ' +
  'from field names -- and one genuine correction surfaced in the process: T-Red Before/After ' +
  'Pct is a **$ share of sales**, not qty/transactions as the old (never actually confirmed) ' +
  'formula assumed. Cash O/S $ and % are honestly left unmapped (null) -- confirmed unavailable ' +
  'from this endpoint after ~25 field-name attempts and several arithmetic candidates all failed ' +
  'to reproduce a real displayed value, not a lazy skip. Live dry-run: 722 real rows saved ' +
  'across cashier/manager/preparer register types, 27/28 stores, zero errors. Shipped together ' +
  'with a companion correctness fix so this null Cash O/S can never silently read as a confirmed ' +
  '$0.00 anywhere it flows -- see that commit for the register-audit.js/store-analytics.js ' +
  'null-safety changes. Full findings: ' +
  'memory/finding-register-audit-pull-endpoint-migration-2026-11-14.md.',
]};
