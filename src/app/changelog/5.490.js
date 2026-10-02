// @ts-nocheck
export default {version:'5.490', date:'2026-10-02', changes:[
  'Monthly Projections: fixed a real data-integrity bug the owner caught on a live Patch Sheet ' +
  '(Robert Spencer, September 2026) -- Base Food % showed a literal "0.00%" actual with a ' +
  'nonsensical +$318,070.53 "Opportunity $" instead of "—", even though no store in the ' +
  'group had a real FOB actual on file for the period. Root cause: the group/district rollup ' +
  'math (rollActuals inside buildGroupSheetHTML/Patch Sheet, rollupGroup/buildEmailReportHTML\'s ' +
  'Group Report, and rollupProj on the on-screen grid) summed `(value||0)*sales` and divided ' +
  'by TOTAL group sales -- a store with no value for a field silently contributed a 0 to the ' +
  'numerator while its sales still counted in the denominator, so a field with ZERO real data ' +
  'anywhere in the group resolved to a literal 0 instead of null. Fixed in all three: each ' +
  'field now tracks its own numerator AND denominator, built only from the stores that actually ' +
  'reported a value for it -- a field missing everywhere returns null ("—"), and partial ' +
  'coverage averages only over the stores that have it.',
  'Monthly Projections: added an "All OK" / "All Florida" option to the Patch Sheet group ' +
  'picker (owner request) -- same vertical per-location-plus-combined-total report style as ' +
  'the existing Operator/Supervisor patch sheets, grouped by INV_ORG_COORDS.state.',
  'Monthly Projections: added show/hide toggles for the Service column group, Bonus Crew ' +
  'Labor %, and a new Bonus Food Threshold (tFOBBonusBase/fob_bonus_base_pct) column -- the ' +
  'last of these is new to this grid entirely (it was already saved to monthly_targets via ' +
  'dispatch #164 but never surfaced here). Persisted to settings via onUpdateSettings, now ' +
  'threaded through PlanningHubPanel to all 5 Planning tabs.',
  '42 tests across dispatch-monthly-projections-rollup-fixes-2026-10-02.test.js and ' +
  'dispatch-monthly-targets-period-detection-2026-10-02.test.js. Full suite: 5237/5237 passing. ' +
  'Build clean, eager payload 555.35 KB gzip (budget 850 KB).',
]};
