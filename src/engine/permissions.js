// Meridian — Permission Engine
// Roles are org-configurable (not hardcoded). Each role has a level (lower = more authority),
// a set of permission toggles, and optional metadata. Level 1 roles always bypass all checks.

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

export const ROLE_PERMISSION_TEMPLATES = {
  admin:      ADMIN_PERMS,
  supervisor: SUPERVISOR_PERMS,
  manager:    MANAGER_PERMS,
};

// ── Built-in roles ─────────────────────────────────────────────────────────────
export const DEFAULT_ROLES = [
  { id: 'admin',           label: 'Admin',           level: 1, color: '#f59e0b', system: true,  permissions: ADMIN_PERMS },
  { id: 'area_supervisor', label: 'Area Supervisor',  level: 2, color: '#3b82f6', system: false, permissions: SUPERVISOR_PERMS },
  { id: 'manager',         label: 'Manager',          level: 3, color: '#22c55e', system: false, permissions: MANAGER_PERMS },
];

// ── Persistence ────────────────────────────────────────────────────────────────
export function getOrgRoles() {
  try {
    const raw = localStorage.getItem(ORG_ROLES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
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
      saveOrgRoles(data.data);
      return data.data;
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

// Default permissions for a brand-new role at a given level
export function defaultPermissionsForLevel(level) {
  if (level <= 1) return { ...ADMIN_PERMS };
  if (level <= 2) return { ...SUPERVISOR_PERMS };
  return { ...MANAGER_PERMS };
}

// Generate a unique ID for a new role from its label
export function makeRoleId(label) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}_${suffix}`;
}
