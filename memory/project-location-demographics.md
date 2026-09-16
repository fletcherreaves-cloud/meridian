---
name: project-location-demographics
description: "Per-store Census-tract trade-area demographics (Location Intel's 🏘 Demographics mode)"
metadata:
  node_type: memory
  type: project
---

## Location Demographics (v5.448)

Backlog item (`memory/backlog-open-2026-09-06.md` §5: "Demographics per location (Census/ACS
API)"). One of the week's vacation-project lineup (Task #58). Adds a per-store trade-area
snapshot — population, median household income, median age, poverty rate, owner-occupied %,
average household size — sourced from the free, keyless US Census Bureau APIs.

**Data source:**
- **Geocoder** (TIGERweb, `geocoding.geo.census.gov`): store lat/lon (already on file in
  `constants.js`'s `STORE_COORDS`, used today for the Open-Meteo weather fetch) → Census Tract
  FIPS/GEOID. "Current" benchmark/vintage — tract boundaries only change at each decennial
  Census, no version pinning needed.
- **ACS 5-Year Detailed Tables** (`api.census.gov`): tract → estimates for a fixed set of
  well-known table IDs (`B01003_001E` population, `B19013_001E` median household income,
  `B01002_001E` median age, `B17001_002E`/`B17001_001E` poverty count/universe,
  `B25003_002E`/`B25003_003E`/`B25003_001E` owner/renter/total occupied units,
  `B25010_001E` average household size). Vintage `ACS_VINTAGE` (currently 2023) — bump when a
  newer 5-year release ships (~annually).
- Both APIs are keyless. **They are NOT CORS-enabled for direct browser calls** — see the
  ✅ MEASURED correction below; the original build's claim here was wrong and unverified.

**Tract-level, NOT a modeled drive-time trade area.** Meridian has no GIS radius/isochrone
tooling. This is honestly "the Census tract containing this store's coordinates" — a reasonable,
coarser proxy. Never present it in the UI as a drawn trade-area boundary.

**Manual refresh, not a scheduled pull.** ACS 5-year estimates only update annually, so this
doesn't need the daily-cron treatment LifeLenz/QSRSoft pulls get. Location Intel's own
"🔄 Refresh Demographics" button (Demographics mode) fetches all 27 stores sequentially,
throttled ~1.1s apart (the Census Geocoder rate-limits aggressively per-IP; 2 requests/store ×
1.1s keeps the combined rate under 1 req/s, same caution `fetchOpenMeteoWeather` already
documents), then upserts to Supabase. Per-store failures are isolated and reported, never abort
the whole batch.

**Files:**
- `supabase/schema-store-demographics.sql` — `store_demographics` table, one row per `loc`
  (unpadded). Client-writable (authenticated), same RLS shape as `store_assessments`
  (tenant + `my_locs()` restrictive policy) — not a service-role-only pull table.
- `src/engine/census-demographics.js` — pure fetch/shape logic: `geocodeToTract`,
  `fetchAcsForTract`, `shapeAcsRow` (handles Census's `-666666666` suppressed-estimate null
  sentinel), `fetchStoreDemographics` (one store), `fetchAllStoreDemographics` (all stores,
  throttled, per-store error isolation).
- `src/lib/supabase.js` — `loadStoreDemographics()`/`saveStoreDemographics(rows)`, same
  camelCase-in/snake_case-out convention as `loadStoreAssessments`/`saveStoreAssessment`.
- `src/features/location-intel.js` — new `🏘 Demographics` mode (alongside Statistical/AI
  Narrative) in `LocationIntelligence`'s existing mode toggle. `DemographicsSection`: a
  single-store KPI card at Store level, a per-store table at District level. Works with zero
  Meridian ops data loaded (`ds.loaded:false`) — reads `store_demographics` directly, independent
  of `laborRows`/`opsRows`. Print/Download (which build the statistical/AI report) are hidden on
  this mode; it has its own Refresh action instead.

**✅ MEASURED 2026-09-16 — the "CORS-enabled" claim was wrong, and the first live click found it
within minutes.** Could not be smoke-tested before merge (this session's sandbox network-egress
policy blocks `geocoding.geo.census.gov`/`api.census.gov` outright — a `policy denial`, confirmed
via both `curl` and `WebFetch`), so the original build shipped on an unverified assumption instead
of CLAUDE.md's normal "measure it, don't reason about it" live run. The owner's first real click of
"🔄 Refresh Demographics" failed for **all 27 stores** with `Census geocoder request failed: Failed
to fetch` — the standard browser symptom of a cross-origin fetch the target server never sends
`Access-Control-Allow-Origin` for. The Census Bureau's APIs are keyless and public, but **not**
CORS-enabled for direct browser calls.

**Fixed the same day** by routing both Census calls through a new Edge Function,
`supabase/functions/census-proxy` (server-to-server, no browser CORS involved) — deploy with
`supabase functions deploy census-proxy --no-verify-jwt`, no secrets needed (Census's calls stay
keyless). `geocodeToTract`/`fetchAcsForTract`/`fetchStoreDemographics`/`fetchAllStoreDemographics`
in `census-demographics.js` all gained `sbUrl`/`authToken` parameters (the caller now needs
`VITE_SUPABASE_URL` + a live session token, via `supabase.js`'s new `getAuthToken()`) — every line
of the actual parsing/shaping logic (`shapeAcsRow`, the `-666666666` null-sentinel handling, tier
lookups) is untouched and still covered by the same tests, now updated to assert against the proxy
call shape instead of the direct Census URL. 15 tests in `census-demographics.test.js` (2 new: a
proxy-network-failure case and the missing-auth guard), 6 in
`location-intel-demographics.test.js`. Full suite 521/521 files, 4993/4993 tests.

**✅ Deployed (owner-confirmed 2026-09-16)** — `supabase functions deploy census-proxy
--no-verify-jwt` has run, after the owner's first click (pre-deploy) reproduced exactly the
predicted "Census geocoder request failed: Failed to fetch" for all 27 stores, confirming the
diagnosis was right.

## Second bug, found by the owner's SECOND real click (2026-09-16)

Once `census-proxy` was actually reachable, the failure mode changed from a CORS/connection
error to a substantive one: **"No Census Tract found for coordinates …" for all 27 stores again**
— the proxy now genuinely reaches the Census Geocoder and gets a real response back, but that
response contains no `Census Tracts` geography.

**Root cause (measured as far as this sandbox allows):** the proxy's geocode request hardcoded
`layers=10` — a second unverified guess from the original build, never live-tested for the exact
same reason as the CORS bug (this sandbox's network egress policy blocks `*.census.gov` outright,
confirmed again this pass via both `curl` and `WebFetch` returning `EGRESS_BLOCKED`). Reached the
Census Geocoder API's own documentation instead through non-census.gov mirrors (a WebSearch
snippet plus corroborating library docs): the `layers` parameter **defaults to `'all'` when
omitted**, which returns every geography layer keyed by NAME (`Census Tracts`, `Counties`,
`States`, etc.) — exactly the key `census-demographics.js`'s `geocodeToTract()` already parses
(`data.result.geographies['Census Tracts']`). `layers=10` is not that.

**Fix:** removed the `layers=10` parameter from `census-proxy/index.ts`'s geocode URL entirely,
relying on the documented default rather than asserting a second unverified numeric ID.

**⚠️ Still not independently verified end-to-end** — same standing gap as every Edge Function
change this session: no way to deploy or call the live function here. This fix is backed by
external documentation (not a guess), but it is still unverified against a real Census Geocoder
response until redeployed and re-clicked. **Needs a second
`supabase functions deploy census-proxy --no-verify-jwt`**, then a fresh "🔄 Refresh Demographics"
click. If it fails a THIRD time, capture the exact new error text — that will pin down whatever
this fix didn't anticipate faster than another round of docs archaeology.
