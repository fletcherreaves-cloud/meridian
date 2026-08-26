// @ts-nocheck
export default {version:'5.193', date:'2026-08-26', changes:[
  'Fixed a real bug found while verifying dispatch #151 live: an org-configured role list saved '
  + 'before dispatch #148 added the 7-rung reviewer-hierarchy ladder (vp/do/om/gm/sm_am_dm/owner) '
  + 'never picked up any of the new roles -- `getOrgRoles()`/`syncOrgRolesFromSupabase()` always '
  + 'preferred a persisted role list wholesale over `DEFAULT_ROLES`, so every ladder id missing '
  + 'from that persisted list stayed silently invisible everywhere in the app, including the '
  + 'User Management role dropdown. New `mergeMissingDefaultRoles()` fixes this additively -- '
  + 'appends any `DEFAULT_ROLES` id missing from a persisted list, never touches or reorders an '
  + 'existing persisted entry (confirmed zero live profiles were affected: production\'s '
  + 'persisted list only ever had admin/area_supervisor/manager plus one unused stray custom '
  + 'role) -- so the next ladder addition doesn\'t repeat this masking either.',
]};
