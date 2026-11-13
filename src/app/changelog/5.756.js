// @ts-nocheck
export default {version:'5.756', date:'2026-11-13', changes:[
  '**Knowledge Base InfoIcon rollout, batch 20 (task #75).** Wired 2 more KB articles that had ' +
  'real content but no "?" icon anywhere: `roles_and_permissions` (shipped under task #78, ' +
  'never wired) → Admin Panel\'s Roles & Permissions tab; `locked_projections` → At A Glance\'s ' +
  'weekly-projections table "Lock" column header, the actual UI it explains. Running total: 89 ' +
  'of 121 KB_ARTICLES keys now wired. Several other candidates a background audit flagged ' +
  '(`cash_os`, `drawer_open`, `condiment_pct`, `dialed_in` vs `dialed_in_calibration`, ' +
  '`file_import_guide` vs `data_manager_guide`, `priority_brief`) were deliberately left unwired ' +
  'this batch — each needs a real design decision (where in a rule-card UI a definition icon ' +
  'even goes, or which of two overlapping articles should win) rather than mechanical wiring. ' +
  'Full details in memory/finding-kb-panel-guide-2026-11-03.md\'s batch 20 entry. 1 new render ' +
  'test, full suite (7961 tests) and build pass clean (700.65 KB eager, budget 850 KB).',
]};
