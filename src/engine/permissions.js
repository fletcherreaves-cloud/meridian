// Meridian — Permission Engine
// Roles are org-configurable (not hardcoded). Each role has a level (lower = more authority),
// a set of permission toggles, and optional metadata. Level 1 roles always bypass all checks.
//
// Dispatch #148 (Performance Review continuity, Phase 1) — the real 7-rung reviewer-hierarchy
// ladder, replacing the old 3-tier stub (admin/area_supervisor/manager only). Per
// memory/plan-performance-review-continuity-2026-08-26.md decision #4 (sharpened by #6), the
// real ladder a review chain walks is:
//   SM/AM/DM (one rung, 3 titles) → GM → AS → OM → DO → VP → Owner/Developer (top)
// `level` continues to mean "lower = more authority" (level 1 = top), consistent with the
// existing scheme, so `sm_am_dm`=7 (bottom) up through `owner`=1 (top).
//
// 'admin' and 'manager' are KEPT UNCHANGED (id, level, permissions, color, system) rather than
// renamed/collapsed into the new ladder -- flagged as a genuine ambiguity in dispatch-148.md
// ("unclear yet whether they collapse into GM/Owner or stay distinct utility roles"). Real live
// profiles.role values already use these exact id strings (schema.sql's `get_my_role()` /
// `profiles.role` check constraint), so renaming or renumbering them is a live-user-affecting
// change this dispatch does not have standing to make silently. See this dispatch's PR body for
// the explicit open question this leaves for the PM.
const ORG_ROLES_KEY = 'mf_org_roles_v1';

// ── Permission registry ────────────────────────────────────────────────────────
// Single source of truth for what permission keys exist and how they're grouped.
export const PERMISSION_GROUPS = [
  {
    group: 'Performance Reviews',
    items: [
      { key: 'reviews.view',      label: 'View reviews' },
      { key: 'reviews.create',    label: 'Create & edit reviews' },
      { key: 'reviews.submit',    label: 'Submit reviews for approval' },
      { key: 'reviews.approve',   label: 'Approve or return reviews' },
      { key: 'reviews.delete',    label: 'Delete reviews' },
      { key: 'reviews.customize', label: 'Customize scoring weights & thresholds' },
    ],
  },
  {
    group: 'Analytics & Intelligence',
    items: [
      { key: 'analytics.dashboard',   label: 'Command Center / Dashboard' },
      { key: 'analytics.store',       label: 'Store analytics & detail' },
      { key: 'analytics.district',    label: 'District / multi-store views' },
      { key: 'analytics.labor',       label: 'Labor analytics' },
      { key: 'analytics.forecasting', label: 'Forecasting tools' },
      { key: 'analytics.brief',       label: 'Morning Brief' },
      { key: 'analytics.ai',          label: 'AI Scan, Why Engine, insights' },
      { key: 'analytics.integrity',   label: 'Data integrity & audit tools' },
    ],
  },
  {
    group: 'Administration',
    items: [
      { key: 'data.upload',        label: 'Upload data files' },
      { key: 'settings.view',      label: 'View settings panel' },
      { key: 'settings.edit',      label: 'Edit app settings & preferences' },
      { key: 'users.manage.all',   label: 'Full user management (Admin Panel)' },
      { key: 'users.manage.lower', label: 'Manage lower-level users' },
    ],
  },
  {
    group: 'Security',
    items: [
      // Static baseline only -- admin/supervisor always match security_findings' RLS tier, but
      // that policy ALSO allows manager when org_config.gm_identity_reveal_enabled is true, which
      // this static per-role template can't express (it's an org-wide runtime flag, not a role
      // property). src/views/security-panel.js's securityPanelAccess() does the real, live check
      // for manager -- this key only decides whether the nav entry is worth attempting at all
      // (manager: true, so they see it and the panel resolves the real answer; the panel itself
      // never trusts this key alone).
      { key: 'security.view', label: 'View Security panel (loss-prevention findings)' },
    ],
  },
];

// Flat list of all permission keys (derived — do not hardcode elsewhere)
export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.key));

