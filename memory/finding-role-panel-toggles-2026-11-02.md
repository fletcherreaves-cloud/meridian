---
name: finding-role-panel-toggles-2026-11-02
description: "Design + what-already-existed notes for the 2026-11-02 backlog item 'role-based panel active/inactive toggles + delegated sub-role management.'"
metadata:
  type: finding
---

# Role-based panel toggles + delegated sub-role management (2026-11-02)

**Status: shipped.** Investigated before building (per the "check whether a helper exists"
standing rule) and found two existing, UNUSED primitives this feature is built from rather than
duplicating:

- `src/engine/permissions.js`'s `canManageRole(myRoleId, targetRoleId, roles)` -- defined since
  dispatch #148, never called anywhere in the UI until now.
- The `users.manage.lower` permission key -- present in every role template's defaults, but
  nothing in the app ever checked it; `AdminPanel` was gated on `users.manage.all` only.

## What this is NOT duplicating

`PERMISSION_GROUPS`/`hasPermission`/the existing `RolesTab` permission-toggle grid
(`src/views/admin.js`) already let a full-admin edit per-role access, but at **permission-group**
granularity -- several panels share one `perm:` key (e.g. several key off `analytics.store`), so
turning a permission off hides every panel in that group, not one specific panel. That is a
different, coarser mechanism from what was asked ("panel active/inactive toggles").

The existing device-local `panelVis`/Panel Manager (`App.js`'s `PanelManagerPanel`) is also a
different mechanism: per-device (localStorage), not per-role, and opt-IN (only `OPTIONAL_PANELS`
default off). This feature is opt-OUT (everything visible by default; an admin/delegate turns
specific ones off per role) and role-scoped (Supabase-persisted via the same `org_config`/
`org_roles` blob `RolesTab` already syncs -- no new table).

## What shipped

- `isPanelEnabledForRole(panelId, roleId, roles)` (permissions.js) -- same two early-exits as
  `hasPermission` (unknown role -> fail closed; level-1 -> bypass), then checks membership in a
  new optional `role.disabledPanels: string[]` array.
- `shell.js`'s `AppSidebar` takes a new `panelEnabled` prop (fails open to "everything visible"
  when omitted, same tier as `perm`'s own fallback), consulted in `navP`/`navPBeta`, the
  OPTIONAL_PANELS block (both classic and v2 nav styles), and the search index -- a role-disabled
  panel disappears from the flat nav, Deep Dive, Test Kitchen, AND search/palette results.
- `App.js` binds it: `panelEnabled = (id) => isPanelEnabledForRole(id, userRole, orgRoles)`.
- `admin.js`'s `RolesTab` gained a new "🧩 Panel access" sub-section per expanded role (grouped by
  SECTIONS + a Test Kitchen bucket, same categorization style as `PanelManagerPanel`), writing to
  `role.disabledPanels` via a new `togglePanel` function, persisted the same way
  (`pushOrgRolesToSupabase`) every other role edit already uses.
- **Delegation**: `AdminPanel` now also opens for a `users.manage.lower` holder (previously
  `users.manage.all` only). Inside, `RolesTab` computes `fullAccess` and, when false, filters the
  role list to only roles the caller's role strictly outranks (`canManageRole`) -- never a peer or
  anything above. A scoped caller can toggle permissions and panel access for those roles, but
  cannot rename/add/delete a role (structural controls stay `fullAccess`-only) and never sees the
  Users tab (a separate, untouched concern -- reassigning which user holds which role).

## Deliberately out of scope

- The Users tab / user-to-role assignment was NOT touched or opened up to delegation -- a
  separate concern with its own considerations (e.g. a delegate assigning themselves a higher
  role would be a privilege-escalation bug if not carefully built); flagging here rather than
  silently expanding this dispatch's blast radius.
- This is a UI-layer gate only, same relationship every other `perm:` check in this app has to
  its data (RLS, where it matters, is the real boundary) -- consistent with the existing Panel
  Manager, which also has no server-side enforcement.

## Tests

`src/__tests__/dispatch-role-panel-toggles-2026-11-02.test.js` -- `isPanelEnabledForRole`'s own
rules, `AppSidebar`'s wiring (nav + search index), and `AdminPanel`/`RolesTab`'s delegated-access
scoping (full access sees everyone; a `do`-level caller sees exactly om/area_supervisor/gm/
sm_am_dm, never itself/peers/above; structural controls hidden; panel toggle UI reachable).
