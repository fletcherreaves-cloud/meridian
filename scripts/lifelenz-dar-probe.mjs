#!/usr/bin/env node
// scripts/lifelenz-dar-probe.mjs — one-off discovery probe for LifeLenz's `darData` GraphQL
// query, run via workflow_dispatch only (no schedule). Owner idea (2026-11-17): with QSRSoft's
// own DAR pull paused for compliance reasons, pull LifeLenz's own DAR data hourly instead to
// fill the gap. memory/finding-lifelenz-dar-vs-qsrsoft-dar-2026-11-05.md already measured ONE
// store/day of `darData` against QSRSoft's DAR (near-perfect agreement on 4 fields: net sales,
// transactions, punch hours, DT service time) using a manually-captured browser token -- but
// never captured the FULL response shape, so the real field names for a production pull are
// still unknown. This probe gets them two ways:
//   1. GraphQL introspection on the `darData` field's return type (if the API allows it) --
//      the fast, complete path.
//   2. A direct query using the field names the Nov-5 finding's write-up showed (best-effort
//      guess at the real GraphQL names, since that write-up's snake_case keys were almost
//      certainly re-labeled for readability, not copied verbatim from the query).
// Prints everything to stdout -- read via the Actions job log, nothing written to Supabase.
// No dotenv import -- unlike a local dev run, GitHub Actions injects LIFELENZ_TOKEN/PROBE_STORE
// directly via the workflow's own `env:` block, and `dotenv` isn't a declared dependency
// anywhere else in this repo (confirmed: no other scripts/*.mjs imports it, and it's absent
// from package.json/package-lock.json) -- importing it here was a mistaken copy from a
// different project's pattern, not something this repo's other pull scripts actually do.

const BASE        = 'https://us01-connect.lifelenz.com';
const IDM_BASE    = 'https://idm.lifelenz.com';
const BUSINESS_ID = '01979dbf-a166-759b-8702-aba9915c578e';
const GQL_URL      = `${BASE}/manager/graphql`;
const PROBE_STORE  = process.env.PROBE_STORE || '3708'; // same store the Nov-5 finding used
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

function apiHeaders(token, scheduleId = null) {
  const h = {
    'X-Auth-Token':      token,
    'X-Business-Id':     BUSINESS_ID,
    'X-Lifelenz-Device': 'webadmin',
    'X-Version':         '1.78.11',
    'Accept':            'application/json',
    'Content-Type':      'application/json',
  };
  if (scheduleId) h['X-Schedule-Id'] = scheduleId;
  return h;
}

function isSessionExpired(status, body) {
  if (status === 401 || status === 403 || status === 422) return true;
  const b = (body || '').toLowerCase();
  return b.includes('invalid_session_error') || b.includes('sign in again');
}

// Same direct REST login lifelenz-pull.mjs's reauth() uses -- a GraphQL SignIn mutation against
// idm.lifelenz.com, no Playwright needed. Ported here because LIFELENZ_TOKEN turned out to be
// expired when this probe first ran for real (measured: the real daily sync's own token
// validation logs "LIFELENZ_TOKEN rejected (422, expired?)" on every run right now -- it only
// keeps working because of this exact fallback, never because the stored secret is still good).
async function getAuthTokenDirect() {
  const u = process.env.LIFELENZ_USERNAME;
  const p = process.env.LIFELENZ_PASSWORD;
  const query = `mutation SignIn($username: String!, $credential: String!) {
    signIn(email: $username, credential: $credential) { authToken }
  }`;
  const credential = Buffer.from(p || '', 'utf8').toString('base64');
  const r = await fetch(`${IDM_BASE}/external/graphql?SignIn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Accept': '*/*', 'X-Lifelenz-Device': 'webadmin', 'X-Version': '1.78.11' },
    body: JSON.stringify({ operationName: 'SignIn', variables: { username: u, credential }, query }),
  });
  console.log('[auth-direct] SignIn →', r.status);
  const data = await r.json().catch(() => null);
  if (data?.errors) { console.log('[auth-direct] SignIn error:', JSON.stringify(data.errors).slice(0, 300)); return null; }
  const tok = data?.data?.signIn?.authToken;
  if (tok) console.log('[auth-direct] got authToken via SignIn mutation');
  return tok || null;
}

async function resolveToken() {
  let token = process.env.LIFELENZ_TOKEN || null;
  if (token) {
    const check = await fetch(`${BASE}/api/admin/businesses/${BUSINESS_ID}/schedules`, { headers: apiHeaders(token) });
    console.log('[auth] LIFELENZ_TOKEN validation →', check.status);
    if (!check.ok) {
      const body = await check.text().catch(() => '');
      if (isSessionExpired(check.status, body)) {
        console.warn('[auth] LIFELENZ_TOKEN rejected, falling back to SignIn mutation');
        token = null;
      }
    }
  }
  if (!token) token = await getAuthTokenDirect();
  if (!token) throw new Error('Could not resolve a LifeLenz auth token via LIFELENZ_TOKEN or LIFELENZ_USERNAME/PASSWORD SignIn.');
  return token;
}

async function gql(token, scheduleId, operationName, query, variables) {
  const resp = await fetch(`${GQL_URL}?${operationName}`, {
    method: 'POST',
    headers: apiHeaders(token, scheduleId),
    body: JSON.stringify({ operationName, query, variables }),
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 2000) }; }
  return { status: resp.status, json };
}

async function getStoreSchedules(token) {
  const headers = { ...apiHeaders(token), Accept: 'application/json' };
  const base = `${BASE}/api/admin/businesses/${BUSINESS_ID}/schedules`;
  let all = [], nextUrl = base;
  while (nextUrl) {
    const resp = await fetch(nextUrl, { headers });
    if (!resp.ok) throw new Error(`[schedules] REST ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const data = await resp.json();
    all = all.concat(data?.data || []);
    nextUrl = data?.links?.next || null;
  }
  return all;
}