// ── Default permission sets ────────────────────────────────────────────────────
const ADMIN_PERMS = Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, true]));

const SUPERVISOR_PERMS = {
  'reviews.view':           true,
  'reviews.create':         true,
  'reviews.submit':         true,
  'reviews.approve':        true,   // scoped to accessible_locs at the data layer
  'reviews.delete':         false,
  'reviews.customize':      false,
  'analytics.dashboard':    true,
  'analytics.store':        true,
  'analytics.district':     true,
  'analytics.labor':        true,
  'analytics.forecasting':  true,
  'analytics.brief':        true,
  'analytics.ai':           true,
  'analytics.integrity':    false,
  'data.upload':            true,
  'settings.view':          false,
  'settings.edit':          false,
  'users.manage.all':       false,
  'users.manage.lower':     true,
  'security.view':          true,
};

const MANAGER_PERMS = {
  'reviews.view':           true,
  'reviews.create':         true,
  'reviews.submit':         true,
  'reviews.approve':        false,
  'reviews.delete':         false,
  'reviews.customize':      false,
  'analytics.dashboard':    true,
  'analytics.store':        true,
  'analytics.district':     false,
  'analytics.labor':        true,
  'analytics.forecasting':  false,
  'analytics.brief':        true,
  'analytics.ai':           false,
  'analytics.integrity':    false,
  'data.upload':            false,
  'settings.view':          false,
  'settings.edit':          false,
  'users.manage.all':       false,
  'users.manage.lower':     false,
  // true, not false: a manager's REAL access is org_config.gm_identity_reveal_enabled, a runtime
  // flag this static template can't see. Set true so the nav entry appears and
  // securityPanelAccess() resolves the live answer -- false here would hide the entry from every
  // manager even when their org has the flag on, which is looser-by-omission in the wrong
  // direction (a manager who SHOULD have access getting none) rather than the direction this
  // build is careful about (nobody sees more than RLS allows).
  'security.view':          true,
};

// ── The 7-rung review-hierarchy ladder (dispatch #148) ─────────────────────────
// SM/AM/DM (bottom, level 7) → GM → AS (`area_supervisor`, id reused from the old 3-tier stub --
// same concept, same real profiles.role values) → OM → DO → VP → Owner/Developer (top, level 1).
const OWNER_PERMS = { ...ADMIN_PERMS };

const VP_PERMS = {
  'reviews.view':           true,
  'reviews.create':         true,
  'reviews.submit':         true,
  'reviews.approve':        true,
  'reviews.delete':         false,
  'reviews.customize':      false,
  'analytics.dashboard':    true,
  'analytics.store':        true,
  'analytics.district':     true,
  'analytics.labor':        true,
  'analytics.forecasting':  true,
  'analytics.brief':        true,
  'analytics.ai':           true,
  'analytics.integrity':    true,
  'data.upload':            true,
  'settings.view':          true,
  'settings.edit':          false,
  'users.manage.all':       false,
  'users.manage.lower':     true,
  'security.view':          true,
};

const DO_PERMS = {
  ...VP_PERMS,
  'analytics.integrity':    false,
};

const OM_PERMS = {
  ...SUPERVISOR_PERMS,
  'analytics.integrity':    true,
};

const GM_PERMS = {
  'reviews.view':           true,
  'reviews.create':         true,
  'reviews.submit':         true,
  'reviews.approve':        true,   // approves SM/AM/DM reviews for their own store
  'reviews.delete':         false,
  'reviews.customize':      false,
  'analytics.dashboard':    true,
  'analytics.store':        true,
  'analytics.district':     false,
  'analytics.labor':        true,
  'analytics.forecasting':  false,
  'analytics.brief':        true,
  'analytics.ai':           false,
  'analytics.integrity':    false,
  'data.upload':            true,
  'settings.view':          false,
  'settings.edit':          false,
  'users.manage.all':       false,
  'users.manage.lower':     true,
  'security.view':          true,
};

