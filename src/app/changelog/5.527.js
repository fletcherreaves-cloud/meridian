// @ts-nocheck
export default {version:'5.527', date:'2026-10-12', changes:[
  'NEW: Security panel gets a third domain -- Labor (LABOR-001/002/003) -- answering the owner\'s ' +
  'own question: "do we currently scan or look for the possibility of ghost employees on payroll ' +
  'or potential for fraudulent time clock entries being manually applied in any type of pattern?" ' +
  'Built on lifelenz_punch_edits (v5.521-v5.526, confirmed live/correct, 321/321 real edit-events ' +
  'across all 27 stores).',
  'LABOR-001 (ghost employee): a LifeLenz punch add/edit for an employee, dated after the ' +
  'termination date QSRSoft has on file for them. LABOR-002 (self-approval): the edited employee ' +
  'IS the editing manager on the same row. LABOR-003 (per-manager outlier edit rate): a manager\'s ' +
  'edit count per 1,000 punches at their own store, z-scored against other stores\' own rate -- ' +
  'the same manager x store / store-baseline shape already shipped for INV-004.',
  'scripts/security-rules-run.mjs: new LABOR section (mapPunchEditRow/mapTenureRow/' +
  'mapPunchTimeDateRow, supportsLaborGhost/SelfApproval/ManagerRate, joinPunchEditsWithTenure, ' +
  'computeLaborEmployeeFindingsForRule, buildLocDatePunchIndex/joinManagerEditsWithPunchVolume, ' +
  'computeManagerEditFindingsForRule) wired into the existing active-rules batch loop -- zero new ' +
  'engine capability, identity resolved at compute time via the SAME getOrCreateToken()/' +
  'tokenizeRows() vault every other domain uses (lifelenz_punch_edits stores names directly, per ' +
  'dispatch #125\'s own standing directive for this data domain).',
  'security-panel.js: "🕐 Labor" tab, subject grouping fixed to recognize emp-keyed subjects from ' +
  'any non-inventory domain (was a two-way cash/inventory ternary), RULE_UNITS/RULE_DOMAIN_LABEL ' +
  'entries. The per-subject drill-down ("Investigate further") is DELIBERATELY NOT offered for ' +
  'Labor yet -- no assembleLaborDrilldown() this pass, a stated scope decision, not a silent gap.',
  'All three rules ship ACTIVE=FALSE (schema-security-rules-labor.sql) -- same posture CASH-001/' +
  'CASH-002\'s own fixtures take when a threshold is a first guess, not yet measured against this ' +
  'org\'s real data. No live Supabase credential was available in this sandbox to run the ' +
  'equivalent of INV-004\'s own pre-ship dry run, and LABOR-001 specifically depends on an ' +
  'unverified assumption (LifeLenz geid and QSRSoft geid being the same identifier space) that ' +
  'needs a real join-hit-rate measurement before it means anything -- see that schema file\'s own ' +
  'pre-flight checklist before flipping any of these active=true.',
  'Also deliberately deferred: rounding-direction skew (needs a real distribution-skew statistic ' +
  'the rule engine does not support yet -- sequence/window-function logic types are explicitly ' +
  'stubbed in security-rules.js -- new engine work, not a new rule row).',
  '22 new pure-function tests (security-rules-labor-2026-10-12.test.js) + 3 rendered-component ' +
  'tests proving the tab/grouping/drilldown-suppression actually wire into the real panel ' +
  '(security-panel.test.js), full suite 5516/5516, build clean (eager payload unchanged, 559 KB ' +
  'gzip -- this is server-side compute + a lazy-loaded panel, no new eager cost).',
]};
