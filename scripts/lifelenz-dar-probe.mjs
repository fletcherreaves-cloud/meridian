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
const BUSINESS_ID = '01979dbf-a166-759b-8702-aba9915c578e';
const GQL_URL      = `${BASE}/manager/graphql`;
const PROBE_STORE  = process.env.PROBE_STORE || '3708'; // same store the Nov-5 finding used

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
  const token = process.env.LIFELENZ_TOKEN;
  if (!token) { console.error('[auth] LIFELENZ_TOKEN required'); process.exit(1); }

  console.log('=== Resolving schedules ===');
  const schedules = await getStoreSchedules(token);
  console.log(`[schedules] ${schedules.length} total`);
  const match = schedules.find(s => JSON.stringify(s).includes(PROBE_STORE));
  if (!match) {
    console.log('[schedules] sample record shape:', JSON.stringify(schedules[0], null, 2).slice(0, 1500));
    throw new Error(`No schedule found matching store ${PROBE_STORE} -- see sample record shape above to find the right field.`);
  }
  console.log('[schedules] matched record:', JSON.stringify(match, null, 2));
  const scheduleId = match.id;

  console.log('\n=== Introspecting darData return type ===');
  const introspectQuery = `query IntrospectDarData {
    __schema {
      queryType {
        fields(includeDeprecated: true) {
          name
          args { name type { name kind ofType { name kind } } }
          type { name kind ofType { name kind ofType { name kind } } }
        }
      }
    }
  }`;
  const introspectResp = await gql(token, scheduleId, 'IntrospectDarData', introspectQuery, {});
  console.log('[introspect] status', introspectResp.status);
  if (introspectResp.json?.data?.__schema) {
    const darField = introspectResp.json.data.__schema.queryType.fields.find(f => /dar/i.test(f.name));
    console.log('[introspect] fields matching /dar/i on Query type:', JSON.stringify(darField, null, 2));
  } else {
    console.log('[introspect] no usable schema (likely disabled in prod):', JSON.stringify(introspectResp.json).slice(0, 1000));
  }

  // If darData's return type name was found above, introspect ITS fields too.
  const typeName = introspectResp.json?.data?.__schema?.queryType?.fields
    ?.find(f => /dar/i.test(f.name))?.type?.ofType?.name
    || introspectResp.json?.data?.__schema?.queryType?.fields?.find(f => /dar/i.test(f.name))?.type?.name;
  if (typeName) {
    console.log(`\n=== Introspecting type ${typeName} ===`);
    const typeQuery = `query IntrospectType($name: String!) {
      __type(name: $name) { name kind fields { name type { name kind ofType { name kind ofType { name kind } } } } }
    }`;
    const typeResp = await gql(token, scheduleId, 'IntrospectType', typeQuery, { name: typeName });
    console.log('[introspect-type] status', typeResp.status, JSON.stringify(typeResp.json, null, 2));
  }

  console.log('\n=== Direct darData query (best-effort field guess from the 2026-11-05 finding) ===');
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate() - 2; // a day definitely closed
  const start = new Date(Date.UTC(y, m, d, 10, 0, 0)); // 4am CT ≈ 10:00 UTC (CST) -- rough, just need A closed day
  const end = new Date(Date.UTC(y, m, d + 1, 10, 0, 0));
  const darQuery = `query GetDARData($businessId: ID!, $scheduleId: ID!, $startDateTime: ISO8601DateTime!, $endDateTime: ISO8601DateTime!, $granularity: DarGranularity) {
    darData(businessId: $businessId, scheduleId: $scheduleId, startDateTime: $startDateTime, endDateTime: $endDateTime, granularity: $granularity) {
      totals { netSales transactions actualPunchHours avgDtServiceTime }
      intervals { startDateTime missingActuals netSales transactions actualPunchHours avgDtServiceTime }
    }
  }`;
  const darResp = await gql(token, scheduleId, 'GetDARData', darQuery, {
    businessId: BUSINESS_ID, scheduleId,
    startDateTime: start.toISOString(), endDateTime: end.toISOString(),
    granularity: 'quarter_hour',
  });
  console.log('[dar-direct] status', darResp.status);
  console.log('[dar-direct] full response:', JSON.stringify(darResp.json, null, 2));
}

main().catch(e => { console.error('[probe] FAILED:', e.message); process.exit(1); });
