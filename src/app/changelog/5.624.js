// @ts-nocheck
export default {version:'5.624', date:'2026-11-04', changes:[
  '**New Knowledge Base article: "Roles & Default Permissions" (task #78).** The 9 real roles ' +
  '(Admin/Owner-Developer at the top, Manager as the actual new-signup default, down through ' +
  'SM/AM/DM), how the two separate mechanisms that gate access actually work (panel permissions ' +
  'via hasPermission vs. per-store data via accessible_locs/RLS), and exactly where to go to ' +
  'change a user\'s role or store access (Settings -> Admin -> Users tab) or to toggle which ' +
  'panels a whole role can see. Written against the live code (admin.js, permissions.js), not ' +
  'from memory -- matches CLAUDE.md\'s own RBAC table exactly. 720/720 test files, 6634/6634 ' +
  'tests; build clean.',
]};