const SM_AM_DM_PERMS = {
  'reviews.view':           true,   // their own review only, at the data layer
  'reviews.create':         false,
  'reviews.submit':         false,
  'reviews.approve':        false,
  'reviews.delete':         false,
  'reviews.customize':      false,
  'analytics.dashboard':    true,
  'analytics.store':        true,
  'analytics.district':     false,
  'analytics.labor':        true,
  'analytics.forecasting':  false,
  'analytics.brief':        true,
  'analytics.ai':           false,
  'analytics.integrity':    false,
  'data.upload':            false,
  'settings.view':          false,
  'settings.edit':          false,
  'users.manage.all':       false,
  'users.manage.lower':     false,
  'security.view':          true,
};

export const ROLE_PERMISSION_TEMPLATES = {
  admin:           ADMIN_PERMS,
  owner:           OWNER_PERMS,
  vp:              VP_PERMS,
  do:              DO_PERMS,
  om:              OM_PERMS,
  area_supervisor: SUPERVISOR_PERMS,
  gm:              GM_PERMS,
  sm_am_dm:        SM_AM_DM_PERMS,
  manager:         MANAGER_PERMS,
};

// ── Built-in roles ─────────────────────────────────────────────────────────────
// Ordered top (most authority, level 1) to bottom (least authority, level 7+) for readability;
// `level` is the field that actually governs authority, not array order.
export const DEFAULT_ROLES = [
  // Pre-existing system/utility roles -- kept exactly as they were (see file-header note).
  { id: 'admin',           label: 'Admin',            level: 1, color: '#f59e0b', system: true,  permissions: ADMIN_PERMS },
  // The 7-rung review-hierarchy ladder (new, dispatch #148).
  { id: 'owner',           label: 'Owner / Developer', level: 1, color: '#f5bc00', system: true,  permissions: OWNER_PERMS },
  { id: 'vp',              label: 'VP',                level: 2, color: '#8b5cf6', system: true,  permissions: VP_PERMS },
  { id: 'do',              label: 'DO (District Ops)', level: 3, color: '#6366f1', system: true,  permissions: DO_PERMS },
  { id: 'om',              label: 'OM (Ops Manager)',  level: 4, color: '#0ea5e9', system: true,  permissions: OM_PERMS },
  { id: 'area_supervisor', label: 'AS (Area Supervisor)', level: 5, color: '#3b82f6', system: false, permissions: SUPERVISOR_PERMS },
  { id: 'gm',              label: 'GM (General Manager)', level: 6, color: '#14b8a6', system: true,  permissions: GM_PERMS },
  { id: 'sm_am_dm',        label: 'SM / AM / DM',      level: 7, color: '#84cc16', system: true,  permissions: SM_AM_DM_PERMS },
  // Pre-existing system/utility role -- kept exactly as it was (see file-header note).
  { id: 'manager',         label: 'Manager',          level: 3, color: '#22c55e', system: false, permissions: MANAGER_PERMS },
];

// ── "N levels above" resolver (dispatch #148) ──────────────────────────────────
// Pure function: given two role ids and a ladder (an array of role-like objects each carrying
// `id` and `level`, e.g. DEFAULT_ROLES or a caller-supplied subset), returns how many rungs
// apart they are on that ladder -- a positive integer if `roleId` sits below `aboveRoleId`
// (i.e. `aboveRoleId` has more authority / a numerically lower level), or null if either id
// isn't found in the ladder. Does NOT special-case any role (e.g. the unconditional
// Admin/Developer "root override" from the plan doc's decision #6-C is a separate, explicit
// check a caller adds on top of this -- this function only knows about ladder distance).
// Intentionally standalone and NOT wired into any review-locking/visibility UI yet -- that's
// later build-sequencing work (person/store assignment model) per dispatch-148.md scope.
export function levelsAbove(roleId, aboveRoleId, ladder) {
  const list = ladder || DEFAULT_ROLES;
  const role  = list.find(r => r.id === roleId);
  const above = list.find(r => r.id === aboveRoleId);
  if (!role || !above || role.level == null || above.level == null) return null;
  return role.level - above.level; // positive = `above` truly outranks `role`
}

