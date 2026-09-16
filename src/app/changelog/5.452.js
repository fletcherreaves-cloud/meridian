// @ts-nocheck
export default {version:'5.452', date:'2026-09-16', changes:[
  'RBAC role-ladder correctness sweep, ahead of onboarding a second operator. A research pass ' +
  'found CLAUDE.md\'s documented 8-tier role ladder (Developer/Admin/Owner/VP/DO/Supervisor/GM/' +
  'Office Staff) does not exist in the live app -- the real DB constraint and ' +
  'src/engine/permissions.js agree on 9 different ids (admin/owner/vp/do/om/area_supervisor/gm/' +
  'sm_am_dm/manager), with no "developer" or "office_staff" value at all. This was already ' +
  'producing live bugs, not just doc drift.',
  'Fixed: management.js\'s "🛠 Dev" tab could never render for anyone (checked the impossible ' +
  '\'developer\' string) -- including the real owner\'s own account. task-queue.js\'s isDev read ' +
  'a settings.role field that has never existed, silently disabling Feature Request dev_notes ' +
  'editing for every user; fixed to read the real userRole (which wasn\'t even being passed to ' +
  'the panel -- threaded through from App.js). App.js\'s beta-mode default check had the same ' +
  'impossible-string bug, defaulting Test Kitchen hidden on every fresh-device login including ' +
  'the owner\'s. security-panel.js and sage-chat/index.ts both checked the pre-dispatch-#148 ' +
  'spelling \'supervisor\' instead of \'area_supervisor\'. security-panel.js, sage.js, and ' +
  'forms-panel.js all excluded the real \'owner\' role from tiers their own comments said should ' +
  'include it (stale "collapses into admin" assumption).',
  '⚠️ Two DB-side fixes need the owner to run them: supabase/schema-security-findings-role-fix.sql ' +
  'and supabase/schema-sage-prompts-role-fix.sql (both had the identical stale role strings in ' +
  'RLS policies/triggers -- currently dormant since the one live account is admin, but must match ' +
  'the client-side fixes before a real owner/area_supervisor account exists).',
  'CLAUDE.md\'s RBAC Roles table corrected to the real 9-role ladder, with the live-bug list and a ' +
  'flag on the single highest-value pre-distribution gap: RLS store-level scoping ' +
  '(accessible_locs) has never been exercised with an actual restricted account -- only ' +
  'structurally confirmed while every real profile had accessible_locs=NULL. Full findings: ' +
  'memory/finding-rbac-role-ladder-2026-09-16.md.',
  '5 new/updated tests (task-queue-role-fix.test.js new; security-panel.test.js updated for the ' +
  'real area_supervisor/owner roles). Full suite 522/522 files, 4997/4997 tests. Build clean, ' +
  'eager payload 550.65 KB / 850 KB.',
]};
