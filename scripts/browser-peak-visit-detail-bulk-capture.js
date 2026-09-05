// scripts/browser-peak-visit-detail-bulk-capture.js
//
// NOT a Node script. This is a browser-console snippet: paste it into DevTools → Console on a
// signed-in peak.mcd.com tab (any page under the app works, since auth is the tab's own session)
// and it downloads a seed file ready for scripts/import-peak-visit-detail.mjs.
//
// Dispatch #230 (memory/dispatch-230-peak-visit-detail-bulk-backfill.md) Task 1. Backfills
// peak_detail onto every CFV/RGR visit PEAK holds, not just the two visits manually captured and
// imported this session (see memory/finding-peak-visit-detail-api-2026-09-05.md).
//
// ── Why a console script, not a pull ────────────────────────────────────────────────────────────
// peak.mcd.com shows the same corporate-SSO signature as propel.mcd.com (no visible Cookie/
// Authorization header in HAR captures, but every POST carries a __RequestVerificationToken header
// -- the standard ASP.NET anti-forgery pattern, which almost always pairs with an MFA-gated session
// cookie) -- see the finding file's item #3. There is no unattended-token path, so this can never
// become a GitHub Actions pull, exactly like Propel/EcoSure/CFV/RGR bulk capture before it. This
// script automates the CAPTURE step for a human who is already signed in, using fetch() with
// credentials: 'include' so the browser tab's own session cookies attach automatically. It never
// reads document.cookie, never logs a header or token VALUE, and never sends anything anywhere
// except the same peak.mcd.com read endpoints the PEAK UI itself already calls.
//
// ── The enumeration chain (confirmed working end-to-end for one CFV + one RGR visit, 2026-09-05) ─
//   1. POST /API/Entity/GetEntities            {"Pagedata":0}
//        -> the signed-in user's franchisee organization(s). Not confirmed whether any field from
//           this response needs to feed into step 2 -- the proven-working manual capture called it
//           first and it is kept here for parity, but Stores/Paged's own confirmed body is just
//           {"page":N} with no entity id in it. Logged to console on first call so a real run can
//           confirm or correct this if it turns out to matter.
//   2. POST /API/Stores/Paged/                 {"page":N}
//        -> ALL stores under that organization, paginated (~10/page, 3 pages for 27 stores in the
//           one capture measured). EXACT FIELD NAMES ON EACH STORE ENTRY ARE NOT CONFIRMED -- the
//           finding file never inspected this response's shape closely enough to record them. This
//           script tries several plausible id fields (see pickStoreId below) and logs the raw first
//           page to console so a real run can report back the actual shape if the guess is wrong.
//   3. POST /API/Visit/GetStoreDetails/<storeId>?isChecked=true
//        -> that ONE store's full visit history, EVERY visit type, years back. CONFIRMED fields on
//           each visit: Id (visitId), VisitTypeId, VisitDate, TypeDescription.
//   4. POST /API/Visit/RoipSurvey/<visitId>
//        -> the full per-visit survey. This is the exact response parsePeakRoipVisit()
//           (src/parsers/graded-visits.js) already consumes -- pushed into the output RAW,
//           unmodified, same as every other bulk-capture script in this repo.
//
// Only VisitTypeId 3801 (CFV) and 3781 (RGR) are pulled from step 3's results -- see
// PEAK_VISIT_TYPE_TO_REPORT_TYPE in src/parsers/graded-visits.js. PEAK's per-store history includes
// many other visit types (Execution Shop Visit, Market Support Visits, ROIP Certification, ...)
// this repo's graded_visits table does not track; they are skipped, not captured.
//
// ── The __RequestVerificationToken header ───────────────────────────────────────────────────────
// Every peak.mcd.com POST in the source HAR carried this header, but its VALUE was never inspected
// or recorded (per this repo's security posture for real captured sessions). The standard ASP.NET
// pattern exposes the value to page script via either a hidden <input name="__RequestVerification
// Token"> (usually inside a <form>, sometimes injected standalone) or a <meta> tag -- this script
// tries both (getVerificationToken() below) and sends whichever it finds. If NEITHER is found on
// the page, it proceeds without the header and relies on the /API/Entity/GetEntities call (a GET-
// like read with a trivial body) to fail loudly and immediately if the token turns out to be
// mandatory, rather than silently mis-authenticating through every later call.
// If the very first call 400s/403s, open DevTools → Elements and search the page source for
// "RequestVerificationToken" to find where PEAK actually renders it, then extend
// getVerificationToken() below rather than guessing again blind.
//
// ── Output ───────────────────────────────────────────────────────────────────────────────────
// Downloads peak-visit-detail-seed.json in exactly memory/data/peak-visit-detail-seed.json's shape:
// {_source, _captured, visits: [<raw RoipSurvey response>, ...]}. Each entry is the RAW response
// body -- do not unwrap it; parsePeakRoipVisit() (src/parsers/graded-visits.js) does that.
// To use: point PEAK_VISIT_DETAIL_SEED_PATH at this downloaded file (a local, gitignored/
// uncommitted path -- NEVER the committed memory/data/peak-visit-detail-seed.json, which must stay
// the empty shell it is), then run:
//   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... PEAK_VISIT_DETAIL_SEED_PATH=/path/to/file \
//     node scripts/import-peak-visit-detail.mjs
//
// ── First run: measure scale before the full estate (dispatch #230 Task 2) ────────────────────
// Set MAX_STORES below to a small number (e.g. 3) for a first real run, note the console summary's
// visit/call counts and wall-clock time, then set it back to Infinity for the full capture.

