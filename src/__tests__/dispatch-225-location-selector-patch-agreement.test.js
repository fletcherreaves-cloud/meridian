// @ts-nocheck
// Dispatch #225 Task 1 — measure, don't assume, whether the stale blocker comment in
// eom-dashboard.js is still true. The comment claims LocationSelector's Patch tier
// (buildLocationHierarchy, src/components/PanelControls.js) sources from the STATIC
// INV_ORG_COORDS[loc].sup seed, while eom-dashboard.js's own bespoke patch filter reads the
// LIVE supervisorGroups()/orgAssignments() timeline, and that swapping to the shared
// LocationSelector without confirming the two agree risks silently mis-grouping a store on a
// financially-scoped filter (patch-scoped FOB reporting).
//
// buildLocationHierarchy's own header comment already says this was fixed under dispatch #139:
// its Patch tier is built via supervisorOf(l, meta.sup) — NOT a raw invOrgCoords[l].sup read —
// and supervisorOf() resolves LIVE via whoRan()/orgAssignments(), the exact same live source
// supervisorGroups() (what eom-dashboard.js's bespoke patch <select> reads today) is built on.
// "Should agree" is not "measured agrees" — this test is the actual per-store comparison for
// every real store in STORE_NAMES, run against the live (seed, in this sandbox — no Settings/
// Supabase override loaded) supervisorGroups()/orgAssignments() singleton.
import { describe, it, expect } from 'vitest';
import { STORE_NAMES, INV_ORG_COORDS, supervisorGroups } from '../constants.js';
import { buildLocationHierarchy } from '../components/PanelControls.js';

describe('dispatch #225 Task 1 — supervisorGroups() vs buildLocationHierarchy() patch agreement', () => {
  const allLocs = Object.keys(STORE_NAMES);

  it('every store in STORE_NAMES also has an INV_ORG_COORDS entry (else the two sources cannot be compared for it)', () => {
    const missing = allLocs.filter((l) => !INV_ORG_COORDS[l]);
    expect(missing).toEqual([]);
  });

  it('supervisorGroups() (the bespoke patch filter\'s live source) agrees, store-for-store, with buildLocationHierarchy()\'s Patch tier (the shared LocationSelector\'s live source)', () => {
    // (a) which patch supervisorGroups() lists each store under — the SAME lookup
    // eom-dashboard.js's own `patch` filter reads (patchGroups[patch] -> locs).
    const liveGroups = supervisorGroups() || {};
    const patchFromSupervisorGroups = {};
    for (const [sup, locs] of Object.entries(liveGroups)) {
      for (const l of (locs || [])) patchFromSupervisorGroups[String(l)] = sup;
    }

    // (b) which patch buildLocationHierarchy()'s tree puts each store under — the shared
    // LocationSelector's actual resolution (supervisorOf(loc, INV_ORG_COORDS[loc].sup)).
    const stores = allLocs.map((loc) => ({ loc }));
    const tree = buildLocationHierarchy(stores, INV_ORG_COORDS, STORE_NAMES);
    const patchFromHierarchy = {};
    for (const p of tree.patches) for (const l of p.locs) patchFromHierarchy[String(l)] = p.id;

    const mismatches = [];
    for (const loc of allLocs) {
      const a = patchFromSupervisorGroups[loc] ?? null;
      const b = patchFromHierarchy[loc] ?? null;
      if (a !== b) mismatches.push({ loc, name: STORE_NAMES[loc], supervisorGroups: a, buildLocationHierarchy: b });
    }

    // Record the exact result plainly (per CLAUDE.md's "measure it, don't reason about it" and
    // "a live-data claim must name the credential and the observation" standing rules) — this
    // assertion IS the Task 1 deliverable, not a side effect of it.
    if (mismatches.length) {
      // eslint-disable-next-line no-console
      console.log('[dispatch #225 Task 1] MISMATCH — do not proceed with Task 2 as scoped:', JSON.stringify(mismatches, null, 2));
    } else {
      // eslint-disable-next-line no-console
      console.log(`[dispatch #225 Task 1] AGREE — all ${allLocs.length} stores: supervisorGroups() and buildLocationHierarchy() resolve every store to the identical patch. The eom-dashboard.js blocker comment is stale (dispatch #139 already fixed what it warns about).`);
    }
    expect(mismatches).toEqual([]);
  });
});
