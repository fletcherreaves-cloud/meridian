#!/usr/bin/env node
// scripts/lifelenz-vlh-explore.mjs
// Explores LifeLenz API to find the VLH configuration endpoint for a store.
// Fetches all schedule IDs, then probes candidate endpoints for the first store.
//
// Usage: LIFELENZ_TOKEN=xxx node scripts/lifelenz-vlh-explore.mjs

const BASE        = 'https://us01-connect.lifelenz.com';
const BUSINESS_ID = '01979dbf-a166-759b-8702-aba9915c578e';
const TOKEN       = process.env.LIFELENZ_TOKEN;

if (!TOKEN) { console.error('Set LIFELENZ_TOKEN env var'); process.exit(1); }

const HEADERS = {
  'X-Auth-Token':       TOKEN,
  'X-Business-Id':      BUSINESS_ID,
  'X-Lifelenz-Device':  'webadmin',
  'X-Version':          '1.75.21',
  'Accept':             'application/json',
};

async function get(path) {
  const url = BASE + path;
  const res = await fetch(url, { headers: HEADERS });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text: text.slice(0, 600) };
}

// ── Step 1: Get all schedule IDs ─────────────────────────────────────────
console.log('\n── Fetching schedules ──────────────────────────────────────────');
const sch = await get(`/api/admin/businesses/${BUSINESS_ID}/schedules`);
console.log(`Status: ${sch.status}`);

if (sch.status !== 200 || !sch.json?.data) {
  console.error('Failed to fetch schedules:', sch.text);
  process.exit(1);
}

const STORE_RE = /\b\d{4,7}\b/;
const schedules = sch.json.data.filter(s =>
  s.attributes?.schedule_status !== 'archived' &&
  STORE_RE.test(s.attributes?.schedule_name || '')
);

console.log(`Found ${schedules.length} store schedules:`);
schedules.forEach(s => console.log(`  ${s.id}  ${s.attributes.schedule_name}`));

// Use the first store as our probe target
const probe = schedules[0];
const SID = probe.id;
console.log(`\n── Probing schedule: ${probe.attributes.schedule_name} (${SID}) ──`);

// ── Step 2: Probe candidate REST endpoints ────────────────────────────────
const candidates = [
  `/api/admin/businesses/${BUSINESS_ID}/schedules/${SID}/vlh_configuration`,
  `/api/admin/businesses/${BUSINESS_ID}/schedules/${SID}/vlh_configurations`,
  `/api/admin/businesses/${BUSINESS_ID}/schedules/${SID}/vlh_settings`,
  `/api/admin/businesses/${BUSINESS_ID}/schedules/${SID}/vlh`,
  `/api/admin/businesses/${BUSINESS_ID}/schedules/${SID}/settings`,
  `/api/admin/businesses/${BUSINESS_ID}/schedules/${SID}/schedule_settings`,
  `/api/admin/businesses/${BUSINESS_ID}/schedules/${SID}`,
];

console.log('\n── REST endpoint probes ─────────────────────────────────────────');
for (const c of candidates) {
  const r = await get(c);
  const preview = r.json ? JSON.stringify(r.json).slice(0, 200) : r.text.slice(0, 200);
  console.log(`  ${r.status}  ${c}`);
  if (r.status === 200) console.log(`       → ${preview}`);
}

// ── Step 3: Try GraphQL — ask for VLH-related fields ─────────────────────
console.log('\n── GraphQL probes ───────────────────────────────────────────────');

const gqlFetch = async (operationName, query, variables = {}) => {
  const res = await fetch(`${BASE}/manager/graphql?${operationName}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationName, query, variables }),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text: text.slice(0, 800) };
};

// Query 1: ask for scheduleVlhConfiguration directly
const q1 = await gqlFetch('GetScheduleVlhConfiguration', `
  query GetScheduleVlhConfiguration($scheduleId: ID!) {
    scheduleVlhConfiguration(scheduleId: $scheduleId) {
      id vlhGuide aot driveThruType inStoreService kitchenType coffeeType
    }
  }
`, { scheduleId: SID });
console.log(`  GetScheduleVlhConfiguration → ${q1.status}`);
if (q1.json) console.log(`    ${JSON.stringify(q1.json).slice(0, 400)}`);

// Query 2: GetScheduleVlhConfigurations (plural)
const q2 = await gqlFetch('GetScheduleVlhConfigurations', `
  query GetScheduleVlhConfigurations($scheduleId: ID!) {
    scheduleVlhConfigurations(scheduleId: $scheduleId) {
      id activeVlhConfiguration { businessArea vlhType }
    }
  }
`, { scheduleId: SID });
console.log(`  GetScheduleVlhConfigurations → ${q2.status}`);
if (q2.json) console.log(`    ${JSON.stringify(q2.json).slice(0, 400)}`);

// Query 3: schedule with vlh nested
const q3 = await gqlFetch('GetScheduleWithVlh', `
  query GetScheduleWithVlh($scheduleId: ID!, $businessId: ID!) {
    schedule(id: $scheduleId, businessId: $businessId) {
      id scheduleName
      vlhConfiguration { id activeVlhConfiguration { businessArea vlhType } }
      vlhConfigurations { id activeVlhConfiguration { businessArea vlhType } }
    }
  }
`, { scheduleId: SID, businessId: BUSINESS_ID });
console.log(`  GetScheduleWithVlh → ${q3.status}`);
if (q3.json) console.log(`    ${JSON.stringify(q3.json).slice(0, 400)}`);

// Query 4: try vlhScheduleConfiguration
const q4 = await gqlFetch('GetVlhScheduleConfiguration', `
  query GetVlhScheduleConfiguration($scheduleId: ID!) {
    vlhScheduleConfiguration(scheduleId: $scheduleId) {
      id
      activeVlhConfiguration { businessArea vlhType activeSince }
    }
  }
`, { scheduleId: SID });
console.log(`  GetVlhScheduleConfiguration → ${q4.status}`);
if (q4.json) console.log(`    ${JSON.stringify(q4.json).slice(0, 400)}`);

// Query 5: Introspect — find any VLH-related queries
const q5 = await gqlFetch('IntrospectVlh', `
  query IntrospectVlh {
    __schema {
      queryType {
        fields {
          name
          description
        }
      }
    }
  }
`);
console.log(`  Introspection → ${q5.status}`);
if (q5.json?.data?.__schema?.queryType?.fields) {
  const vlhFields = q5.json.data.__schema.queryType.fields
    .filter(f => /vlh/i.test(f.name) || /configuration/i.test(f.name));
  if (vlhFields.length) {
    console.log('  VLH/config-related query fields:');
    vlhFields.forEach(f => console.log(`    ${f.name}: ${f.description || ''}`));
  } else {
    console.log('  No VLH fields found in schema (or introspection disabled)');
    // Show all fields for manual review
    const all = q5.json.data.__schema.queryType.fields.map(f => f.name);
    console.log('  All query fields:', all.join(', '));
  }
}

console.log('\nDone.');
