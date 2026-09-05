// scripts/browser-complaints-bulk-capture.js
//
// NOT a Node script. This is a browser-console snippet: paste it into DevTools → Console on a
// signed-in propel.mcd.com tab (any page under /app works) and it downloads a seed file ready for
// scripts/import-complaints-history.mjs.
//
// Dispatch #231 (memory/dispatch-231-complaints-metric.md) Task 1. Backfills real customer
// complaint case data for review-engine.js's `complaints` metric (Complaint Contacts/100K), which
// currently has zero automated source (see memory/finding-complaints-propel-api-2026-08-26.md).
//
// ── Why a console script, not a pull ────────────────────────────────────────────────────────────
// propel.mcd.com is corporate SSO (Entra/ADFS federation) with MFA enforced — there is no
// unattended-token path (see finding-ecosure-propel-api-2026-08-22.md's security section, and
// finding-complaints-propel-api-2026-08-26.md's own "Integration constraints" section, which
// re-applies that same conclusion here without modification). This script automates the CAPTURE
// step for a human who is already signed in, using fetch() with credentials: 'include' so the
// browser tab's own session cookies attach automatically. It never reads document.cookie, never
// logs a header/cookie value, and — critically for this endpoint specifically — never logs the
// real `customerComments`/`abbreviatedCustomerComments` text (only counts and structural fields),
// matching this repo's established security posture for real customer-submitted free text.
//
// ── The enumeration chain (proven working, reused verbatim from browser-ecosure-bulk-capture.js) ─
//   1. GET /api/navigation?action=getDescendants&...   — every store's hierarchyNodeId under the
//      operator root (ORG_ROOT_NODE below), paginated. Identical chain already proven for EcoSure/
//      CFV/RGR; the same 27-store hierarchy-node map applies here (no new store enumeration work).
//   2. GET /api/customer-care?action=getCustomerCareRestaurantCaseList&locationId=<node>&...
//      — per-store complaint case list. CONFIRMED shape (finding-complaints-propel-api-2026-08-26.md):
//      {totalCount, results:[{locationId, parentCaseId, childCaseId, issueCode, issueSubCode,
//      incidentDate, receivedDate, caseStatus, abbreviatedCustomerComments, customerComments,
//      childCases:[]}]}. Pulls `timeFrame=5` (History — confirmed 2026-09-05 to be the widest
//      window, owner-verified against the real Timeframe dropdown) so a single capture backfills
//      everything; the app then buckets by `incidentDate` into whatever period a review needs
//      (owner's decided design, same finding file).
//
// ── rowsPerPage — confirmed NOT capped for this endpoint (unlike EcoSure's) ────────────────────
// Measured 2026-09-05: rowsPerPage=100 returned exactly min(100, totalCount), not an artificial
// ceiling below it. This script still pages defensively until results.length reaches totalCount
// (same discipline as every other bulk-capture script here) rather than trusting ROWS_PER_PAGE
// alone to be enough for every store.
//
// ── ⚠️ The `v=` query parameter is a LIVE, DRIFTING Propel build number, not a stable API version
// ── (discovered 2026-09-05, see the finding file's own dedicated note on this) ──────────────────
// v=786 (as of 2026-08-26) was already stale by 2026-09-05, when the real UI was sending v=802 for
// both `customer-care` and `navigation` calls. Every request using a stale `v` failed with a
// uniform 409 Conflict regardless of any other parameter — a version-gate rejection, not a data or
// auth problem. V below is only as fresh as this script's own last edit date (see below) — if
// every call in this script 409s, that is the first thing to suspect: open DevTools → Network,
// let any real Propel page load, find its own `v=` value on any `/api/` call, and update V here.
//
// ── Output ───────────────────────────────────────────────────────────────────────────────────
// Downloads complaints-seed.json in exactly memory/data/complaints-seed.json's shape:
// {_source, _captured, cases: [{store, name, case: <raw result entry>}, ...]} -- same {store,
// name, ...} wrapper convention as browser-graded-visits-bulk-capture.js, since customer-care's
// own response carries `locationId` (the hierarchy-node id) but not the NSN. `case` is the RAW
// `results[]` array element (including a populated `childCases[]` for a "Multiple Issues" case) —
// do not unwrap or flatten it here; scripts/import-complaints-history.mjs does that.
// To use: point COMPLAINTS_SEED_PATH at this downloaded file (a local, gitignored/uncommitted
// path — NEVER the committed memory/data/complaints-seed.json, which must stay an empty shell),
// then run:
//   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... COMPLAINTS_SEED_PATH=/path/to/file \
//     node scripts/import-complaints-history.mjs

