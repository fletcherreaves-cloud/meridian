#!/usr/bin/env node
// scripts/lifelenz-vlh-explore.mjs — round 5
// VlhSettingsCache has: version (String) + businessAreas (VlhSettingsCacheBusinessAreas)
// This round: introspect VlhSettingsCacheBusinessAreas + pull full data for all stores.

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

// ── 1. Introspect VlhSettingsCacheBusinessAreas ───────────────────────────
console.log('══ VlhSettingsCacheBusinessAreas fields ═════════════════════════');
const baType = await gql('IntrospectBusinessAreas', `
  query IntrospectBusinessAreas {
    __type(name: "VlhSettingsCacheBusinessAreas") {
      name
      fields {
        name
        type { name kind ofType { name kind ofType { name kind } } }
      }
    }
  }
`);
const baFields = baType.json?.data?.__type?.fields || [];
baFields.forEach(f => {
  const t = f.type?.name || f.type?.ofType?.name || f.type?.ofType?.ofType?.name || f.type?.kind;
  console.log(`  ${f.name}: ${t}`);
});

// ── 2. Introspect each nested type ────────────────────────────────────────
const nestedTypes = [...new Set(
  baFields.map(f => f.type?.name || f.type?.ofType?.name || f.type?.ofType?.ofType?.name)
    .filter(n => n && !['String','Int','Float','Boolean','ID'].includes(n))
)];

for (const typeName of nestedTypes) {
  console.log(`\n══ ${typeName} fields ═══════════════════════════════════════════`);
  const t = await gql('IntrospectNested', `
    query IntrospectNested {
      __type(name: "${typeName}") {
        name
        fields { name type { name kind ofType { name kind } } }
      }
    }
  `);
  (t.json?.data?.__type?.fields || []).forEach(f => {
    const tn = f.type?.name || f.type?.ofType?.name || f.type?.kind;
    console.log(`  ${f.name}: ${tn}`);
  });
}

// ── 3. Pull all 27 stores with full businessAreas data ────────────────────
// Build field list from introspection — get all scalar fields of each nested area type
console.log('\n══ All stores — full VLH config ═════════════════════════════════');

// Try fetching businessAreas with sub-field "type" (most likely name)
const allRes = await gql('GetAllVlhFull', `
  query GetAllVlhFull($businessId: ID!) {
    schedules(businessId: $businessId) {
      nodes {
        scheduleName
        vlhSettingsCache {
          version
          businessAreas {
            ${baFields.map(f => {
              const typeName = f.type?.name || f.type?.ofType?.name || f.type?.ofType?.ofType?.name;
              if (!typeName || ['String','Int','Float','Boolean','ID'].includes(typeName)) {
                return f.name;
              }
              return `${f.name} { type name label }`;
            }).join('\n            ')}
          }
        }
      }
    }
  }
`, { businessId: BUSINESS_ID });

if (allRes.json?.errors?.length) {
  console.log('Field errors — trying simpler query:');
  allRes.json.errors.slice(0, 5).forEach(e => console.log(' ', e.message));

  // Fallback: just ask for each area with { type }
  const simple = await gql('GetAllVlhSimple', `
    query GetAllVlhSimple($businessId: ID!) {
      schedules(businessId: $businessId) {
        nodes {
          scheduleName
          vlhSettingsCache {
            version
            businessAreas {
              ${baFields.map(f => `${f.name} { __typename }`).join('\n              ')}
            }
          }
        }
      }
    }
  `, { businessId: BUSINESS_ID });

  if (simple.json?.errors?.length) {
    console.log('Still errors:');
    simple.json.errors.slice(0, 5).forEach(e => console.log(' ', e.message));
  }
  console.log('Simple result:', simple.text.slice(0, 2000));
} else {
  const STORE_RE = /\b\d{4,7}\b/;
  const stores = (allRes.json?.data?.schedules?.nodes || [])
    .filter(n => n.vlhSettingsCache && STORE_RE.test(n.scheduleName));
  console.log(`${stores.length} stores:`);
  stores.forEach(s => {
    console.log(`\n${s.scheduleName}  [${s.vlhSettingsCache.version}]`);
    if (s.vlhSettingsCache.businessAreas) {
      Object.entries(s.vlhSettingsCache.businessAreas).forEach(([k, v]) => {
        if (v != null) console.log(`  ${k}: ${JSON.stringify(v)}`);
      });
    }
  });
}

console.log('\nDone.');
