// @ts-nocheck
export default {version:'4.237', date:'2026-06-28', changes:[
  'Permission Engine (permissions.js): roles are now fully configurable — create custom roles with any name and level, toggle individual permissions per role, stored in Supabase org_config and synced on login. Admin Panel adds a "Roles & Permissions" tab with an accordion editor (click any role to see and toggle its 19 permission checkboxes grouped by area). Level-1 roles bypass all permission checks. Review Approve/Return/Reopen buttons now gate on the reviews.approve permission (on by default for Area Supervisor, off for Manager). Admin Panel button in topbar gates on users.manage.all permission.',
]};
