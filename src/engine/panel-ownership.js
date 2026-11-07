// @ts-nocheck
// Projection/Targets ownership — owner request 2026-11-07. See
// supabase/schema-panel-ownership-2026-11-07.sql's header comment for the full rationale.
//
// Two layers decide who may lock/edit Projections, apply Smart Targets "Apply as Official", or
// save a Monthly/Yearly Targets row: the role-baseline 'projections.own' permission (DO/VP and
// above by default, src/engine/permissions.js), OR a named panel_owner_grants row for a user who
// doesn't hold one of those roles (the owner's "different organization" delegation case). Pure,
// no Supabase/React coupling — App.js fetches grants once and passes the array down; these
// functions just answer the gate question from it.
import { hasPermission } from './permissions.js';

// true if `userId` may lock/edit the named zone, via either the role baseline or an active grant.
export function canOwnPanel(panelId, roleId, grants, userId, orgRoles) {
  if (hasPermission(roleId, 'projections.own', orgRoles)) return true;
  if (!userId) return false;
  return (grants || []).some(g => g && g.panel_id === panelId && g.user_id === userId && !g.revoked_at);
}

// Who should be notified that an owner just acted in this zone -- every role-baseline role PLUS
// every active named grantee for this panel, minus the actor themself (no self-notify). Returns
// the two app_notifications columns (schema-app-notifications.sql's target_roles +
// schema-panel-ownership-2026-11-07.sql's target_user_ids) ready to spread into
// buildAppNotification()'s payload.
const OWNER_BASELINE_ROLES = ['admin', 'owner', 'vp', 'do'];

export function ownerNotificationTargets(panelId, grants, actorUserId) {
  const granteeIds = (grants || [])
    .filter(g => g && g.panel_id === panelId && !g.revoked_at && g.user_id && g.user_id !== actorUserId)
    .map(g => g.user_id);
  const target_user_ids = [...new Set(granteeIds)];
  return {
    target_roles: OWNER_BASELINE_ROLES,
    target_user_ids: target_user_ids.length ? target_user_ids : null,
  };
}
