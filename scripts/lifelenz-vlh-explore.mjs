#!/usr/bin/env node
// scripts/lifelenz-vlh-explore.mjs — round 3
// Found: Schedule type has vlhSettingsCache: VlhSettingsCache
// This round: introspect VlhSettingsCache fields, then fetch real data for all stores.

const BASE        = 'https://us01-connect.lifelenz.com';
const BUSINESS_ID = '01979dbf-a166-759b-8702-aba9915c578e';
const TOKEN       = process.env.LIFELENZ_TOKEN;

if (!TOKEN) { console.error('Set LIFELENZ_TOKEN env var'); process.exit(1); }

const HEADERS = {
  'X-Auth-Token':      TOKEN,
  'X-Business-Id':     BUSINESS_ID,
  'X-Lifelenz-Device': 'webadmin',
  'X-Version':         '1.75.21',
  'Accept':            'application/json',
};

const gql = async (operationName, query, variables = {}) => {
  const res = await fetch(`${BASE}/manager/graphql?${operationName}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationName, query, variables }),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
};

// ── Step 1: Introspect VlhSettingsCache ───────────────────────────────────
console.log('══ 1. VlhSettingsCache type fields ══════════════════════════════');
const typeRes = await gql('IntrospectVlhSettingsCache', `
  query IntrospectVlhSettingsCache {
    __type(name: "VlhSettingsCache") {
      name
      fields {
        name
        description
        type { name kind ofType { name kind ofType { name kind } } }
      }
    }
  }
`);
if (typeRes.json?.data?.__type?.fields) {
  console.log('VlhSettingsCache fields:');
  typeRes.json.data.__type.fields.forEach(f => {
    const t = f.type?.name || f.type?.ofType?.name || f.type?.ofType?.ofType?.name || f.type?.kind;
    console.log(`  ${f.name}: ${t}  ${f.description ? '// '+f.description : ''}`);
  });
} else {
  console.log('Result:', typeRes.text.slice(0, 600));
}

// ── Step 2: Get all schedule IDs ──────────────────────────────────────────
const schRes = await fetch(`${BASE}/api/admin/businesses/${BUSINESS_ID}/schedules`, { headers: HEADERS });
const schJson = await schRes.json();
const STORE_RE = /\b\d{4,7}\b/;
const schedules = (schJson?.data || []).filter(s =>
  s.attributes?.schedule_status !== 'archived' &&
  STORE_RE.test(s.attributes?.schedule_name || '')
);
console.log(`\n── ${schedules.length} store schedules found ─────────────────────────────────`);

// ── Step 3: Fetch vlhSettingsCache for first store (with __typename to see structure) ──
const probe = schedules[0];
console.log(`\n══ 2. vlhSettingsCache data for: ${probe.attributes.schedule_name} ══`);
const dataRes = await gql('GetScheduleVlhSettings', `
  query GetScheduleVlhSettings($id: ID!, $businessId: ID!) {
    schedule(id: $id, businessId: $businessId) {
      id
      scheduleName
      vlhSettingsCache {
        __typename
      }
    }
  }
`, { id: probe.id, businessId: BUSINESS_ID });
console.log('Raw result:', JSON.stringify(dataRes.json, null, 2).slice(0, 1200));

// ── Step 4: Try fetching ALL stores with a fragment ───────────────────────
// (Only run this if step 3 succeeded — adapt field names from step 1 output)
console.log('\n══ 3. vlhSettingsCache for all stores (typename + all scalar fields) ══');
const allRes = await gql('GetAllScheduleVlhSettings', `
  query GetAllScheduleVlhSettings($businessId: ID!) {
    schedules(businessId: $businessId) {
      nodes {
        id
        scheduleName
        vlhSettingsCache {
          __typename
        }
      }
    }
  }
`, { businessId: BUSINESS_ID });
console.log(`Status: ${allRes.status}`);
console.log(allRes.text.slice(0, 1200));

console.log('\nDone.');
