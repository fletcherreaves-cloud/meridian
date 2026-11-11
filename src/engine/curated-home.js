// @ts-nocheck
// ── Curated Home Phase 1 (memory/plan-overnight-notes-72-2026-11-06.md §2, task #92) ────────────
// Role-cascaded VOICE layered on top of Morning Brief's already-proven correlation engine
// (computeMorningBrief(), src/features/morning-brief.js) -- not a new data source, not a new
// rules engine. Same underlying flags, different altitude of language, per CLAUDE.md's standing
// "Voice by role" rule: the number and the decision stay exact at every altitude; only the words
// around them change. Phase 2 (login-timing prediction, behavioral tracking) is explicitly out of
// scope here -- see the plan doc's own phasing.
//
// RBAC already decides WHICH stores a caller's `ds` covers (accessible_locs/RLS) -- this module
// never re-derives "my patch" or re-scopes data. It only decides HOW to narrate whatever
// computeMorningBrief() already returned: one tactical item per store (store altitude), or one
// pattern item per rule aggregated across every store that actually has data (patch/district
// altitude).

import { supervisorGroups, unpadLoc } from '../constants.js';

const SEV_RANK = { RED: 2, AMBER: 1, GREEN: 0 };

// Role -> altitude. Real DEFAULT_ROLES ids only (src/engine/permissions.js) -- never a parallel
// taxonomy. An unrecognized role id fails toward 'store' (the most tactical, least-presumptuous
// framing), mirroring hasPermission()'s own fail-closed convention for an unknown role.
const ALTITUDE_BY_ROLE = {
  gm: 'store', sm_am_dm: 'store', manager: 'store',
  area_supervisor: 'patch', om: 'patch', do: 'patch',
  vp: 'district', owner: 'district', admin: 'district',
};

export function altitudeForRole(roleId) {
  return ALTITUDE_BY_ROLE[roleId] || 'store';
}

// Narration WORD, separate from altitude (owner-corrected 2026-11-11, fresh-eyes role audit).
// CLAUDE.md's own RBAC table documents `do` as "District-level" scope, but ALTITUDE_BY_ROLE
// above buckets it into 'patch' altitude (correctly -- its aggregation/grouping logic, how many
// stores share a flag, is identical for a supervisor's patch and a DO's whole district, and `do`
// genuinely sees a bigger `ds` than an Area Supervisor via its own accessible_locs/RLS scope, not
// via anything this file does). What was wrong is narrower: patternItems() used to derive the
// WORD "patch" straight from altitude, so a DO's own home screen literally called their district
// a "patch" -- exactly the kind of org-chart-language mismatch the person being addressed is
// most likely to notice. Only the word changes here; `altitude` (the aggregation branch + the
// `scope:` field on each returned item) is untouched, so `do` still gets patch-shaped grouping,
// just district-shaped words.
function altWordForRole(roleId) {
  return roleId === 'do' ? 'district' : altitudeForRole(roleId) === 'district' ? 'district' : 'patch';
}

// Altitude-aware default landing (fresh-eyes role audit, 2026-11-11 --
// memory/finding-fresh-eyes-role-audit-2026-11-11.md §4, owner-approved "implement all of the
// items"). Pure predicate, extracted out of App.js's mount effect so it's unit-testable without
// mounting the full App component (no existing test in this repo does that, and inventing that
// harness for one conditional would be disproportionate -- see this dispatch's own commit body).
// `routePanel === null && view === 'command'` is the real signal that nothing has already
// claimed the landing slot -- both of those state values are THEMSELVES the synchronous
// resolution of the user's own explicit defaultLandingPanel preference (App.js's routePanel/view
// useState initializers already read it before this predicate is ever consulted), so this never
// overrides an explicit choice, it only fills the gap an unset one leaves. District altitude is
// deliberately excluded -- AtAGlance stays the unchanged default there, per the audit's own
// recommendation (closest to what that altitude is already built for).
export function shouldDefaultToCuratedHome({ routePanel, view, roleId, hasBriefPerm }) {
  return routePanel === null && view === 'command' && altitudeForRole(roleId) !== 'district' && !!hasBriefPerm;
}