(async () => {
  const V = '802'; // last confirmed fresh 2026-09-05 -- SEE THE WARNING ABOVE if this 409s
  const ORG_ROOT_LEVEL = 11;
  const ORG_ROOT_NODE = '1000890759'; // same operator root as every other Propel script here
  const STORE_LEVEL = 12;
  const TERRITORY_CODE = '840';
  const TIME_FRAME = 5; // History -- confirmed the widest window, owner-verified 2026-09-05
  const ROWS_PER_PAGE = 100; // generous; not capped for this endpoint, but paged defensively below
  const DELAY_MS = 250; // polite pacing -- no reason to hammer the API

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const getJson = async (path, params, ctx) => {
    const qs = new URLSearchParams({ v: V, ...params }).toString();
    const res = await fetch(`https://propel.mcd.com/api/${path}?${qs}`, {
      credentials: 'include',
      headers: {
        accept: 'application/json',
        'hierarchy-level': String(ctx.level),
        'hierarchy-node': String(ctx.node),
        'territory-code': TERRITORY_CODE,
        'x-accept-encoding': 'gzip',
      },
    });
    if (!res.ok) throw new Error(`${res.status} on ${path}?${qs}`);
    return res.json();
  };

  console.log('[complaints-capture] fetching store list...');
  const ROWS_PER_PAGE_STORES = 20; // proven value for navigation/getDescendants (see ecosure script)
  const rootCtx = { level: ORG_ROOT_LEVEL, node: ORG_ROOT_NODE };
  const stores = [];
  for (let page = 1; ; page++) {
    const desc = await getJson('navigation', {
      action: 'getDescendants', countryIsoNumber: '840',
      parentHierarchyLevel: String(ORG_ROOT_LEVEL), parentHierarchyNode: ORG_ROOT_NODE,
      childHierarchyLevel: String(STORE_LEVEL), orgRole: '1', page: String(page), rowsPerPage: String(ROWS_PER_PAGE_STORES),
    }, rootCtx);
    const pageResults = desc.results || [];
    stores.push(...pageResults);
    if (stores.length >= desc.totalCount || !pageResults.length) break;
    await sleep(DELAY_MS);
  }
  console.log(`[complaints-capture] ${stores.length} store(s) found`);

  // "03708 ARDMORE-BROADWAY" -> {nsn: "03708", name: "ARDMORE-BROADWAY"} -- same convention as
  // browser-graded-visits-bulk-capture.js. customer-care's own response carries `locationId` (the
  // hierarchy-node id) but NOT the NSN, so it has to be attached here at capture time, not
  // recovered later from a separate lookup the import script would otherwise need to maintain.
  const splitStoreName = hierarchyNodeName => {
    const m = /^(\d+)\s+(.*)$/.exec(hierarchyNodeName || '');
    return m ? { nsn: m[1], name: m[2] } : { nsn: null, name: hierarchyNodeName || null };
  };

  const casesOut = [];
  for (const store of stores) {
    const { nsn, name } = splitStoreName(store.hierarchyNodeName);
    const storeCtx = { level: STORE_LEVEL, node: store.hierarchyNodeId };
    const storeCases = [];
    for (let page = 1; ; page++) {
      await sleep(DELAY_MS);
      let json;
      try {
        json = await getJson('customer-care', {
          action: 'getCustomerCareRestaurantCaseList', locationId: store.hierarchyNodeId,
          timeFrame: String(TIME_FRAME), page: String(page), rowsPerPage: String(ROWS_PER_PAGE),
          sortBy: 'childCaseId', descending: 'false',
        }, storeCtx);
      } catch (e) {
        console.warn(`[complaints-capture] ${store.hierarchyNodeName}: page ${page} failed -- ${e.message}`);
        break;
      }
      const pageResults = json.results || [];
      storeCases.push(...pageResults);
      if (storeCases.length >= json.totalCount || !pageResults.length) break;
    }
    console.log(`[complaints-capture] ${store.hierarchyNodeName}: ${storeCases.length} case(s)`);
    for (const c of storeCases) casesOut.push({ store: nsn, name, case: c });
  }

  console.log(`[complaints-capture] done: ${casesOut.length} case(s) captured across ${stores.length} store(s)`);

  const seed = {
    _source: 'propel.mcd.com /api/customer-care?action=getCustomerCareRestaurantCaseList (timeFrame=5/History, all stores)',
    _captured: new Date().toISOString().slice(0, 10),
    cases: casesOut,
  };
  const blob = new Blob([JSON.stringify(seed, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'complaints-seed.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  console.log('[complaints-capture] download triggered: complaints-seed.json');
})();
