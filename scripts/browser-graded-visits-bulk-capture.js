// scripts/browser-graded-visits-bulk-capture.js
//
// NOT a Node script. This is a browser-console snippet: paste it into DevTools → Console on a
// signed-in propel.mcd.com tab (any page under /app works) and it downloads a seed file ready for
// scripts/import-graded-visits-bulk.mjs.
//
// Supersedes scripts/browser-ecosure-bulk-capture.js's SCOPE (that script still works standalone
// for an EcoSure-only re-capture) by also pulling CFV and RGR/RGR-Health&Safety in the same run,
// so a full estate-wide refresh across all three report types is one paste + one download instead
// of three. Reuses that script's proven auth-header/pagination logic verbatim (confirmed working
// against real data 2026-09-04, 27/27 stores, 244 EcoSure visits) -- see that file's own header
// for the header-requirement investigation this inherits.
//
// ── Why a console script, not a pull ────────────────────────────────────────────────────────────
// propel.mcd.com is corporate SSO (Entra/ADFS federation) with MFA enforced — there is no
// unattended-token path, so this can never become a GitHub Actions pull (see
// memory/finding-ecosure-propel-api-2026-08-22.md's security section). This script automates the
// CAPTURE step for a human who is already signed in.
//
// It calls fetch() with credentials: 'include' — the browser attaches the tab's own session
// cookies automatically. This script never reads document.cookie, never logs a header value, and
// never sends anything anywhere except the same propel.mcd.com read endpoints the Propel UI
// itself already calls when a person clicks through the Visit History / CFV / RGR pages by hand.
//
// ── The enumeration chain (found 2026-09-04 from a live HAR capture) ───────────────────────────
//   1. getDescendants           — every store's hierarchyNodeId under the operator root
//   2. getCfvHistory            — per store, full CFV visit history (list rows carry every field
//                                  parseCfvBulkVisit() needs — no per-visit detail call)
//   3. getBrandProtectionVisits — per store, ALL its RGR/RGR-Health&Safety/EcoSure visits in one
//                                  list; RGR/RGR-HS list rows are ALSO already complete (no detail
//                                  call needed) -- only EcoSure needs step 4
//   4. getThirdPartyFoodSafetyVisitReport — per EcoSure visitId, the full per-question report
//
// ── Output ───────────────────────────────────────────────────────────────────────────────────
// Downloads graded-visits-bulk-seed.json in exactly memory/data/graded-visits-bulk-seed.json's
// shape: {_source, _captured, cfv: [{store,name,visit}], rgr: [{store,name,visit}],
// ecosure: [<raw getThirdPartyFoodSafetyVisitReport response>, ...]}.
// To use: merge into memory/data/graded-visits-bulk-seed.json (or replace wholesale -- the import
// is idempotent either way) via an UNCOMMITTED local path (GRADED_VISITS_BULK_SEED_PATH), commit
// nothing containing real captures, then run:
//   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-graded-visits-bulk.mjs