// View As Role sandbox scoping (owner bug report 2026-11-11: At A Glance + the global
// SwingAlarm banner leaked cross-store data while simulating a lower role -- the fix this
// panel's own scopedBrief already carries, extracted here so every other consumer of a plain
// store/loc list can reuse the identical semantics instead of re-deriving them). Returns the set
// of unpadded locs the simulated altitude should see, or null for "no restriction" (district
// altitude, or no simulation active -- a real, non-simulated GM/DO's own ds is already
// RLS-scoped this narrowly, so this is always a no-op for a real login).
export function viewAsAllowedLocs(altitude, viewAsScope) {
  if (!viewAsScope) return null;
  if (altitude === 'store') return new Set([unpadLoc(viewAsScope)]);
  if (altitude === 'patch') return new Set((supervisorGroups()[viewAsScope] || []).map(unpadLoc));
  return null;
}

// 'store' altitude -- one item per flag, for every store that actually has data, reusing Morning
// Brief's own wording near-verbatim (it's already tactical, one-store, "do X because Y" -- this
// altitude IS what Morning Brief already writes). storesAffected is always exactly one store.
function storeItems(stores) {
  const items = [];
  for (const st of stores) {
    if (!st.hasData) continue;
    for (const f of st.flags) {
      items.push({
        id: st.loc + ':' + f.id, ruleId: f.id, severity: f.severity, category: f.category, icon: f.icon,
        headline: f.headline, detail: f.detail, action: f.action,
        scope: 'store', storesAffected: [st.name || st.loc],
      });
    }
  }
  return items.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);
}

// 'patch'/'district' altitude -- group every flag that fired ANYWHERE among the stores with real
// data, by rule id, so the same bug across N stores becomes ONE pattern item, not N tactical
// one-liners. The headline is regenerated at pattern altitude (never reuses one store's own
// headline, which embeds that store's specific live number -- e.g. "19s over target" -- as if it
// applied to every affected store). detail/action ARE reused verbatim from one representative
// flag: MORNING_RULES writes those two fields generically per severity tier (coaching/
// investigation guidance), not per live numeric value, so they stay accurate at any altitude --
// only the number-bearing headline needed resynthesis. Affected store names are always listed so
// a reader can drill into any one store's own exact figure.
function patternItems(stores, altitude, altWord) {
  const withData = stores.filter(s => s.hasData);
  const total = withData.length;
  const byRule = new Map();
  for (const st of withData) {
    for (const f of st.flags) {
      if (!byRule.has(f.id)) byRule.set(f.id, { rule: f, hits: [] });
      byRule.get(f.id).hits.push(st);
    }
  }
  const items = [];
  for (const [ruleId, { rule, hits }] of byRule) {
    const n = hits.length;
    const worstSev = hits.some(s => (s.flags.find(f => f.id === ruleId) || {}).severity === 'RED') ? 'RED' : 'AMBER';
    const names = hits.map(s => s.name || s.loc);
    const headline = (n === total && total > 1)
      ? `${rule.name} is showing across all ${total} stores in your ${altWord} — this isn't a one-store issue`
      : `${n} of ${total} store${total === 1 ? '' : 's'} in your ${altWord} ${n === 1 ? 'is' : 'are'} flagging ${rule.name}`;
    items.push({
      id: ruleId, ruleId, severity: worstSev, category: rule.category, icon: rule.icon,
      headline, detail: rule.detail, action: rule.action,
      scope: altitude, storesAffected: names,
    });
  }
  return items.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.storesAffected.length - a.storesAffected.length);
}

// Build the role-voice item list from computeMorningBrief()'s own output (`brief.stores`).
// Returns { altitude, items, summary } -- `summary` is brief.summary, passed through unchanged
// (the counts are facts, not voice, so there is nothing to rewrite about them).
export function buildCuratedHomeItems(brief, roleId) {
  const altitude = altitudeForRole(roleId);
  const stores = (brief && brief.stores) || [];
  const items = altitude === 'store' ? storeItems(stores) : patternItems(stores, altitude, altWordForRole(roleId));
  return { altitude, items, summary: (brief && brief.summary) || { red: 0, amber: 0, green: 0, noData: 0, totalFlags: 0 } };
}
