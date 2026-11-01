// @ts-nocheck
// Custom location groups (owner req, 2026-11-01, from a QSRSoft screenshot): "a selected group
// of restaurants of user choice" -- an ad hoc, user-named, saveable set of stores that behaves
// like a 6th grouping dimension (Location/Patch/Operator/Organization already exist as fixed
// splits; this is the one the user defines themselves), reusable across panels, not re-picked
// every time. Persisted shared (not per-user) in org_config key 'custom_location_groups' --
// same table/shape supervisorGroups/operators/eom_digest_config already use for app-wide,
// admin/area_supervisor-writable config (see src/lib/supabase.js's loadEomDigestConfig comment
// for why org_config, not user_settings: this is org structure, not a personal preference).
//
// Pure, no React/Supabase imports here -- src/lib/supabase.js owns the load/save round trip
// (loadCustomLocationGroups/saveCustomLocationGroups), this file owns the CRUD + grouping math,
// same split as every other engine module in this codebase.

// Generates a short, unique-enough id. Not a UUID (no crypto.randomUUID dependency needed here,
// and these ids never leave this tenant's single org_config row) -- timestamp + random suffix is
// enough to avoid collision within one admin's own edit session.
export function newGroupId() {
  return 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// Pure CRUD over the groups array -- every call returns a NEW array (immutable update), matching
// this codebase's settings-merge convention elsewhere (App.js's {...prev,...} spreads).
export function addLocationGroup(groups, { name, locs }) {
  const g = (groups || []).slice();
  const now = new Date().toISOString();
  g.push({ id: newGroupId(), name: String(name || '').trim() || 'Untitled Group', locs: (locs || []).map(String), createdAt: now, updatedAt: now });
  return g;
}
export function updateLocationGroup(groups, id, patch) {
  return (groups || []).map(g => g.id === id
    ? { ...g, ...patch, locs: patch.locs ? patch.locs.map(String) : g.locs, updatedAt: new Date().toISOString() }
    : g);
}
export function removeLocationGroup(groups, id) {
  return (groups || []).filter(g => g.id !== id);
}

// ── Grouping — the consolidation at the heart of the "move total company performance off the
// individual location tiles" request: Supervisor/Operator/Organization Performance Summary used
// to be three separate, near-identical fixed sections in store-analytics.js's Enterprise
// Overview (each computing the same Stores/4-Wk Sales/Ops Score/T2W Trend tile shape over a
// different grouping). This is the ONE function that produces that tile list for whichever
// grouping dimension the panel's selector is currently set to.
//
// `allStores` is the pipeline's buildStore() output array (pSales/opsScore/ctrlScore/p.t2w per
// store) -- the same shape all three predecessor sections already consumed.
// `opts`: { supervisorGroupsLive, operatorGroupsFn, getStoreOrgFn, customGroups } -- the live
// resolvers are passed in (not imported here) so this stays a pure function callers can unit-test
// without constants.js's live module-level state, and so a caller can pass a snapshot instead of
// the always-current live value if it ever needs to (none do today).
//
// 'organization' intentionally covers what QSRSoft's own picker lists as two separate dimensions
// (State and Organization) -- for THIS fleet they are the same 1:1 partition (MCDOK = Oklahoma,
// Emerald Arches = Florida, constants.js's getStoreOrg/CLAUDE.md's own canonical mapping), so a
// separate 'state' mode would render byte-identical groups under a different name. One mode,
// not two redundant ones.
export function buildGroupSections(mode, allStores, opts = {}) {
  const stores = (allStores || []).filter(s => /^\d+$/.test(String(s.loc)));
  const { supervisorGroupsLive, operatorGroupsFn, getStoreOrgFn, customGroups } = opts;

  if (mode === 'location') {
    return stores.map(s => ({ key: s.loc, name: s.name || s.loc, stores: [s] }));
  }
  if (mode === 'patch') {
    const groups = supervisorGroupsLive || {};
    return Object.entries(groups)
      .map(([name, locs]) => ({ key: name, name, stores: stores.filter(s => (locs || []).includes(s.loc)) }))
      .filter(g => g.stores.length);
  }
  if (mode === 'operator') {
    const opOf = operatorGroupsFn; // function(loc) -> operator name | null
    const byOp = {};
    stores.forEach(s => {
      const op = typeof opOf === 'function' ? opOf(s.loc) : null;
      if (!op) return;
      (byOp[op] ||= []).push(s);
    });
    return Object.entries(byOp).map(([name, grpStores]) => ({ key: name, name, stores: grpStores }));
  }
  if (mode === 'organization') {
    const orgOf = getStoreOrgFn;
    const byOrg = { mcdok: [], emerald: [] };
    stores.forEach(s => {
      const org = typeof orgOf === 'function' ? orgOf(s.loc) : null;
      if (org === 'emerald') byOrg.emerald.push(s); else byOrg.mcdok.push(s);
    });
    const out = [];
    if (byOrg.mcdok.length) out.push({ key: 'mcdok', name: 'MCDOK — Oklahoma', stores: byOrg.mcdok });
    if (byOrg.emerald.length) out.push({ key: 'emerald', name: 'Emerald Arches — Florida', stores: byOrg.emerald });
    return out;
  }
  if (mode === 'custom') {
    return (customGroups || []).map(g => ({
      key: g.id, name: g.name, stores: stores.filter(s => (g.locs || []).includes(s.loc)),
    }));
  }
  return [];
}

// Pure aggregate for one group's card (the shared Stores/4-Wk Sales/Ops Score/T2W Trend shape
// every predecessor section already computed identically three times).
export function summarizeGroup(groupStores) {
  const n = (groupStores || []).length;
  const totalSales = (groupStores || []).reduce((a, s) => a + (s.pSales || 0), 0);
  const avgOps = n ? (groupStores.reduce((a, s) => a + (s.opsScore || 0), 0) / n) : null;
  const trendStores = (groupStores || []).filter(s => s.p && s.p.t2w != null);
  const avgTrend = trendStores.length ? (trendStores.reduce((a, s) => a + s.p.t2w, 0) / trendStores.length) : null;
  return { n, totalSales, avgOps, avgTrend };
}