(async () => {
  // The Propel `v=` query param is a LIVE, DRIFTING build number, not a stable API version -- it
  // can go stale multiple times in one day (see browser-complaints-bulk-capture.js's dedicated
  // warning, discovered 2026-09-05, which applies to every Propel endpoint, not just complaints).
  // A hardcoded value is a losing game, so discover it fresh from this page's OWN already-made
  // /api/ calls instead -- the tab you paste this into has necessarily already loaded with the
  // current v. Falls back to a last-known value only if the page made no /api/ calls yet.
  const discoverLiveV = () => {
    try {
      for (const e of performance.getEntriesByType('resource')) {
        if (!e.name.includes('propel.mcd.com/api/')) continue;
        const m = /[?&]v=(\d+)/.exec(e.name);
        if (m) return m[1];
      }
    } catch (_) { /* ignore -- fall through to fallback */ }
    return null;
  };
  const LAST_KNOWN_V = '801'; // fallback only -- last confirmed fresh 2026-09-04
  const liveV = discoverLiveV();
  const V = liveV || LAST_KNOWN_V;
  console.log(liveV
    ? `[graded-visits-capture] using live v=${V} discovered from this page's own network activity`
    : `[graded-visits-capture] no live v found on this page yet -- falling back to v=${V} (last known fresh 2026-09-04). If calls 409/400, reload the page, let it finish loading, then re-paste this script.`);
  const ORG_ROOT_LEVEL = 11;
  // The operator root hierarchyNodeId — from the capture that found this chain. If this script is
  // ever run under a different signed-in role/operator, override it (visible in the URL/DevTools
  // as hierarchyNode= while on that operator's Home or Scored Visit Results page).
  const ORG_ROOT_NODE = '1000890759';
  const STORE_LEVEL = 12;
  const DELAY_MS = 250; // polite pacing -- no reason to hammer the API

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Every /api/ call the real app makes carries three custom headers -- hierarchy-level,
  // hierarchy-node, territory-code -- set by the app's own HTTP client, which a plain fetch()
  // never sends (see browser-ecosure-bulk-capture.js's own header comment for the full
  // investigation). They reflect the CURRENT PAGE the signed-in user is on, not the query's own
  // target params -- using the operator root for the store-list call and each store's own node
  // for its per-store calls mirrors what the real navigation produced.
  const TERRITORY_CODE = '840';
  const getJson = async (path, params, ctx) => {
    const qs = new URLSearchParams({ v: V, ...params }).toString();
    const res = await fetch(`https://propel.mcd.com/api/${path}?${qs}`, {
      credentials: 'include',
      headers: {
        accept: 'application/json',
        'hierarchy-level': String(ctx.level),
        'hierarchy-node': String(ctx.node),
        'territory-code': TERRITORY_CODE,
      },
    });
    if (!res.ok) throw new Error(`${res.status} on ${path}?${qs}`);
    return res.json();
  };

  console.log('[graded-visits-capture] fetching store list...');
  // rowsPerPage=20 -- the proven value (100 got a 400; see browser-ecosure-bulk-capture.js).
  const ROWS_PER_PAGE = 20;
  const rootCtx = { level: ORG_ROOT_LEVEL, node: ORG_ROOT_NODE };
  const stores = [];
  for (let page = 1; ; page++) {
    const desc = await getJson('navigation', {
      action: 'getDescendants', countryIsoNumber: '840',
      parentHierarchyLevel: String(ORG_ROOT_LEVEL), parentHierarchyNode: ORG_ROOT_NODE,
      childHierarchyLevel: String(STORE_LEVEL), orgRole: '1', page: String(page), rowsPerPage: String(ROWS_PER_PAGE),
    }, rootCtx);
    const pageResults = desc.results || [];
    stores.push(...pageResults);
    if (stores.length >= desc.totalCount || !pageResults.length) break;
    await sleep(DELAY_MS);
  }
  console.log(`[graded-visits-capture] ${stores.length} store(s) found`);

  // "03708 ARDMORE-BROADWAY" -> {nsn: "03708", name: "ARDMORE-BROADWAY"}. Falls back to the whole
  // string as the name (nsn null) if a store's name ever doesn't start with a bare NSN -- the
  // import script skips any entry with no store, so this fails safe rather than mis-tagging one.
  const splitStoreName = hierarchyNodeName => {
    const m = /^(\d+)\s+(.*)$/.exec(hierarchyNodeName || '');
    return m ? { nsn: m[1], name: m[2] } : { nsn: null, name: hierarchyNodeName || null };
  };

  const cfvOut = [];
  const rgrOut = [];
  const ecosureOut = [];
  let ecoVisitIdCount = 0;

  for (const store of stores) {
    const { nsn, name } = splitStoreName(store.hierarchyNodeName);
    const storeCtx = { level: STORE_LEVEL, node: store.hierarchyNodeId };

    await sleep(DELAY_MS);
    try {
      const cfv = await getJson('visits', { action: 'getCfvHistory', locationId: store.hierarchyNodeId, cultureName: 'en-US' }, storeCtx);
      const rows = cfv.cfv_history || [];
      for (const visit of rows) cfvOut.push({ store: nsn, name, visit });
      console.log(`[graded-visits-capture] ${store.hierarchyNodeName}: ${rows.length} CFV visit(s)`);
    } catch (e) {
      console.warn(`[graded-visits-capture] ${store.hierarchyNodeName}: getCfvHistory failed — ${e.message}`);
    }

    await sleep(DELAY_MS);
    let bpv;
    try {
      bpv = await getJson('visits', { action: 'getBrandProtectionVisits', locationId: store.hierarchyNodeId, cultureName: 'en-US' }, storeCtx);
    } catch (e) {
      console.warn(`[graded-visits-capture] ${store.hierarchyNodeName}: getBrandProtectionVisits failed — ${e.message}`);
      continue;
    }
    const allBpv = bpv.brand_protection_visits || [];
    const rgrVisits = allBpv.filter(v => v.visitTypeDescription === 'visits.runningGreatRestaurants' || v.visitTypeDescription === 'visits.rgrHealthAndSafety');
    const ecoVisits = allBpv.filter(v => v.visitTypeDescription === 'visits.thirdPartyFoodSafety');
    for (const visit of rgrVisits) rgrOut.push({ store: nsn, name, visit });
    console.log(`[graded-visits-capture] ${store.hierarchyNodeName}: ${rgrVisits.length} RGR/RGR-HS visit(s), ${ecoVisits.length} EcoSure visit(s)`);

    for (const ev of ecoVisits) {
      ecoVisitIdCount++;
      await sleep(DELAY_MS);
      try {
        const report = await getJson('visits', { action: 'getThirdPartyFoodSafetyVisitReport', visitId: String(ev.visitId), cultureName: 'en-US' }, storeCtx);
        ecosureOut.push(report); // RAW envelope, {results:{...}} wrapper and all
      } catch (e) {
        console.warn(`[graded-visits-capture]   visitId=${ev.visitId} report fetch failed — ${e.message}`);
      }
    }
  }

  console.log(`[graded-visits-capture] done: ${cfvOut.length} CFV, ${rgrOut.length} RGR/RGR-HS, ${ecosureOut.length}/${ecoVisitIdCount} EcoSure visit report(s) captured across ${stores.length} store(s)`);

  const seed = {
    _source: 'propel.mcd.com getCfvHistory + getBrandProtectionVisits (RGR/RGR-HS) + getThirdPartyFoodSafetyVisitReport (EcoSure detail)',
    _captured: new Date().toISOString().slice(0, 10),
    cfv: cfvOut,
    rgr: rgrOut,
    ecosure: ecosureOut,
  };
  const blob = new Blob([JSON.stringify(seed, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'graded-visits-bulk-seed.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  console.log('[graded-visits-capture] download triggered: graded-visits-bulk-seed.json');
})();
