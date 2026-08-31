// @ts-nocheck
// ── Shared report grouping (2026-08-31, owner request) ────────────────────────────────────────────
// "group items by recommendation per location to limit repetitiveness" — a flat table repeats the
// SAME recommendation/verdict text once per row, which reads as noise once a store has several
// items with the identical action. Groups rows first by LOCATION, then by a "grouping key" within
// that location (recommendation text for Missing Items, verdict text for Recount Impact) — so the
// text is stated once per group, followed by the items it covers. Generic over which field carries
// the key so both report panels share one implementation instead of two hand-rolled ones.
//
// Rows arrive already sorted by their caller (location -> class -> valueAtRisk, or class -> |Δ|) —
// this only re-groups, it never re-sorts, so that ordering survives inside each group.
export function groupRowsByLocationThenKey(rows, { key = 'recommendation' } = {}) {
  const byLoc = new Map();
  for (const r of (rows || [])) {
    const locId = r.loc;
    if (!byLoc.has(locId)) byLoc.set(locId, { loc: r.loc, storeName: r.storeName, org: r.org, groups: new Map() });
    const locEntry = byLoc.get(locId);
    const k = r[key] || '—';
    if (!locEntry.groups.has(k)) locEntry.groups.set(k, []);
    locEntry.groups.get(k).push(r);
  }
  return [...byLoc.values()].map(loc => ({
    loc: loc.loc, storeName: loc.storeName, org: loc.org,
    groups: [...loc.groups.entries()].map(([label, items]) => ({ label, items })),
  }));
}
