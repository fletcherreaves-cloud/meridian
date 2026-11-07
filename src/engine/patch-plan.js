// @ts-nocheck
// The Patch — DO/OM/Area Supervisor front door (owner request 2026-11-07, following the "Four
// Decks" mockup + "build The Patch next"). Pure data layer only; src/views/patch-plan-view.js
// owns rendering.
//
// Takes `brief.stores` (src/features/morning-brief.js's computeMorningBrief() output) directly,
// not the pattern-grouped `items` buildCuratedHomeItems() produces at patch altitude -- a
// territory map needs each store's OWN status, and patternItems() deliberately collapses that
// into "N of M stores flagging rule X" (right for a text list, wrong for a map). Every field
// used here (sales, vsLYSales, laborPct, smgOsat, severity) is already computed per store by
// assembleBriefStoreData() -- no second data read, no new resolution logic.
import { INV_ORG_COORDS, unpadLoc } from '../constants.js';

// Dollar-weighted patch vs-LY (CLAUDE.md's standing "dollar-weight aggregates, never average
// averages" rule) -- sums this-store's real $ and its implied LY $ (derived from the matched-
// day vsLYSales% assembleBriefStoreData already computed) only across stores that actually have
// a real LY comparison, then takes ONE ratio of the two sums. Never averages the per-store
// percentages directly, which would let a tiny store's swing outweigh the patch's biggest store.
export function computePatchRollup(stores) {
  const withData = (stores || []).filter(s => s.hasData);
  let curForLY = 0, lyTotal = 0;
  for (const s of withData) {
    if (s.sales > 0 && s.vsLYSales != null) {
      curForLY += s.sales;
      lyTotal += s.sales / (1 + s.vsLYSales / 100);
    }
  }
  const vsLYPct = lyTotal > 0 ? ((curForLY - lyTotal) / lyTotal * 100) : null;
  const totalSales = withData.reduce((a, s) => a + (s.sales || 0), 0);

  const laborVals = withData.map(s => s.laborPct).filter(v => v != null);
  const laborPct = laborVals.length ? laborVals.reduce((a, b) => a + b, 0) / laborVals.length : null;

  const osatVals = withData.map(s => s.smgOsat).filter(v => v != null);
  const smgOsat = osatVals.length ? osatVals.reduce((a, b) => a + b, 0) / osatVals.length : null;

  const needsAttention = withData.filter(s => s.severity === 'RED' || s.severity === 'AMBER').length;

  return { totalSales, vsLYPct, laborPct, smgOsat, needsAttention, storeCount: withData.length };
}

// Real geographic placement from INV_ORG_COORDS (src/constants.js) -- never a fabricated
// territory shape. A simple min/max normalization within the patch's own bounding box; fine at
// this scale (a handful of stores within one supervisor's patch, not a statewide projection).
// A store missing from INV_ORG_COORDS is dropped, not placed at a guessed position.
export function computePatchMap(stores) {
  const points = (stores || []).map(s => {
    const c = INV_ORG_COORDS[String(s.loc)] || INV_ORG_COORDS[unpadLoc(s.loc)];
    if (!c || c.lat == null || c.lng == null) return null;
    return { loc: s.loc, name: s.name, severity: s.severity, lat: c.lat, lng: c.lng };
  }).filter(Boolean);
  if (!points.length) return [];
  const lats = points.map(p => p.lat), lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const latSpan = Math.max(maxLat - minLat, 0.03);
  const lngSpan = Math.max(maxLng - minLng, 0.03);
  return points.map(p => ({
    ...p,
    x: (p.lng - minLng) / lngSpan,
    // SVG y grows downward; north (higher latitude) should plot higher (smaller y).
    y: 1 - (p.lat - minLat) / latSpan,
  }));
}

const SEV_RANK = { RED: 2, AMBER: 1, GREEN: 0, NODATA: -1 };

// Ranked "needs you today" list -- RED stores first, then AMBER, each with its own real top
// flag headline (never a generic placeholder). GREEN/NODATA stores never appear here; the map
// is where a GM's all-clear status actually shows.
export function rankNeedsAttention(stores) {
  return (stores || [])
    .filter(s => s.hasData && (s.severity === 'RED' || s.severity === 'AMBER'))
    .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity])
    .map(s => ({
      loc: s.loc, name: s.name, severity: s.severity,
      why: s.flags?.[0]?.headline || null,
      moreCount: Math.max(0, (s.flags?.length || 0) - 1),
    }));
}
