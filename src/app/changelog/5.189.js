// @ts-nocheck
export default {version:'5.189', date:'2026-08-26', changes:[
  'Performance Review continuity, Phase 1 (dispatch #148): built the real 7-rung reviewer-'
  + 'hierarchy ladder in `src/engine/permissions.js`\'s `DEFAULT_ROLES`, replacing the old 3-tier '
  + 'stub (admin/area_supervisor/manager only). New rungs, bottom to top: SM/AM/DM -> GM -> AS '
  + '(`area_supervisor`, id reused from the old stub) -> OM -> DO -> VP -> Owner/Developer. '
  + '`admin` and `manager` are kept unchanged (id/level/color/system/permissions) rather than '
  + 'renamed or collapsed into the ladder -- flagged as a genuine open question for the PM in this '
  + 'dispatch\'s PR, since real live `profiles.role` values already use those exact id strings. '
  + 'Added `levelsAbove(roleId, aboveRoleId, ladder)`, a pure "N levels above" resolver for later '
  + 'reuse by the override-authority and review-visibility work -- not wired into any UI yet, per '
  + 'dispatch scope.\n\n'
  + 'Fixed two real bugs in `supabase/schema.sql`\'s `reviews` RLS: (1) a literal string mismatch '
  + '-- the "supervisor read" policy, the `profiles.role` check constraint, `org_config` and '
  + '`staff_assignments` policies all checked `\'supervisor\'`, which the real role id has always '
  + 'been `\'area_supervisor\'` -- so the supervisor read policy has likely never matched a real '
  + 'logged-in supervisor. (2) A live security gap: `reviews: authenticated write`/`update` '
  + 'previously checked only `auth.uid() is not null`, letting ANY authenticated user insert or '
  + 'overwrite ANY review row; now requires the caller\'s role be one of the roles that could '
  + 'plausibly write a review at all. This SQL has NOT been applied to production yet -- see this '
  + 'dispatch\'s PR body for the exact statements a human needs to run against Supabase.',
]};
