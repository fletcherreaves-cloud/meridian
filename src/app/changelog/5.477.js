// @ts-nocheck
export default {version:'5.477', date:'2026-09-22', changes:[
  'SAGE knowledge grounding: fixed a live bug where the real owner account was silently denied ' +
  'RESTRICTED-classified project-memory results (dispatch #80\'s search_project_memory tool). ' +
  '`qualifiesForRestricted()` (supabase/functions/sage-chat/memory-kb.js) was written when ' +
  'profiles.role held only 3 DB values (admin/supervisor/manager) and gated on `admin` alone; ' +
  'CLAUDE.md\'s RBAC section was corrected 2026-09-16 to the real 9-value constraint, where ' +
  '`owner` is a distinct top-tier id at the SAME level as `admin` -- every other admin-tier check ' +
  'in the codebase already treats them as equivalent (permissions.js, forms-panel.js, sage.js, ' +
  'security-panel.js, task-queue.js), but memory-kb.js was the one holdout still checking ' +
  '`role === \'admin\'` alone.',
  'Fixed: `qualifiesForRestricted` now returns true for `admin` OR `owner`. 3 tests updated/added ' +
  'in src/__tests__/sage-memory-kb.test.js (qualifiesForRestricted, buildMemorySearchResult, ' +
  'rowVisible) -- confirmed to fail against the pre-fix code. Full suite 539/539 files, ' +
  '5079/5079 tests. Build clean, eager payload 551.75 KB gzip (budget 850 KB).',
]};
