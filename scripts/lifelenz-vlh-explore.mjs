#!/usr/bin/env node
// scripts/lifelenz-vlh-explore.mjs — round 4
// schedules(businessId) query confirmed working.
// This round: get VlhSettingsCache field names, then pull real data for all stores.

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

// ── 1. VlhSettingsCache field names (full output, no truncation) ──────────
console.log('══ VlhSettingsCache field names ═════════════════════════════════');
const typeRes = await gql('IntrospectVlhSettingsCache', `
  query IntrospectVlhSettingsCache {
    __type(name: "VlhSettingsCache") {
      name
      fields {
        name
        type { name kind ofType { name kind ofType { name kind } } }
      }
    }
  }
`);
const cacheFields = typeRes.json?.data?.__type?.fields || [];
cacheFields.forEach(f => {
  const t = f.type?.name || f.type?.ofType?.name || f.type?.ofType?.ofType?.name || f.type?.kind;
  console.log(`  ${f.name}: ${t}`);
});

// ── 2. Pull all stores with every VlhSettingsCache field ──────────────────
// Build the field list dynamically from introspection so we get everything
const scalarFields = cacheFields
  .filter(f => {
    const kind = f.type?.kind || f.type?.ofType?.kind;
    // Include scalars and enums; skip objects/lists (need separate query)
    return ['SCALAR','ENUM','NON_NULL'].includes(kind) ||
           ['SCALAR','ENUM'].includes(f.type?.ofType?.kind) ||
           ['SCALAR','ENUM'].includes(f.type?.ofType?.ofType?.kind);
  })
  .map(f => f.name);

console.log(`\nScalar/enum fields to query: ${scalarFields.join(', ')}`);

const fieldBlock = scalarFields.length > 0
  ? scalarFields.join('\n        ')
  : '# no scalar fields found — querying with guesses below';

const queryFields = scalarFields.length > 0 ? fieldBlock : `
        frontCounter
        driveThru
        kitchen
        coffee
        beverage
        frontCounterType
        driveThruType
        kitchenType
        coffeeType
        beverageType`;

console.log('\n══ All stores VLH data ══════════════════════════════════════════');
const allRes = await gql('GetAllVlhSettings', `
  query GetAllVlhSettings($businessId: ID!) {
    schedules(businessId: $businessId) {
      nodes {
        id
        scheduleName
        vlhSettingsCache {
          ${queryFields}
        }
      }
    }
  }
`, { businessId: BUSINESS_ID });

if (allRes.json?.errors) {
  console.log('Errors (field name hints):');
  allRes.json.errors.forEach(e => console.log(' ', e.message));
}

if (allRes.json?.data?.schedules?.nodes) {
  const STORE_RE = /\b\d{4,7}\b/;
  const stores = allRes.json.data.schedules.nodes.filter(n =>
    n.vlhSettingsCache && STORE_RE.test(n.scheduleName)
  );
  console.log(`\n${stores.length} stores with VLH data:`);
  stores.forEach(s => {
    console.log(`\n  ${s.scheduleName}`);
    console.log('  ', JSON.stringify(s.vlhSettingsCache));
  });
} else {
  console.log('Raw response:', allRes.text.slice(0, 2000));
}

console.log('\nDone.');
