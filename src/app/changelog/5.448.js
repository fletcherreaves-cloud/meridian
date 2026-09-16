// @ts-nocheck
export default {version:'5.448', date:'2026-09-16', changes:[
  'Location Demographics (Task #58) — Location Intel gained a new "🏘 Demographics" mode ' +
  '(alongside Statistical/AI Narrative): population, median household income, median age, ' +
  'poverty rate, owner-occupied %, and average household size for the Census tract around each ' +
  'store, from the free/keyless US Census Bureau Geocoder + ACS 5-Year API. Store level shows a ' +
  'single-store KPI card; District level shows a per-store table. Works with zero Meridian ops ' +
  'data loaded -- reads store_demographics directly, independent of laborRows/opsRows.',
  'Tract-level, not a modeled drive-time trade area (Meridian has no GIS radius/isochrone ' +
  'tooling) -- labeled honestly in the UI as the tract containing each store\'s coordinates. ' +
  'Manual "🔄 Refresh Demographics" action (not a scheduled daily pull -- ACS 5-year estimates ' +
  'only update annually), sequential + throttled ~1.1s/store (2 requests/store, stays under the ' +
  'Census Geocoder\'s aggressive per-IP rate limit, same caution constants.js\'s ' +
  'fetchOpenMeteoWeather already documents for the identical reason). Per-store failures are ' +
  'isolated and reported, never abort the whole batch.',
  'New: supabase/schema-store-demographics.sql (store_demographics table, client-writable, same ' +
  'tenant+my_locs() RLS shape as store_assessments), src/engine/census-demographics.js (pure ' +
  'geocode/fetch/shape logic, handles Census\'s -666666666 suppressed-estimate null sentinel), ' +
  'src/lib/supabase.js\'s loadStoreDemographics/saveStoreDemographics.',
  '⚠️ Could not be smoke-tested against the live Census APIs before merge -- this session\'s ' +
  'sandbox network-egress policy blocks geocoding.geo.census.gov/api.census.gov outright ' +
  '(confirmed via curl and WebFetch, a policy denial not an auth/CORS issue), unlike every other ' +
  'external-pull script in this repo. Written defensively against the Census APIs\' well-' +
  'documented, keyless, years-stable request/response shapes; the first real "🔄 Refresh ' +
  'Demographics" click in the app is this feature\'s true first live test -- if it errors, the ' +
  'message names which step failed (geocoder vs ACS) and why. Full design + this caveat: ' +
  'memory/project-location-demographics.md.',
  '19 new tests: 13 in src/__tests__/census-demographics.test.js (pure shaping + null-sentinel ' +
  'handling + orchestration, against literal Census-response-shaped fixtures), 6 in ' +
  'src/__tests__/location-intel-demographics.test.js rendering the real LocationIntelligence -> ' +
  'DemographicsSection consumer (mode switch, Refresh click, partial-failure reporting, District ' +
  'table). Full suite 518/518 files, 4960/4960 tests passing (1 unrelated transient flake seen ' +
  'once in a schedule-retention test, gone on re-run with zero code changes -- not this change\'s). ' +
  'Build clean, eager payload 549.77 KB / 850 KB budget.',
]};