// ── Review-role → ladder mapping (dispatch #149) ───────────────────────────────
// review-engine.js's ROLE_KEYS (GM/AM/DM/SM/AS/OM) is a distinct, review-specific taxonomy from
// this file's ladder ids -- AM/DM/SM all collapse onto the single 'sm_am_dm' rung (same
// functional level, split by pay classification per the plan doc's decision #5), not three
// separate rungs. Mirrored in SQL by supabase/schema.sql's review_role_to_ladder() function
// (used by the review_overrides RLS insert policy) -- keep both in sync if either side changes;
// this is the same de-sync risk the plan doc's "Recommended data-shape approach" section already
// flags for any SQL-side reimplementation of a JS rule.
export const REVIEW_ROLE_TO_LADDER = {
  GM: 'gm', AM: 'sm_am_dm', DM: 'sm_am_dm', SM: 'sm_am_dm', AS: 'area_supervisor', OM: 'om',
};

// ── Locked-actual override authorization (dispatch #149) ───────────────────────
// Per memory/plan-performance-review-continuity-2026-08-26.md decision #4, the owner's own
// worked example: "anyone 2 levels above the reviewed person. So if a GM is being reviewed then
// the Supervisor does the review, The OM or DO or higher would be the only ones to override a
// result" -- PLUS an unconditional Admin/Developer override regardless of ladder distance
// (decision #6-C, "Root override escape hatch... a safety valve so a ladder bug or a vacant
// reviewer slot can never lock out the people actually responsible for data integrity").
// `reviewRole` is a review-engine.js ROLE_KEYS value (e.g. 'GM'), NOT a ladder id -- resolved
// via REVIEW_ROLE_TO_LADDER above before the ladder-distance check. Pure and testable; does not
// touch RLS -- supabase/schema.sql's review_overrides INSERT policy enforces the identical rule
// server-side (via its own SQL role_level()/review_role_to_ladder() functions), which is the
// actual enforcement boundary this client-side check only mirrors for the UI.
export function canOverrideLockedActual(callerRoleId, reviewRole, ladder) {
  if (callerRoleId === 'admin' || callerRoleId === 'owner') return true;
  const ladderRoleId = REVIEW_ROLE_TO_LADDER[reviewRole];
  if (!ladderRoleId) return false;
  const diff = levelsAbove(ladderRoleId, callerRoleId, ladder);
  return diff != null && diff >= 2;
}

// ── Persistence ────────────────────────────────────────────────────────────────
// getOrgRoles()/syncOrgRolesFromSupabase() always PREFERRED a persisted role list wholesale over
// DEFAULT_ROLES -- correct for a genuinely org-configured list, but it means any org that
// persisted a role list BEFORE dispatch #148 added the 7-rung ladder (vp/do/om/gm/sm_am_dm/owner)
// never sees any of those new roles appear anywhere -- confirmed live 2026-08-26: production's
// persisted 'org_roles' predates #148 and only ever had admin/area_supervisor/manager (+ a stray
// custom 'owner_0nct' role a user had added by hand as a stand-in before #148 shipped the real
// 'owner' id -- unassignable to any profile since #148's CHECK constraint doesn't allow that id;
// confirmed zero live profiles use it, and deleted). mergeMissingDefaultRoles() closes this
// additively -- appends any DEFAULT_ROLES id missing from the persisted list, never touches or
// reorders an existing persisted entry -- so the next ladder addition doesn't repeat this masking.
export function mergeMissingDefaultRoles(roles) {
  const have = new Set(roles.map(r => r.id));
  const missing = DEFAULT_ROLES.filter(r => !have.has(r.id)).map(r => ({ ...r, permissions: { ...r.permissions } }));
  return missing.length ? [...roles, ...missing] : roles;
}

// The 7 rungs dispatch #148 defined the real ladder over -- see DEFAULT_ROLES' own "7-rung
// review-hierarchy ladder" comment above. 'admin'/'manager' are DELIBERATELY excluded (kept
// "exactly as they were", per that same file-header note) -- their level never gets reconciled.
const LADDER_ROLE_IDS = new Set(['owner', 'vp', 'do', 'om', 'area_supervisor', 'gm', 'sm_am_dm']);

