// @ts-nocheck
// ── Trade-area demographics per store (backlog: "Demographics per location, Census/ACS API") ──
// Free, keyless US Census Bureau APIs — TIGERweb Geocoder (lat/lon -> Census Tract) + ACS 5-Year
// Detailed Tables (tract -> population/income/age/poverty/tenure). Both are CORS-enabled and
// need no API key at Meridian's volume (27 stores), the same "free, keyless, direct client
// fetch" shape as constants.js's fetchOpenMeteoWeather.
//
// Tract-level, NOT a modeled drive-time trade area — Meridian has no GIS radius/isochrone
// tooling. This is "the Census tract containing this store's coordinates," a coarser but
// honest proxy — never present it in the UI as a drawn trade-area boundary.
//
// ⚠️ Built and shipped from an environment whose network egress policy blocks
// geocoding.geo.census.gov / api.census.gov outright, so this could NOT be smoke-tested against
// the live APIs before merge (unlike every other external-pull script in this repo, which per
// CLAUDE.md's "measure it, don't reason about it" standing rule normally gets a live run before
// shipping). The Census Geocoder + ACS5 request/response shapes are well-documented, keyless,
// and have been stable for years, so this is written defensively (explicit HTTP-status checks,
// clear errors naming which step failed), but the FIRST real use (Location Intel's "🔄 Refresh
// Demographics" button) is this feature's actual live test. If it fails, the error will name
// which of the two API calls failed and why — check that message first.

export const ACS_VINTAGE = 2023; // ACS 5-Year estimates release year — bump when a newer one ships

// ACS Detailed Table variable codes (stable, well-known table IDs):
//   B01003_001E population | B19013_001E median household income | B01002_001E median age
//   B17001_002E population below poverty | B17001_001E poverty-status universe (denominator)
//   B25003_002E owner-occupied units | B25003_003E renter-occupied units
//   B25003_001E occupied-housing universe (denominator) | B25010_001E avg household size
const ACS_VARS = {
  population: 'B01003_001E',
  medianHouseholdIncome: 'B19013_001E',
  medianAge: 'B01002_001E',
  povertyCount: 'B17001_002E',
  povertyUniverse: 'B17001_001E',
  ownerOccupied: 'B25003_002E',
  renterOccupied: 'B25003_003E',
  occupiedUniverse: 'B25003_001E',
  avgHouseholdSize: 'B25010_001E',
};

const GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';
const acsUrl = (vintage) => `https://api.census.gov/data/${vintage}/acs/acs5`;

// lat/lon -> {stateFips, countyFips, tractFips, geoid} via the Census Geocoder (TIGERweb),
// "Current" benchmark/vintage (always the latest published geography, matching how every other
// consumer of a live-but-slow-moving reference dataset in this app works — no version pinning
// needed for tract boundaries, which change only at each decennial Census).
export async function geocodeToTract(lat, lon) {
  const url = `${GEOCODER_URL}?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&layers=10&format=json`;
  let resp;
  try { resp = await fetch(url); } catch (e) { throw new Error('Census geocoder request failed: ' + (e?.message || e)); }
  if (!resp.ok) throw new Error('Census geocoder HTTP ' + resp.status);
  const data = await resp.json();
  const tracts = data?.result?.geographies?.['Census Tracts'];
  const t = tracts && tracts[0];
  if (!t) throw new Error('No Census Tract found for coordinates ' + lat + ',' + lon);
  return { stateFips: t.STATE, countyFips: t.COUNTY, tractFips: t.TRACT, geoid: t.GEOID };
}

