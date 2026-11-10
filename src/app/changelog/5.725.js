// @ts-nocheck
export default {version:'5.725', date:'2026-11-10', changes:[
  '**🧹 Weekly self-maintenance sweep ([sweep:panel-contract]): multi-store selection ("pick any '+
  'combination of stores") extended to 3 more reports.** `trend-report.js`, `opportunity-dollars.js`, '+
  'and `weekly-count-status-report.js` now support `multi:true` on their LocationSelector, same as '+
  'Pricing Engine\'s Cross-Store Compare and the Count Timing / Missed Count reports already do — '+
  'pick any custom combination of stores across state/patch lines, not just All / a state / a patch / '+
  'one store. Re-measured (not assumed) against the real code before converting: `trends.js`, the '+
  'fourth panel this backlog had flagged as a likely candidate, turned out NOT to be one — it\'s a '+
  'single-store trend viewer with no multi-store data path at all, left alone correctly rather than '+
  'force-converted.',
]};
