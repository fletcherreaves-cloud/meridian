// census-proxy — server-side pass-through for the US Census Bureau's Geocoder + ACS5 APIs,
// used by Location Intel's Demographics mode (src/engine/census-demographics.js).
//
// WHY THIS EXISTS: the original build called geocoding.geo.census.gov / api.census.gov
// directly from the browser, on the assumption both are "CORS-enabled" (a claim that was
// never actually measured live — the build environment's network egress policy blocked
// *.census.gov outright, so it could not be tested before merge). The owner's first real
// click of "🔄 Refresh Demographics" in production failed for all 27 stores with
// "Census geocoder request failed: Failed to fetch" — the classic browser symptom of a
// cross-origin fetch the target server never sends Access-Control-Allow-Origin for. The
// Census Bureau's APIs are documented to be keyless and public, but NOT CORS-enabled for
// direct browser calls. Routing through this Edge Function (server-to-server, no browser
// CORS involved) fixes it without changing any of the already-tested parsing/shaping logic
// in census-demographics.js -- only the URL those two fetches hit changes.
//
// Body: { step: 'geocode', lat, lon } -> proxies the TIGERweb geocoder, returns its JSON verbatim.
//       { step: 'acs', stateFips, countyFips, tractFips, vintage } -> proxies ACS5 Detailed
//         Tables, returns its JSON verbatim.
// Both upstream calls need no API key (Census's public, keyless tier) -- no secrets to set.
//
// Deploy: supabase functions deploy census-proxy --no-verify-jwt
//   (--no-verify-jwt for the same CORS-preflight reason sage-chat needs it; auth is checked
//   manually below via /auth/v1/user, matching trigger-dar-sync's own pattern.)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Deno's fetch sends no realistic User-Agent by default, and .gov sites commonly sit behind a
// WAF (Akamai etc.) that serves a 200-OK HTML challenge/block page to non-browser clients
// instead of a 4xx -- so `resp.ok` alone can't tell a real API response from a block page. A
// browser-like UA is the standard, low-risk fix for that class of block.
const UPSTREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/plain,*/*',
};

// Passes a real JSON body through verbatim (still returns the exact upstream bytes/shape the
// client already parses), but refuses to relabel a non-JSON body (an HTML block/error page) as
// application/json -- the 2026-09-16 bug this guards against: every one of 27 stores failed
// client-side with "Unexpected token '<', \"<html styl\"... is not valid JSON" because this
// function was passing an upstream HTML block page through with a Content-Type: application/json
// header, turning a diagnosable upstream failure into an opaque client-side parse error.
function passThroughJson(text: string, upstreamStatus: number, label: string) {
  try {
    JSON.parse(text);
  } catch {
    return json({
      error: `Census ${label} returned a non-JSON response (upstream HTTP ${upstreamStatus}) -- likely a bot/WAF block page, not real API data.`,
      upstreamSnippet: text.slice(0, 300),
    }, 502);
  }
  return new Response(text, { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';
const acsUrl = (vintage: string | number) => `https://api.census.gov/data/${vintage}/acs/acs5`;

// Same variable list census-demographics.js's own ACS_VARS defines client-side -- kept in
// sync manually since Deno edge functions don't share an import graph with src/. If a new
// ACS variable is ever added there, add it here too.
const ACS_VARS = [
  'B01003_001E', 'B19013_001E', 'B01002_001E', 'B17001_002E', 'B17001_001E',
  'B25003_002E', 'B25003_003E', 'B25003_001E', 'B25010_001E',
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: auth },
  });
  if (!userResp.ok) return json({ error: 'Unauthorized' }, 401);

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) ?? {}; } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const step = String(body.step ?? '');

  if (step === 'geocode') {
    const { lat, lon } = body as { lat?: number; lon?: number };
    if (lat == null || lon == null) return json({ error: 'lat/lon required' }, 400);
    // `layers=10` was an unverified guess from the original build (never live-tested — this
    // repo's own sandbox blocks *.census.gov outright, see this file's own header) and is the
    // measured cause of the owner's second real click failing for all 27 stores with "No
    // Census Tract found," right after the first CORS fix landed. `layers` genuinely defaults
    // to 'all' when omitted (confirmed via the Census Geocoder API's own docs, reached through
    // a non-census.gov mirror since this sandbox still can't reach census.gov directly), which
    // returns every geography layer keyed by NAME -- including 'Census Tracts', the exact key
    // census-demographics.js's geocodeToTract() already parses. Omit `layers` entirely rather
    // than guess a second unverified numeric ID.
    const url = `${GEOCODER_URL}?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
    const resp = await fetch(url, { headers: UPSTREAM_HEADERS });
    const text = await resp.text();
    if (!resp.ok) return json({ error: `Census geocoder HTTP ${resp.status}`, upstream: text.slice(0, 300) }, 502);
    return passThroughJson(text, resp.status, 'geocoder');
  }

  if (step === 'acs') {
    const { stateFips, countyFips, tractFips, vintage } = body as
      { stateFips?: string; countyFips?: string; tractFips?: string; vintage?: string | number };
    if (!stateFips || !countyFips || !tractFips) return json({ error: 'stateFips/countyFips/tractFips required' }, 400);
    const vars = ACS_VARS.join(',');
    const url = `${acsUrl(vintage || 2023)}?get=NAME,${vars}&for=tract:${tractFips}&in=state:${stateFips}+county:${countyFips}`;
    const resp = await fetch(url, { headers: UPSTREAM_HEADERS });
    const text = await resp.text();
    if (!resp.ok) return json({ error: `Census ACS HTTP ${resp.status}`, upstream: text.slice(0, 300) }, 502);
    return passThroughJson(text, resp.status, 'ACS');
  }

  return json({ error: `Unknown step '${step}'` }, 400);
});