async function main() {
  console.log('=== Resolving auth token ===');
  const token = await resolveToken();

  console.log('\n=== Resolving schedules ===');
  const schedules = await getStoreSchedules(token);
  console.log(`[schedules] ${schedules.length} total`);
  const match = schedules.find(s => JSON.stringify(s).includes(PROBE_STORE));
  if (!match) {
    console.log('[schedules] sample record shape:', JSON.stringify(schedules[0], null, 2).slice(0, 1500));
    throw new Error(`No schedule found matching store ${PROBE_STORE} -- see sample record shape above to find the right field.`);
  }
  console.log('[schedules] matched record:', JSON.stringify(match, null, 2));
  const scheduleId = match.id;

  // 2026-11-17 re-run: first pass (introspecting Query.darData -> DarData) already confirmed
  // DarData has exactly 2 fields -- dar: [X!]! and totals: [FieldValue!]! -- and that every
  // field-name guess from the 2026-11-05 finding's write-up ("netSales", "transactions", etc.)
  // is WRONG: totals is a generic FieldValue list, not an object with named scalar properties.
  // This pass goes one level deeper: introspect FieldValue itself, dar's real list-element type,
  // and DarGranularityEnum's real enum values (my first guess, 'quarter_hour', was also wrong --
  // GraphQL enum values are conventionally UPPER_CASE) -- then build the real query from
  // whatever field names actually come back, rather than guessing again.
  async function introspectType(name) {
    const q = `query IntrospectType($name: String!) {
      __type(name: $name) {
        name kind
        enumValues { name }
        fields { name type { name kind ofType { name kind ofType { name kind ofType { name kind } } } } }
      }
    }`;
    const r = await gql(token, scheduleId, 'IntrospectType', q, { name });
    return r.json?.data?.__type || null;
  }

  console.log('\n=== Introspecting DarData ===');
  const darDataType = await introspectType('DarData');
  console.log(JSON.stringify(darDataType, null, 2));
  const darField = darDataType?.fields?.find(f => f.name === 'dar');
  const darElementType = darField?.type?.ofType?.ofType?.name || darField?.type?.ofType?.name;

  console.log('\n=== Introspecting FieldValue ===');
  const fieldValueType = await introspectType('FieldValue');
  console.log(JSON.stringify(fieldValueType, null, 2));
  const fieldValueFields = (fieldValueType?.fields || []).map(f => f.name);

  if (darElementType && darElementType !== 'FieldValue') {
    console.log(`\n=== Introspecting dar's list element type: ${darElementType} ===`);
    console.log(JSON.stringify(await introspectType(darElementType), null, 2));
  }

  console.log('\n=== Introspecting DarGranularityEnum ===');
  const granEnum = await introspectType('DarGranularityEnum');
  console.log(JSON.stringify(granEnum, null, 2));
  const granValue = granEnum?.enumValues?.[0]?.name || null;
  console.log('[probe] using first real enum value for granularity:', granValue);

  console.log('\n=== Direct darData query (built from real introspected field names) ===');
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate() - 2; // a day definitely closed
  const start = new Date(Date.UTC(y, m, d, 10, 0, 0)); // 4am CT ≈ 10:00 UTC (CST) -- rough, just need A closed day
  const end = new Date(Date.UTC(y, m, d + 1, 10, 0, 0));
  const fvSelection = fieldValueFields.length ? fieldValueFields.join(' ') : '__typename';
  const darQuery = `query GetDARData($businessId: ID!, $scheduleId: ID!, $startDateTime: ISO8601DateTime!, $endDateTime: ISO8601DateTime!${granValue ? ', $granularity: DarGranularityEnum' : ''}) {
    darData(businessId: $businessId, scheduleId: $scheduleId, startDateTime: $startDateTime, endDateTime: $endDateTime${granValue ? ', granularity: $granularity' : ''}) {
      totals { ${fvSelection} }
      dar { __typename }
    }
  }`;
  const darVars = {
    businessId: BUSINESS_ID, scheduleId,
    startDateTime: start.toISOString(), endDateTime: end.toISOString(),
  };
  if (granValue) darVars.granularity = granValue;
  const darResp = await gql(token, scheduleId, 'GetDARData', darQuery, darVars);
  console.log('[dar-direct] query:', darQuery);
  console.log('[dar-direct] status', darResp.status);
  console.log('[dar-direct] full response:', JSON.stringify(darResp.json, null, 2));
}

main().catch(e => { console.error('[probe] FAILED:', e.message); process.exit(1); });