(async () => {
  const BASE = 'https://peak.mcd.com';
  const DELAY_MS = 250; // polite pacing -- no reason to hammer the API, matches the Propel scripts
  const MAX_STORES = Infinity; // set to a small number for a first scale-measurement run
  const REPORT_VISIT_TYPE_IDS = new Set([3801, 3781]); // CFV, RGR -- see graded-visits.js's map

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Best-effort lookup of the anti-forgery token value PEAK's own page script would already have
  // -- never logged, only forwarded as a header on this tab's own authenticated requests.
  function getVerificationToken() {
    const input = document.querySelector('input[name="__RequestVerificationToken"]');
    if (input && input.value) return input.value;
    const meta = document.querySelector('meta[name="__RequestVerificationToken"]');
    if (meta && meta.content) return meta.content;
    return null;
  }
  const VERIFICATION_TOKEN = getVerificationToken();
  console.log(VERIFICATION_TOKEN
    ? '[peak-detail-capture] found a __RequestVerificationToken on the page -- sending it on every POST.'
    : '[peak-detail-capture] no __RequestVerificationToken found on the page -- proceeding without it. ' +
      'If the first call below fails, see this file\'s header comment for how to extend the lookup.');

  const postJson = async (path, body) => {
    const headers = { 'content-type': 'application/json', accept: 'application/json' };
    if (VERIFICATION_TOKEN) headers['__RequestVerificationToken'] = VERIFICATION_TOKEN;
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) throw new Error(`${res.status} on POST ${path}`);
    return res.json();
  };

  // The exact response shape of GetEntities/Stores/Paged was never inspected closely enough to
  // record field names (see header comment) -- this hunts through common candidate keys instead of
  // assuming one, and reports the raw shape if nothing matches so a real run is diagnosable without
  // a fresh HAR capture.
  function firstArray(json) {
    if (Array.isArray(json)) return json;
    for (const key of [
      'results', 'Results', 'items', 'Items', 'data', 'Data', 'stores', 'Stores', 'entities', 'Entities',
      // GetStoreDetails-specific guesses, added after a live run showed Stores/Paged uses lowercase
      // 'stores' (not in the original list above, tried first) -- same "confirm one shape, don't
      // assume the next one matches" caution applies here since this endpoint's array key is still
      // unconfirmed as of this comment.
      'visits', 'Visits', 'visitHistory', 'VisitHistory', 'visitList', 'VisitList', 'history', 'History',
    ]) {
      if (Array.isArray(json?.[key])) return json[key];
    }
    // Fall back to ANY array-valued property on the object, so an unguessed key still works instead
    // of silently returning 0 visits -- logged by the caller either way via the raw-response dump.
    if (json && typeof json === 'object') {
      for (const v of Object.values(json)) {
        if (Array.isArray(v)) return v;
      }
    }
    return null;
  }
  function pickId(obj) {
    // 'ID' (all-caps) confirmed 2026-09-05 as the real field on a Stores/Paged store entry (a live
    // run's console log showed {Name, ID, LocalCode, Address1, ...} -- checked first since it's now
    // the known-real shape; the rest stay as fallbacks in case a differently-shaped entity (e.g.
    // GetEntities' own response) needs this same helper.
    for (const key of ['ID', 'Id', 'id', 'StoreId', 'storeId', 'LocationId', 'locationId', 'EntityId', 'entityId']) {
      if (obj?.[key] != null) return obj[key];
    }
    return null;
  }
  function pickName(obj) {
    return obj?.Name ?? obj?.name ?? obj?.StoreName ?? obj?.storeName ?? obj?.DisplayName ?? '(unnamed)';
  }

  console.log('[peak-detail-capture] calling GetEntities (step 1 of the confirmed chain)...');
  try {
    const entities = await postJson('/API/Entity/GetEntities', { Pagedata: 0 });
    console.log('[peak-detail-capture] GetEntities raw response (for shape confirmation only):', entities);
  } catch (e) {
    console.error(`[peak-detail-capture] GetEntities failed -- ${e.message}. If this is a 400/403, the ` +
      '__RequestVerificationToken lookup above likely needs extending (see this file\'s header comment). Stopping.');
    return;
  }
  await sleep(DELAY_MS);

  console.log('[peak-detail-capture] fetching store list (Stores/Paged)...');
  const stores = [];
  for (let page = 1; ; page++) {
    let json;
    try {
      json = await postJson('/API/Stores/Paged/', { page });
    } catch (e) {
      console.error(`[peak-detail-capture] Stores/Paged page ${page} failed -- ${e.message}. Stopping.`);
      break;
    }
    const pageResults = firstArray(json);
    // Log EVERY page, not just page 1 -- a live run found only 17 of ~27 known stores (dispatch
    // #230), and the only way to tell "PEAK genuinely doesn't show the other ~10 to this account"
    // apart from "a later page's response used a shape firstArray() missed" is to see what each
    // page actually returned, not assume page 1's shape holds for the rest.
    console.log(`[peak-detail-capture] Stores/Paged page ${page}: extracted ${pageResults ? pageResults.length : 0} store(s), raw response:`, json);
    if (!pageResults || !pageResults.length) break;
    stores.push(...pageResults);
    await sleep(DELAY_MS);
    if (stores.length >= MAX_STORES) break;
  }
  console.log(`[peak-detail-capture] ${stores.length} store(s) found${MAX_STORES < Infinity ? ` (capped at MAX_STORES=${MAX_STORES})` : ''}`);

  const visitsOut = [];
  let cfvRgrVisitCount = 0;
  let loggedFirstStoreDetails = false;
  for (const store of stores.slice(0, MAX_STORES)) {
    const storeId = pickId(store);
    const storeName = pickName(store);
    if (storeId == null) {
      console.warn('[peak-detail-capture] could not find an id field on this store entry, skipping:', store);
      continue;
    }

    await sleep(DELAY_MS);
    let details;
    try {
      details = await postJson(`/API/Visit/GetStoreDetails/${storeId}?isChecked=true`, {});
    } catch (e) {
      console.warn(`[peak-detail-capture] ${storeName} (${storeId}): GetStoreDetails failed -- ${e.message}`);
      continue;
    }
    const allVisits = firstArray(details) || [];
    if (!loggedFirstStoreDetails) {
      loggedFirstStoreDetails = true;
      console.log(`[peak-detail-capture] GetStoreDetails raw response for ${storeName} (for shape confirmation only):`, details);
    }
    const matching = allVisits.filter(v => REPORT_VISIT_TYPE_IDS.has(v?.VisitTypeId));
    console.log(`[peak-detail-capture] ${storeName} (${storeId}): ${allVisits.length} total visit(s), ${matching.length} CFV/RGR`);

    for (const visit of matching) {
      cfvRgrVisitCount++;
      await sleep(DELAY_MS);
      try {
        const survey = await postJson(`/API/Visit/RoipSurvey/${visit.Id}`, {});
        visitsOut.push(survey); // RAW envelope, exactly what parsePeakRoipVisit() expects
      } catch (e) {
        console.warn(`[peak-detail-capture]   visitId=${visit.Id} RoipSurvey failed -- ${e.message}`);
      }
    }
  }

  console.log(`[peak-detail-capture] done: ${visitsOut.length}/${cfvRgrVisitCount} CFV/RGR visit detail(s) captured across ${stores.length} store(s)`);

  const seed = {
    _source: 'peak.mcd.com Stores/Paged -> Visit/GetStoreDetails/<storeId> -> Visit/RoipSurvey/<visitId> (CFV+RGR only)',
    _captured: new Date().toISOString().slice(0, 10),
    visits: visitsOut,
  };
  const blob = new Blob([JSON.stringify(seed, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'peak-visit-detail-seed.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  console.log('[peak-detail-capture] download triggered: peak-visit-detail-seed.json');
})();
