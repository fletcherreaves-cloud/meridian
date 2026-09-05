// scripts/browser-ecosure-bulk-capture.js
//
// NOT a Node script. This is a browser-console snippet: paste it into DevTools → Console on a
// signed-in propel.mcd.com tab (any page under /app works) and it downloads a seed file ready for
// scripts/import-ecosure-history.mjs.
//
// ── Why a console script, not a pull ────────────────────────────────────────────────────────────
// propel.mcd.com is corporate SSO (Entra/ADFS federation) with MFA enforced — there is no
// unattended-token path, so this can never become a GitHub Actions pull (see
// memory/finding-ecosure-propel-api-2026-08-22.md's security section; that conclusion is
// unchanged). This script instead automates the CAPTURE step for a human who is already signed
// in: one paste replaces "read a visitId off the UI, save one DevTools response, repeat" with a
// single run that walks every store and downloads one file.
//
// It calls fetch() with credentials: 'include' — the browser attaches the tab's own session
// cookies automatically. This script never reads document.cookie, never logs a header value, and
// never sends anything anywhere except the same propel.mcd.com read endpoints the Propel UI
// itself already calls when a person clicks through the Visit History page by hand.
//
// ── The enumeration chain (found 2026-09-04 from a live HAR capture) ───────────────────────────
//   1. getDescendants                      — every store's hierarchyNodeId under the operator root
//   2. getBrandProtectionVisits             — per store, ALL its graded visits (CFV/RGR/EcoSure/
//                                              RGR-Health&Safety mixed in one list) with visitId +
//                                              visitDate + visitTypeDescription
//   3. getThirdPartyFoodSafetyVisitReport   — per EcoSure visitId, the full per-question report
//
// getBrandProtectionVisits was previously recorded in this repo's memory as one of four
// "unexplored, deprioritized" store-level actions — nobody had actually called it. It turns out
// to BE the bulk EcoSure visit-list endpoint that file's own "open item 6" said did not exist:
// its visitTypeDescription: 'visits.thirdPartyFoodSafety' entries are exactly the EcoSure history,
// each with a visitId that feeds straight into getThirdPartyFoodSafetyVisitReport. See the
// "bulk visitId enumeration found" addendum in memory/finding-ecosure-propel-api-2026-08-22.md.
//
// ── Output ───────────────────────────────────────────────────────────────────────────────────
// Downloads ecosure-visits-seed.json in exactly memory/data/ecosure-visits-seed.json's shape:
// {_source, _captured, count, visits: [<raw getThirdPartyFoodSafetyVisitReport response>, ...]}.
// Each entry is the RAW response body (including its {results: {...}} wrapper) — do not unwrap it
// yourself; parseEcoSureVisit() (src/parsers/graded-visits.js) does that.
// To use: merge the downloaded `visits` array into memory/data/ecosure-visits-seed.json's own
// `visits` array (or replace it wholesale for a full re-capture — the import is idempotent either
// way), commit, then run:
//   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-ecosure-history.mjs

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
    ? `[ecosure-capture] using live v=${V} discovered from this page's own network activity`
    : `[ecosure-capture] no live v found on this page yet -- falling back to v=${V} (last known fresh 2026-09-04). If calls 409/400, reload the page, let it finish loading, then re-paste this script.`);
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
  // never sends. THE ACTUAL FIX for the live 400 Bad Request this script first hit (2026-09-04):
  // rowsPerPage=20 alone wasn't it -- a request with the byte-identical query string as a proven-
  // working real capture still 400'd without these headers, confirming the server requires them.
  // Measured directly from the HAR: they reflect the CURRENT PAGE the signed-in user is on, not
  // the query's own target params -- e.g. a getDescendants call for the operator's stores fired
  // headers for the operator root while the user was on that page, and the SAME action fired
  // headers for a specific STORE once the user had navigated to that store's page. So there's no
  // single "correct" value tied to a query -- passing a node the session legitimately has access
  // to is what satisfies it. Using the operator root for the store-list call and each visited
  // store's own node for its per-store calls mirrors exactly what the real navigation produced.
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

  console.log('[ecosure-capture] fetching store list...');
  // rowsPerPage=20 -- the exact value the real HAR capture that found this chain used
  // (rowsPerPage=100 was tried first and also got a 400, before the header requirement above was
  // found -- keeping this at the proven value rather than guessing a bigger number again).
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
  console.log(`[ecosure-capture] ${stores.length} store(s) found`);

  const allVisits = [];
  let ecoVisitIdCount = 0;
  for (const store of stores) {
    const storeCtx = { level: STORE_LEVEL, node: store.hierarchyNodeId };
    await sleep(DELAY_MS);
    let bpv;
    try {
      bpv = await getJson('visits', { action: 'getBrandProtectionVisits', locationId: store.hierarchyNodeId, cultureName: 'en-US' }, storeCtx);
    } catch (e) {
      console.warn(`[ecosure-capture] ${store.hierarchyNodeName}: getBrandProtectionVisits failed — ${e.message}`);
      continue;
    }
    const ecoVisits = (bpv.brand_protection_visits || []).filter(v => v.visitTypeDescription === 'visits.thirdPartyFoodSafety');
    console.log(`[ecosure-capture] ${store.hierarchyNodeName}: ${ecoVisits.length} EcoSure visit(s)`);
    for (const ev of ecoVisits) {
      ecoVisitIdCount++;
      await sleep(DELAY_MS);
      try {
        const report = await getJson('visits', { action: 'getThirdPartyFoodSafetyVisitReport', visitId: String(ev.visitId), cultureName: 'en-US' }, storeCtx);
        allVisits.push(report); // RAW envelope, {results:{...}} wrapper and all
      } catch (e) {
        console.warn(`[ecosure-capture]   visitId=${ev.visitId} report fetch failed — ${e.message}`);
      }
    }
  }

  console.log(`[ecosure-capture] done: ${allVisits.length}/${ecoVisitIdCount} visit report(s) captured across ${stores.length} store(s)`);

  const seed = {
    _source: 'propel.mcd.com /api/visits?action=getThirdPartyFoodSafetyVisitReport&visitId=<id>&cultureName=en-US (bulk-enumerated via getBrandProtectionVisits)',
    _captured: new Date().toISOString().slice(0, 10),
    count: allVisits.length,
    visits: allVisits,
  };
  const blob = new Blob([JSON.stringify(seed, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ecosure-visits-seed.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  console.log('[ecosure-capture] download triggered: ecosure-visits-seed.json');
})();
