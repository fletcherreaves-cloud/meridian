// @ts-nocheck
// #181 (2026-08-11): replaces park's former role as a scored computeOpsScore component (see the
// removal comment in engine/pipeline.js). Parking is an intentional tool — the owner's own words:
// "keep the wheels moving... park cars with complex orders or other operational barriers" — so
// park% alone can't say whether a store is using the tool well or stalling the line. Pairing it
// with OEPE (flow, excluding parked time — utils/oepe.js, #183) into a 2x2 read answers that.
//
// Measured against real data (issue #181's final comment, 27 stores, 90d DAR park% x QSRSoft
// Service-report OEPE): the district's heaviest parkers (Elgin 30.5%, Ponce de Leon 33.6%) also
// beat the median on flow — the tool working as intended — while some near-zero parkers
// (Cottondale, Lindsay, Purcell) sat at/better than median flow too, refuting "under-parking
// always stalls the line." A single-axis band scores both groups as failures; both are fine.
//
// District medians are RECOMPUTED from whatever rows are passed in — never frozen constants — so
// a store's quadrant is relative to its peers this period, matching the issue's explicit
// verification requirement ("medians recomputed per period rather than frozen").
//
// Quadrant semantics (park axis: at/above median = "parks a lot"; OEPE axis: at/below median =
// "flow good", since a LOWER OEPE second-count is faster/better):
//   A  high park, good flow — tool working: protecting the line. Look at production (KVS) —
//      parking is compensating for something upstream.
//   B  high park, bad flow  — parking AND still slow. Highest priority.
//   C  low park, good flow  — fast enough not to need the tool. Leave alone.
//   D  low park, bad flow   — not using the tool; line stalling. The real under-parking case.

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// rows: [{loc, park, oepe, ...}] — park is a 0-1 fraction, oepe is seconds (w/o park time).
// A row missing either value can't be classified or contribute to the median — it's returned
// separately in `excluded` so a caller can show "insufficient data" rather than silently drop it.
export function computeParkOepeQuadrants(rows) {
  const all = rows || [];
  const usable = all.filter(r => r && r.park != null && r.oepe != null);
  const excluded = all.filter(r => !(r && r.park != null && r.oepe != null));
  const parkMedian = median(usable.map(r => r.park));
  const oepeMedian = median(usable.map(r => r.oepe));
  const quadrants = { A: [], B: [], C: [], D: [] };
  const byLoc = {};
  for (const r of usable) {
    const highPark = r.park >= parkMedian;
    const goodFlow = r.oepe <= oepeMedian;
    const quadrant = highPark ? (goodFlow ? 'A' : 'B') : (goodFlow ? 'C' : 'D');
    const entry = { ...r, quadrant };
    quadrants[quadrant].push(entry);
    byLoc[r.loc] = entry;
  }
  return { medians: { park: parkMedian, oepe: oepeMedian }, quadrants, byLoc, excluded };
}

// Read/action text for each quadrant, matching the issue's own worklist framing — used by any
// UI surface so the interpretation isn't re-typed at every call site.
export const QUADRANT_READ = {
  A: { label: 'Parks a lot · flow good', read: 'Tool used heavily, flow protected.', action: 'Look at production (KVS) — parking is compensating for something upstream.' },
  B: { label: 'Parks a lot · flow bad', read: 'Parking AND still slow.', action: 'Highest priority.' },
  C: { label: 'Parks little · flow good', read: 'Fast enough not to need the tool.', action: 'Leave alone.' },
  D: { label: 'Parks little · flow bad', read: 'Not using the tool; line stalling.', action: 'Coach on pulling forward — the real under-parking case.' },
};
