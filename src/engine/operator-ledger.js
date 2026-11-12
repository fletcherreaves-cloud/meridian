// @ts-nocheck
// The Ledger — the Operator home screen (owner request 2026-11-07, "dream up a version that is
// operator specific... here is how MY stores are doing"; mockup built 2026-11-08 as the 5th Four
// Decks deck, memory/plan-operator-ledger-mockup-2026-11-08.md; wired for real same day once the
// owner picked the no-DDL path — self-service `operator_group` user_settings key, not a new RBAC
// role). Pure data layer only; src/views/operator-ledger-view.js owns rendering.
//
// An operator's footprint is NOT one territory the way a supervisor's patch is — it can span
// multiple states with real distance between them (Ryan Thorley: 9 Oklahoma stores + 3 Florida
// Panhandle stores, ~800 road miles apart per the owner's own correction to the mockup's number).
// So this module groups by each store's real INV_ORG_COORDS `state`, computes the SAME rollup
// math The Patch already uses (dollar-weighted vs-LY, never averaged per-store) independently
// PER REGION — never one shape stretched across a gap that doesn't exist on the ground.
import { INV_ORG_COORDS, unpadLoc, operatorGroups } from '../constants.js';
import { computePatchRollup, computePatchMap, rankNeedsAttention } from './patch-plan.js';

export { rankNeedsAttention };

// This operator's own stores, from the real live-or-seed operatorGroups() map — never a second,
// parallel grouping. A loc in the group with no matching brief store (not yet reporting/no data
// stream) is simply absent, same as every other altitude in this app.
// No operatorGroup set (owner request 2026-11-12 -- OM/DO/VP cascading scope flexibility on The
// Ledger, which never self-identifies as one fixed real operator) means "no operator-identity
// filter" -- pass `stores` through unfiltered rather than matching against an empty locs set.
// Every existing caller already guards this call behind a truthy operatorGroup check of its own
// (curated-home.js's huddleStores), so this only changes behavior for the new caller that doesn't.
export function operatorStores(stores, operatorGroup) {
  if (!operatorGroup) return stores || [];
  const locs = new Set((operatorGroups()[operatorGroup] || []).map(unpadLoc));
  return (stores || []).filter(s => locs.has(unpadLoc(s.loc)));
}

// Group an operator's stores by their real INV_ORG_COORDS `state` -- one real rollup + one real
// map per region, each computed independently (computePatchRollup/computePatchMap, unchanged,
// reused verbatim) so a region's own numbers are never diluted by or stretched to fit another.
// A store missing from INV_ORG_COORDS entirely is dropped from every region, same as the map's
// own existing "no fabricated placement" rule.
export function operatorRegions(stores) {
  const withData = (stores || []).filter(s => s.hasData);
  const byState = new Map();
  for (const s of withData) {
    const c = INV_ORG_COORDS[String(s.loc)] || INV_ORG_COORDS[unpadLoc(s.loc)];
    if (!c || !c.state) continue;
    if (!byState.has(c.state)) byState.set(c.state, []);
    byState.get(c.state).push(s);
  }
  return [...byState.entries()]
    .map(([state, regionStores]) => ({
      state, storeCount: regionStores.length,
      rollup: computePatchRollup(regionStores),
      mapPoints: computePatchMap(regionStores),
    }))
    .sort((a, b) => b.storeCount - a.storeCount);
}

// Real great-circle distance (haversine) between two regions' own store centroids -- straight-
// line, labeled as such; never presented as road distance, which this app has no routing data
// to compute honestly. Returns null for anything other than exactly 2 regions (a 1-region
// operator has nothing to compare; 3+ regions don't currently occur in this org and wording a
// single "apart" figure for N>2 isn't a case worth inventing UI for yet).
const EARTH_RADIUS_MI = 3958.8;
function toRad(d) { return d * Math.PI / 180; }
function centroid(points) {
  const n = points.length;
  return { lat: points.reduce((a, p) => a + p.lat, 0) / n, lng: points.reduce((a, p) => a + p.lng, 0) / n };
}
function haversineMi(a, b) {
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
export function distanceBetweenRegions(regions) {
  if (!regions || regions.length !== 2) return null;
  const [a, b] = regions;
  if (!a.mapPoints?.length || !b.mapPoints?.length) return null;
  return Math.round(haversineMi(centroid(a.mapPoints), centroid(b.mapPoints)));
}

// Every real operator's own dollar-weighted vs-LY, ranked -- "where do I stand among the other
// operators" (the one thing genuinely unique to this tier: a DO doesn't see another DO's patch,
// but an owner comparing against the other owners is how this org already talks performance).
// Needs the FULL district's stores (not just the viewer's own operator's), which an owner/VP/
// admin-tier account's RLS scope already provides -- no new data read.
export function operatorPeerComparison(allStores, viewerOperatorGroup) {
  return Object.keys(operatorGroups())
    .map(op => {
      const s = operatorStores(allStores, op).filter(x => x.hasData);
      const rollup = computePatchRollup(s);
      return { operator: op, vsLYPct: rollup.vsLYPct, storeCount: s.length, isViewer: op === viewerOperatorGroup };
    })
    .filter(p => p.storeCount > 0)
    .sort((a, b) => (b.vsLYPct ?? -Infinity) - (a.vsLYPct ?? -Infinity));
}
