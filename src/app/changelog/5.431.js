// @ts-nocheck
export default {version:'5.431', date:'2026-09-12', changes:[
  'Visit Readiness -- the food-safety flag now uses the REAL EcoSure visit result instead of ' +
  'the waste/variance proxy, whenever one is current for a store (within its own ~12-month ' +
  'overdue threshold). Follow-on to dispatch #231, whose leak-free backtest already measured ' +
  'the proxy near-uncorrelated with real outcomes (r=0.07, n=240) and found a live ' +
  'counterexample -- Ardmore-Broadway flagged "elevated" by the proxy while its real EcoSure ' +
  'audit scored 86/100 and passed clean. That measurement sat unused until now: a real critical ' +
  'always wins even over a clean proxy reading, and a real clean pass always wins even over a ' +
  'bad proxy reading. The proxy is demoted to filling the gap BETWEEN visits, not removed -- ' +
  'still shown as background/diagnostic depth on-screen and in both printed reports.',
  'New badge: "EcoSure: Pass/Watch/CRITICAL" replaces "W&V ..." wherever the flag is EcoSure-' +
  'sourced (collapsed row, coaching one-pager, printed audit report) -- reusing the deliberately ' +
  'hedged "W&V" wording for a real, dated audit result would understate a genuine finding the ' +
  'same way the proxy used to overstate a fake one. CSV export gets a new "Food-safety source" ' +
  'column + a dedicated EcoSure-visit row (date, score, critical count, fresh/stale).',
  '7 new tests, all confirmed to fail against pre-fix code: the Ardmore-Broadway counterexample ' +
  'reproduced directly (both directions), no-EcoSure and stale-EcoSure fallback regressions, ' +
  'independent-of-most-recent-visit-type resolution, updated coverage-gap wording, and a real ' +
  'VisitReadinessPanel render showing the new badge. Full design notes: ' +
  'memory/finding-ecosure-replaces-waste-proxy-2026-09-12.md.',
  'Full suite 505/505 files, 4770/4770 tests, build clean, 541.49 KB / 850 KB eager-payload budget.',
]};