// {stateFips, countyFips, tractFips} -> raw ACS5 variable values for that tract, keyed by
// variable code. The ACS API returns [headerRow, dataRow] — one data row per matched geography.
export async function fetchAcsForTract({ stateFips, countyFips, tractFips }, vintage = ACS_VINTAGE) {
  const vars = Object.values(ACS_VARS).join(',');
  const url = `${acsUrl(vintage)}?get=NAME,${vars}&for=tract:${tractFips}&in=state:${stateFips}+county:${countyFips}`;
  let resp;
  try { resp = await fetch(url); } catch (e) { throw new Error('Census ACS request failed: ' + (e?.message || e)); }
  if (!resp.ok) throw new Error('Census ACS HTTP ' + resp.status);
  const rows = await resp.json();
  const header = rows && rows[0], row = rows && rows[1];
  if (!row) throw new Error('No ACS data returned for tract ' + stateFips + '/' + countyFips + '/' + tractFips);
  const byVar = {};
  header.forEach((k, i) => { byVar[k] = row[i]; });
  return byVar;
}

// Census's null-value sentinel for a suppressed/inapplicable estimate is a fixed negative number
// (-666666666), not a normal missing-value shape (null/empty string) — must be checked
// explicitly or a suppressed cell silently becomes a huge negative "median income."
const _CENSUS_NULL = '-666666666';
const _num = (v) => (v == null || v === '' || v === _CENSUS_NULL) ? null : Number(v);

// Pure: raw ACS row (keyed by variable code) -> Meridian's shaped demographic record. Exported
// separately from the fetch functions so tests can exercise the shaping/null-handling logic
// against a literal ACS-shaped fixture without a network mock.
export function shapeAcsRow(byVar) {
  const povCount = _num(byVar[ACS_VARS.povertyCount]);
  const povUniverse = _num(byVar[ACS_VARS.povertyUniverse]);
  const ownerOcc = _num(byVar[ACS_VARS.ownerOccupied]);
  const occUniverse = _num(byVar[ACS_VARS.occupiedUniverse]);
  return {
    population: _num(byVar[ACS_VARS.population]),
    medianHouseholdIncome: _num(byVar[ACS_VARS.medianHouseholdIncome]),
    medianAge: _num(byVar[ACS_VARS.medianAge]),
    povertyRate: (povCount != null && povUniverse > 0) ? povCount / povUniverse : null,
    ownerOccupiedPct: (ownerOcc != null && occUniverse > 0) ? ownerOcc / occUniverse : null,
    avgHouseholdSize: _num(byVar[ACS_VARS.avgHouseholdSize]),
  };
}

// One store: coordinates -> a full demographic record ready to persist (store_demographics
// shape, camelCase — supabase.js's saveStoreDemographics maps to the snake_case columns).
export async function fetchStoreDemographics(loc, lat, lon, vintage = ACS_VINTAGE) {
  const tract = await geocodeToTract(lat, lon);
  const byVar = await fetchAcsForTract(tract, vintage);
  const shaped = shapeAcsRow(byVar);
  return {
    loc, tractGeoid: tract.geoid, countyFips: tract.countyFips, stateFips: tract.stateFips,
    acsVintage: vintage, ...shaped,
  };
}

// All stores in a {loc: {lat, lon}} map (STORE_COORDS' own shape), sequential + throttled — the
// Census Geocoder rate-limits aggressively per-IP, and this makes 2 requests/store, so pacing
// one store per ~1.1s keeps the combined rate under 1 req/s, the same caution
// fetchOpenMeteoWeather already documents for the identical reason (one burst gets everyone
// rate-limited, not just this session). `onProgress(done, total, loc)` lets the UI show a
// "N of 27" indicator across the ~30-60s this takes.
export async function fetchAllStoreDemographics(storeCoords, onProgress) {
  const locs = Object.keys(storeCoords || {});
  const rows = [];
  const errors = [];
  for (let i = 0; i < locs.length; i++) {
    const loc = locs[i];
    const { lat, lon } = storeCoords[loc] || {};
    if (lat == null || lon == null) { errors.push({ loc, error: 'no coordinates on file' }); continue; }
    try {
      rows.push(await fetchStoreDemographics(loc, lat, lon));
    } catch (e) {
      errors.push({ loc, error: e?.message || String(e) });
    }
    onProgress && onProgress(i + 1, locs.length, loc);
    if (i < locs.length - 1) await new Promise((r) => setTimeout(r, 1100));
  }
  return { rows, errors };
}