// A second, real bug found live alongside the masking one above (2026-08-26): 'area_supervisor'
// already existed in production's persisted role list BEFORE #148 (level 3, its pre-ladder
// value) -- mergeMissingDefaultRoles() correctly left it untouched since it wasn't MISSING, but
// #148 re-leveled area_supervisor to 5 as part of the real ladder, so the stale persisted level
// silently survived and made Area Supervisor outrank OM (level 4) -- backwards from the intended
// AS -> OM -> DO -> VP -> Owner reporting chain, confirmed live via the Roles & Permissions panel
// (Area Supervisor showed Level 3, tied with DO, above OM's Level 4). Unlike label/color/
// permissions (which may be real org customizations, left alone), `level` is structurally
// load-bearing for every levelsAbove()/canOverrideLockedActual() ladder-distance calculation, so
// it is reconciled to the canonical DEFAULT_ROLES value for the 7 official ladder ids ONLY --
// 'admin'/'manager' keep whatever level they were persisted with, matching #148's explicit design.
export function reconcileLadderLevels(roles) {
  return roles.map(r => {
    if (!LADDER_ROLE_IDS.has(r.id)) return r;
    const canonical = DEFAULT_ROLES.find(d => d.id === r.id);
    if (!canonical || r.level === canonical.level) return r;
    return { ...r, level: canonical.level };
  });
}

export function getOrgRoles() {
  try {
    const raw = localStorage.getItem(ORG_ROLES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return reconcileLadderLevels(mergeMissingDefaultRoles(parsed));
    }
  } catch {}
  return DEFAULT_ROLES.map(r => ({ ...r, permissions: { ...r.permissions } }));
}

export function saveOrgRoles(roles) {
  try { localStorage.setItem(ORG_ROLES_KEY, JSON.stringify(roles)); } catch {}
}

export async function syncOrgRolesFromSupabase(sb) {
  if (!sb) return null;
  try {
    const { data } = await sb.from('org_config').select('data').eq('key', 'org_roles').maybeSingle();
    if (data?.data && Array.isArray(data.data) && data.data.length) {
      const merged = reconcileLadderLevels(mergeMissingDefaultRoles(data.data));
      saveOrgRoles(merged);
      return merged;
    }
  } catch {}
  return null;
}

export async function pushOrgRolesToSupabase(sb, roles) {
  if (!sb) return;
  try {
    await sb.from('org_config').upsert({
      key: 'org_roles', data: roles, updated_at: new Date().toISOString(),
    });
  } catch {}
}

// ── Permission checks ──────────────────────────────────────────────────────────
export function getRoleById(roleId, roles) {
  return (roles || getOrgRoles()).find(r => r.id === roleId) || null;
}

export function hasPermission(roleId, permKey, roles) {
  const role = getRoleById(roleId, roles || getOrgRoles());
  if (!role) return false;
  if (role.level <= 1) return true; // level-1 roles bypass all checks
  return !!role.permissions?.[permKey];
}

// Returns true if myRole can manage targetRole (strictly lower authority → higher level number)
export function canManageRole(myRoleId, targetRoleId, roles) {
  const r = roles || getOrgRoles();
  const mine   = getRoleById(myRoleId, r);
  const target = getRoleById(targetRoleId, r);
  if (!mine || !target) return false;
  return mine.level < target.level;
}

// Default permissions for a brand-new role at a given level. Picks the closest built-in template
// at or below the requested level (i.e. the least-privileged built-in that's still >= as
// authoritative) so a new role dropped between two existing rungs gets a sane starting point --
// extended from a flat 3-way split to match the 7-rung ladder (dispatch #148).
export function defaultPermissionsForLevel(level) {
  if (level <= 1) return { ...ADMIN_PERMS };
  if (level <= 2) return { ...VP_PERMS };
  if (level <= 3) return { ...DO_PERMS };
  if (level <= 4) return { ...OM_PERMS };
  if (level <= 5) return { ...SUPERVISOR_PERMS };
  if (level <= 6) return { ...GM_PERMS };
  return { ...SM_AM_DM_PERMS };
}

// Generate a unique ID for a new role from its label
export function makeRoleId(label) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}_${suffix}`;
}
