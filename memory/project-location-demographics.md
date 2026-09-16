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
- Both APIs are CORS-enabled and keyless at this volume (27 stores) — the exact same "free,
  direct client fetch, no server-side secret" shape `fetchOpenMeteoWeather` already uses.

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

**⚠️ Could not be smoke-tested against the live Census APIs before merge.** This session's sandbox
network-egress policy blocks `geocoding.geo.census.gov`/`api.census.gov` outright (confirmed via
both `curl` and `WebFetch` — a `policy denial`, not an auth/CORS issue) — unlike every other
external-pull script in this repo, which per CLAUDE.md's "measure it, don't reason about it"
standing rule normally gets a live run before shipping. The Geocoder + ACS5 request/response
shapes are well-documented, keyless, and have been stable for years, so this was written
defensively (explicit HTTP-status checks, step-named errors) and is covered by 13 tests
(`src/__tests__/census-demographics.test.js`) against literal Census-response-shaped fixtures,
plus 6 tests (`src/__tests__/location-intel-demographics.test.js`) rendering the real
`LocationIntelligence` → `DemographicsSection` consumer. **But the first real click of
"🔄 Refresh Demographics" in the actual app is this feature's true first live test** — if it
errors, the message will name which step failed (geocoder vs. ACS, and the HTTP status or
Census-side reason), which is the first thing to check.
